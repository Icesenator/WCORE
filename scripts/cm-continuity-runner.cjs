// cm-continuity-runner.cjs — owner PERSISTANT project-owned pour la boucle CM WCORE (WC-01).
// P1-GOV-CM-PERSISTENT-OWNER.
//
// Role : a cadence bornee, garder la surface X @WCORExyz OPERATIONNELLE, decider si un cycle CM
// autonome est justifie, et (opt-in) re-invoquer l'agent OpenCode en SINGLE-FLIGHT. Ne publie JAMAIS.
//
// INVARIANTS :
// - AUCUNE publication X : aucun chemin reply/submit/like/follow/DM. Read-only X.
// - Aucun secret, aucun PID/runtime ID reel dans la sortie/heartbeat/lease.
// - Re-invocation agent GATED (CM_INVOKE_AGENT=1) + SINGLE-FLIGHT (lease durable) + cooldown + backoff.
// - Idempotent et reversible : ecrit uniquement sous .generated/cm-continuity/.
// - Un tick arrivant pendant un child actif : AGENT_ALREADY_ACTIVE -> SKIP -> heartbeat -> exit.
//
// Usage :
//   node scripts/cm-continuity-runner.cjs [--tick=N] [--interval-ms=600000] [--no-heal] [--invoke]
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// OUT_DIR surchargeable (tests isoles) ; defaut = etat runtime de production.
const OUT_DIR = process.env.CM_CONTINUITY_DIR ? path.resolve(process.env.CM_CONTINUITY_DIR) : path.join(ROOT, '.generated', 'cm-continuity');
const HEARTBEAT = path.join(OUT_DIR, 'heartbeat.json');
const WAKE = path.join(OUT_DIR, 'wake-request.json');
const LEASE = path.join(OUT_DIR, 'agent-lease.json');
const COMMANDS_LOG = path.join(OUT_DIR, 'commands.log');
const CHILD_LOG = path.join(OUT_DIR, 'agent-child.log');
const CHILD_PID = path.join(OUT_DIR, 'child.pid');
const PATROL_SPEC = path.join(OUT_DIR, 'patrol-spec.txt');
const X_LEDGER = path.join(OUT_DIR, 'x-observation-ledger.jsonl');
// ADMISSION GLOBALE WC-01 : porte d'entree UNIQUE et ATOMIQUE pour TOUT child/chemin project-owned
// (scheduler, relance manuelle, second chemin, retry, recovery). Distingue l'INCIDENT (11:38-11:45 :
// un second enfant a tourne sans passer par la lease du runner) du simple cron. Ce n'est PAS le cron.
const ADMISSION = path.join(OUT_DIR, 'admission.json');
// P1-GOV-CM-PERSISTENT-OWNER (reouvert, WC-01 session-proliferation) : session PRIMAIRE de continuite.
// Chaque wake normal DOIT reprendre la MEME session logique (opencode-run --session <id>), JAMAIS creer
// une session par wake. L'ID reel ne vit QUE ici (runtime local, jamais heartbeat/log/docs exportables).
const PRIMARY_SESSION = path.join(OUT_DIR, 'primary-session.json');
const PRIMARY_TITLE = 'WC-01-continuity-primary';
const CANONICAL_TITLE = 'WCORE CM';
const LEGACY_WAKE_TITLES = ['WC-01-continuity-wake', 'WC-01 continuity wake', PRIMARY_TITLE];
const STALE_ADMISSION_MS = 20 * 60 * 1000;   // patrol complet ~8 min ; au-dela = holder considere mort (reprise BORNEE)
// P1-GOV-CM-PERSISTENT-OWNER (REOPEN_REASON=FAILED_WAKE_RECOVERY_LATENCY_GAP) : un holder d'admission
// PROUVE MORT (PID enregistre non vivant) ne doit PAS attendre le TTL 20 min -> fast reclaim.
// UNKNOWN (liveness indeterminable) reste fail-closed : TTL complet conserve.
const DEAD_HOLDER_GRACE_MS = 90 * 1000;      // plancher avant reclaim d'un holder PID-prouve-mort (anti-course au demarrage)
const STATE = path.join(ROOT, 'review-context.md');
const CDP_ENDPOINT = 'http://127.0.0.1:9222';
const OWNER = 'WCORE_CM_CONTINUITY_OWNER';
const INVOCATION_SOURCE = 'CM_CONTINUITY_OWNER';

// Bornes de surete (project-owned, documentees, sans secret).
// P1-GOV-CM-PERSISTENT-OWNER (reouvert) : ACTIVE_CM_PATROL_POLICY. Le success cooldown de 30 min
// est SUPPRIME (il creait des trous de couverture). Un natural owner tick sans child actif doit
// produire un PATROL_WAKE des que le dernier patrol complet date de >= PATROL_INTERVAL.
const LEASE_STALE_MS = 45 * 60 * 1000;                 // lease consideree stale apres 45 min (crash recovery)
const PATROL_INTERVAL_MS = 3 * 60 * 1000;              // trigger = age de FRAICHEUR X pour un patrol. REGLE DURE : PATROL_INTERVAL_MS <= PATROL_MAX_STALENESS_MS (15 min) - periode de tick (12 min) = 3 min. Sinon un tick est SAUTE (MONITOR_TICK_NOT_PATROL_DUE) et le prochain child n'observe X que ~12 min plus tard => gap reel ~15+ min > borne 15 min (defaut observe 2026-09-15 : 8/13 cycles en breach, 16-45 min). La cadence EFFECTIVE reste bornee par le tick (12 min).
const PATROL_MAX_STALENESS_MS = 15 * 60 * 1000;        // borne dure de fraicheur d'observation CM
const PATROL_MIN_GAP_MS = 2 * 60 * 1000;               // anti-duplication immediate (remplace l'ancien success cooldown 30 min)
const FAILURE_BACKOFF_BASE_MS = 15 * 60 * 1000;
const FAILURE_BACKOFF_MAX_MS = 120 * 60 * 1000;
// P1-GOV-CM-PERSISTENT-OWNER (REOPEN_REASON=PATROL_RUNTIME_CADENCE_GAP) : bornes de runtime child.
// Un cycle NO_ACTION (sans gate public) doit tenir dans un budget qui laisse une marge avant le tick suivant.
const NO_ACTION_RUNTIME_TARGET_MS = 9 * 60 * 1000;       // cible
const NO_ACTION_RUNTIME_HARD_BUDGET_MS = 10 * 60 * 1000; // plafond dur (au-dela : refresh X + self-mark + exit)
const FAST_X_REFRESH_AFTER_MS = 8 * 60 * 1000;           // refresh X borne si le cycle dure
const POST_PATROL_LINGER_TARGET_MS = 2 * 60 * 1000;      // self-mark -> child exit
// Child mort INSTANTANEMENT = panne provider transitoire, pas un patrol : sinon le slot de 12 min est
// consomme pour rien et la couverture X depasse 15 min. Retry unique, DANS la meme admission.
const CHILD_INSTANT_DEATH_MS = 60 * 1000;                // < 60 s = mort instantanee (pas un vrai cycle)
const CHILD_RETRY_DELAY_MS = 20 * 1000;                  // backoff court avant le retry unique

function parseArgs(argv) {
  const a = { guardCheck: false, coverageLedger: false, budgetMs: 0, now: null, tick: 1, intervalMs: 600000, heal: true, invoke: process.env.CM_INVOKE_AGENT === '1', maxHeals: 3, releaseLease: false, releaseReason: null, patrolComplete: false, xObserved: false, admit: false, admitRelease: false, admitStatus: false, primaryStatus: false, token: null };
  for (const t of argv.slice(2)) {
    if (t.startsWith('--tick=')) a.tick = Math.max(1, parseInt(t.slice(7), 10) || 1);
    else if (t.startsWith('--interval-ms=')) a.intervalMs = Math.max(5000, parseInt(t.slice(13), 10) || 600000);
    else if (t === '--no-heal') a.heal = false;
    else if (t === '--invoke') a.invoke = true;
    else if (t === '--release-lease') a.releaseLease = true;
    else if (t === '--admit') a.admit = true;
    else if (t === '--admit-release') a.admitRelease = true;
    else if (t === '--admit-status') a.admitStatus = true;
    else if (t === '--primary-status') a.primaryStatus = true;
    else if (t === '--x-observed') a.xObserved = true;
    else if (t === '--guard-check') a.guardCheck = true;
    else if (t === '--coverage-ledger') a.coverageLedger = true;
    else if (t.startsWith('--budget-ms=')) a.budgetMs = Math.max(0, parseInt(t.slice(12), 10) || 0);
    else if (t.startsWith('--now=')) a.now = t.slice(6);
    else if (t.startsWith('--token=')) a.token = t.slice(8);
    else if (t.startsWith('--source=')) a.source = t.slice(9);
  else if (t.startsWith('--pid=')) a.pid = parseInt(t.slice(6), 10) || null;
    else if (t.startsWith('--release-reason=')) a.releaseReason = t.slice(17);
    else if (t === '--patrol-complete') a.patrolComplete = true;
    else if (t.startsWith('--max-heals=')) a.maxHeals = Math.max(0, parseInt(t.slice(12), 10) || 0);
  }
  return a;
}

function ensureDir() { try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch (_) {} }
function stripBom(s) { return typeof s === 'string' ? s.replace(/^/, '') : s; }
function readTextSafe(p) { try { return stripBom(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }
function readJsonSafe(p) { const s = readTextSafe(p); try { return JSON.parse(s); } catch (_) { return null; } }
function writeJson(p, o) { ensureDir(); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8'); }
function appendLog(line) { try { ensureDir(); fs.appendFileSync(COMMANDS_LOG, line + '\n', 'utf8'); } catch (_) {} }
// Token opaque d'admission (nonce) : JAMAIS un PID/path/credential. Sert d'exclusivite GLOBALE.
function randomToken() { try { return require('crypto').randomBytes(9).toString('hex'); } catch (_) { return 'tok' + Date.now() + Math.floor(Math.random() * 1e6); } }
function tokenPrefix(t) { return t ? String(t).slice(0, 10) : null; }

function httpGetSync(url, timeoutMs) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
    `try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec ${Math.ceil(timeoutMs / 1000)} '${url}').Content } catch { '' }`],
    { encoding: 'utf8', timeout: timeoutMs + 4000, windowsHide: true });
  return (r.stdout || '').trim();
}

function checkXSurface() {
  const body = httpGetSync(`${CDP_ENDPOINT}/json/version`, 5000);
  if (!body) return { cdp: false, browser: null };
  try { const j = JSON.parse(body); return { cdp: true, browser: j.Browser || null }; }
  catch (_) { return { cdp: true, browser: null }; }
}

// Self-heal du navigateur CM project-owned (profil disque preserve). Ne publie rien.
// Le launcher reste attache : on le lance detache pour ne pas bloquer le tick.
function healXSurface() {
  const launcher = path.join(ROOT, 'wcore-web', 'scripts', 'chrome-cdp.js');
  if (!fs.existsSync(launcher)) return { healed: false, reason: 'LAUNCHER_MISSING' };
  appendLog('heal launch chrome-cdp start');
  try {
    const child = spawn('node', [launcher, 'start', 'https://x.com/WCORExyz'],
      { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch (e) { return { healed: false, reason: 'LAUNCH_FAILED' }; }
  for (let i = 0; i < 12; i++) {
    const s = checkXSurface();
    if (s.cdp) return { healed: true, browser: s.browser };
    spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 2000'], { timeout: 8000, windowsHide: true });
  }
  return { healed: false, reason: 'CDP_STILL_DOWN' };
}

function runDecider() {
  const decider = path.join(ROOT, 'scripts', 'cm-continuity-owner.cjs');
  if (!fs.existsSync(decider)) return { decision: { mode: 'UNKNOWN_NEEDS_EVIDENCE', reinvoke: false, reason: 'DECIDER_MISSING' } };
  const r = spawnSync('node', [decider, `--state=${STATE}`], { encoding: 'utf8', timeout: 30000, cwd: ROOT, windowsHide: true });
  let out = null;
  try { out = JSON.parse((r.stdout || '').trim()); } catch (_) { out = null; }
  if (!out || !out.decision) return { decision: { mode: 'UNKNOWN_NEEDS_EVIDENCE', reinvoke: false, reason: 'DECIDER_NO_OUTPUT' } };
  return out;
}

// ---- Single-flight lease (project-owned, recoverable apres crash) ----
function readLease() { return readJsonSafe(LEASE); }

function leaseActive(nowMs) {
  const l = readLease();
  if (!l || l.status !== 'ACTIVE') return { active: false, lease: l };
  const age = nowMs - new Date(l.acquiredAt).getTime();
  if (age > LEASE_STALE_MS) return { active: false, stale: true, lease: l, age };
  return { active: true, lease: l, age };
}

function acquireLease(nowIso, decision, wakeType) {
  const l = {
    status: 'ACTIVE', owner: OWNER, invocation_source: INVOCATION_SOURCE,
    acquiredAt: nowIso, lastSeenAt: nowIso, decision: decision.mode, decisionReason: decision.reason,
    wake_type: wakeType || 'UNKNOWN', childPidAlias: 'CM_CHILD_1', publication: 'NONE',
  };
  writeJson(LEASE, l);
  return l;
}

function releaseLease(outcome) {
  const l = readLease() || {};
  l.status = 'RELEASED';
  l.releasedAt = new Date().toISOString();
  l.outcome = outcome;
  writeJson(LEASE, l);
  return l;
}

function touchLease() {
  const l = readLease();
  if (l && l.status === 'ACTIVE') { l.lastSeenAt = new Date().toISOString(); writeJson(LEASE, l); }
}

// ---- ADMISSION GLOBALE WC-01 (atomique, fail-closed, reprise bornee) ----
// Distingue le cron Windows (IgnoreNew) de l'EXCLUSION GLOBALE entre TOUS les chemins d'entree
// project-owned. Un seul child WC-01 admis a la fois, quel que soit le chemin. L'exclusivite repose
// sur la CREATION EXCLUSIVE atomique du fichier ('wx') : un seul createur gagne (EEXIST pour l'autre).
function readAdmission() { return readJsonSafe(ADMISSION); }

// Tente d'acquerir l'admission globale. token = identifiant opaque du child (nonce, JAMAIS un PID reel).
// pid = PID du PROCESS detenteur (runner) pour prouver sa mort ulterieurement (fast dead-holder recovery).
// Retour : { ok, reason, admission }. Fail-closed : toute ambiguite (lecture/creation) => refus.
function acquireAdmission(token, source, pid) {
  const now = new Date();
  const mk = () => ({ token, source: source || 'unknown', pid: pid || null, acquiredAt: now.toISOString(),
    lastSeenAt: now.toISOString(), publication: 'NONE' });
  // 1) Tentative d'acquisition exclusive (atomique).
  try {
    ensureDir();
    const fd = fs.openSync(ADMISSION, 'wx');       // EEXIST si un child est deja admis
    try { fs.writeFileSync(fd, JSON.stringify(mk(), null, 2) + '\n', 'utf8'); } finally { try { fs.closeSync(fd); } catch (_) {} }
    return { ok: true, reason: 'ADMITTED', admission: readAdmission() };
  } catch (e) {
    if (e && e.code !== 'EEXIST') return { ok: false, reason: 'ADMISSION_ERROR_FAIL_CLOSED', code: e.code };
  }
  // 2) Conflit : un holder existe. Staleness BORNEE seulement si le runner detenteur est vraiment mort.
  const cur = readAdmission();
  if (!cur) { try { fs.unlinkSync(ADMISSION); } catch (_) {} return { ok: false, reason: 'ADMISSION_READ_FAIL_CLOSED' }; }
  if (cur.token === token) return { ok: true, reason: 'ALREADY_HELD_BY_ME', admission: cur };  // idempotent
  const age = Date.now() - new Date(cur.acquiredAt).getTime();
  // 2a) FAST DEAD-HOLDER RECOVERY (P1 FAILED_WAKE_RECOVERY_LATENCY_GAP) : le PID enregistre du holder
  // est PROUVE MORT (et non UNKNOWN) => reclaim immediat SANS attendre le TTL 20 min. Une liveness
  // INDETERMINABLE (null) n'est JAMAIS un motif de reclaim (fail-closed).
  const holderLiveness = cur.pid ? pidAlive(cur.pid) : null;
  if (holderLiveness === false && age >= DEAD_HOLDER_GRACE_MS) {
    return reclaimAdmission(token, cur, now, 'DEAD_HOLDER_PROVEN', pid);
  }
  const holderChildAlive = childAlive();
  if (age <= STALE_ADMISSION_MS || holderChildAlive || holderLiveness === true) {
    return { ok: false, reason: 'DENIED_ALREADY_ACTIVE', admission: cur, ageMs: age, holder_liveness: holderLiveness === null ? 'UNKNOWN' : (holderLiveness ? 'ALIVE' : 'DEAD') };
  }
  // 3) Stale ET aucun processus vivant associe => reprise ATOMIQUE bornee (rename exclusif du fichier mort).
  return reclaimAdmission(token, cur, now, 'STALE_TTL', pid);
}

// Reprise ATOMIQUE bornee d'une admission morte : rename exclusif (un seul vainqueur) puis creation neuve.
function reclaimAdmission(token, cur, now, cause, pid) {
  try {
    const stale = ADMISSION + '.stale.' + Date.now();
    fs.renameSync(ADMISSION, stale);                // un seul vainqueur du rename ; les autres EBUSY/EEXIST
    try { fs.unlinkSync(stale); } catch (_) {}
  } catch (_) { return { ok: false, reason: 'ADMISSION_RECOVERY_RACE_FAIL_CLOSED' }; }
  try {
    const fd = fs.openSync(ADMISSION, 'wx');
    const rec = { token, source: 'scheduler', pid: pid || null, acquiredAt: now.toISOString(),
      lastSeenAt: now.toISOString(), publication: 'NONE', recoveredFrom: cur ? cur.token : null, recoveredAt: now.toISOString(), recoveredCause: cause };
    try { fs.writeFileSync(fd, JSON.stringify(rec, null, 2) + '\n', 'utf8'); } finally { try { fs.closeSync(fd); } catch (_) {} }
    appendLog(`admission ${cause === 'DEAD_HOLDER_PROVEN' ? 'dead-holder-recovery' : 'stale-recovery'} token_new=${String(token).slice(0, 8)} ageMs=${cur ? Date.now() - new Date(cur.acquiredAt).getTime() : 'na'}`);
    return { ok: true, reason: cause === 'DEAD_HOLDER_PROVEN' ? 'ADMITTED_AFTER_DEAD_HOLDER_RECOVERY' : 'ADMITTED_AFTER_STALE_RECOVERY', admission: readAdmission() };
  } catch (e) { return { ok: false, reason: 'ADMISSION_RECOVERY_RACE_FAIL_CLOSED', code: e && e.code }; }
}

function releaseAdmission(token) {
  const cur = readAdmission();
  if (!cur) { return { released: false, reason: 'NO_ADMISSION' }; }
  if (cur.token !== token) { return { released: false, reason: 'TOKEN_MISMATCH_KEEP', admission: cur }; } // ne libere JAMAIS l'admission d'un autre
  try { fs.unlinkSync(ADMISSION); } catch (_) { return { released: false, reason: 'UNLINK_FAIL' }; }
  return { released: true, releasedAt: new Date().toISOString() };
}

function verifyAdmission(token) {
  const cur = readAdmission();
  if (!cur) return { held: false, reason: 'NO_ADMISSION' };
  if (cur.token !== token) return { held: false, reason: 'NOT_MY_ADMISSION', admission: cur };
  cur.lastSeenAt = new Date().toISOString();
  try { writeJson(ADMISSION, cur); } catch (_) {}
  return { held: true, reason: 'HELD', admission: cur };
}

// Commande de fin de child : libere la lease (le child l'appelle a la fin REELLE de son turn).
function releaseLeaseCommand(reason) {
  const l = readLease();
  if (!l || l.status !== 'ACTIVE') return { released: false, reason: 'NO_ACTIVE_LEASE' };
  const r = releaseLease(reason || 'CHILD_COMPLETED');
  appendLog(`lease released by${reason ? ' ' + reason : ' command'}`);
  return { released: true, releasedAt: r.releasedAt };
}

// ---- Gating du wake : pas d'agent a chaque tick ----
// PROCESS_LIVENESS_IS_NOT_COVERAGE : un process vivant ne prouve PAS une observation X fraiche.
// FRESH_X_OBSERVATION_IS_COVERAGE : seul LAST_X_OBSERVATION_AT (avance par une vraie lecture X) compte.
function readPipelineState() {
  const hb = readJsonSafe(HEARTBEAT) || {};
  return {
    lastWakeAt: hb.last_wake_at || null,
    lastFullPatrolAt: hb.last_full_cm_patrol_at || null,          // metrique de COMPLETION (pas d'observation X)
    lastXObservationAt: hb.last_x_observation_at || null,        // horloge de FRAICHEUR reelle
    patrolSelfMarkAt: hb.patrol_self_mark_at || null,
    childStartedAt: hb.child_started_at || null,
    lastSignalFingerprint: hb.last_signal_fingerprint || null,
    consecutiveFailures: typeof hb.consecutive_failures === 'number' ? hb.consecutive_failures : 0,
  };
}

// LAST_X_OBSERVATION_AT n'avance QUE sur une vraie lecture X reussie (auth/surface + notifications +
// mentions + with_replies + timeline) faite par le child admis. JAMAIS sur heartbeat, ping CDP, discovery
// web seule, process vivant, ni self-mark. Un token est exige (fail-closed) pour empecher un faux marquage.
// Garde CHILD-SIDE de fraicheur X.
// Cause prouvee (REOPEN_REASON=LONG_CHILD_BLOCKS_X_REFRESH) : le resident parent attend le child
// via spawnSync ; pendant un child long il ne peut NI ticker NI appliquer X_REFRESH_SOFT_MS.
// Mesure reelle : gaps X de 20,99 et 16,72 min > borne 15 min. Le controle ne peut donc PAS
// dependre du parent : le CHILD doit, AVANT chaque micro-etape potentiellement longue et a chaque
// checkpoint : (1) calculer l age reel de LAST_X_OBSERVATION_AT ; (2) budgeter la micro-etape ;
// (3) si age >= seuil doux OU si age+budget > borne dure => suspendre le non-CM, faire une VRAIE
// lecture X, qualifier, puis --x-observed (JAMAIS sans lecture reelle), puis reprendre.
const CHILD_X_SOFT_MS = 12 * 60 * 1000;   // seuil doux : preparer/anticiper le refresh
const CHILD_X_HARD_MS = 15 * 60 * 1000;   // borne dure : ne jamais la franchir

function childFreshnessBudget(xAtMs, nowMs, nextStepBudgetMs, softMs, hardMs) {
  const soft = softMs || CHILD_X_SOFT_MS;
  const hard = hardMs || CHILD_X_HARD_MS;
  const age = nowMs - xAtMs;
  const budget = Math.max(0, nextStepBudgetMs || 0);
  const projected = age + budget;
  const atOrAboveSoft = age >= soft;
  const crossesHard = projected > hard;
  const mustRefresh = atOrAboveSoft || crossesHard;
  return {
    action: mustRefresh ? 'REFRESH_X_NOW' : 'CONTINUE_NON_CM',
    must_refresh: mustRefresh,
    reason: atOrAboveSoft ? 'AGE_AT_OR_ABOVE_SOFT' : (crossesHard ? 'PROJECTED_TO_CROSS_HARD' : 'WITHIN_BUDGET'),
    x_age_ms: age,
    x_age_min: Number((age / 60000).toFixed(2)),
    next_step_budget_ms: budget,
    projected_age_ms: projected,
    projected_age_min: Number((projected / 60000).toFixed(2)),
    soft_ms: soft,
    hard_ms: hard,
    real_x_read_required: true,
    resume_after_refresh: mustRefresh,
  };
}
// Ledger deterministe des observations X : tout depassement de la borne devient TRACABLE
// (donc non silencieux). Fonction PURE => testable sans runtime.
function coverageLedgerEntry(prevIso, atIso, hardMs) {
  const prev = Date.parse(prevIso);
  const at = Date.parse(atIso);
  const hard = hardMs || CHILD_X_HARD_MS;
  const gapMs = (Number.isFinite(prev) && Number.isFinite(at)) ? (at - prev) : null;
  return {
    prev_at: Number.isFinite(prev) ? new Date(prev).toISOString() : null,
    at: Number.isFinite(at) ? new Date(at).toISOString() : null,
    gap_ms: gapMs,
    gap_min: gapMs === null ? null : Number((gapMs / 60000).toFixed(2)),
    hard_ms: hard,
    violation: gapMs !== null ? gapMs > hard : false,
  };
}
function appendXObservationLedger(entry) {
  try { ensureDir(); fs.appendFileSync(X_LEDGER, JSON.stringify(entry) + '\n', 'utf8'); } catch (_) {}
}
function readXObservationLedger() {
  try {
    return fs.readFileSync(X_LEDGER, 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

function markXObservation(atIso, source, token) {
  if (token) { const v = verifyAdmission(token); if (!v.held) return { ok: false, reason: 'ADMISSION_NOT_HELD', at: null }; }
  const hb = readJsonSafe(HEARTBEAT) || {};
  // Ledger : tout gap > borne dure devient TRACABLE (donc non silencieux).
  appendXObservationLedger(coverageLedgerEntry(hb.last_x_observation_at, atIso || new Date().toISOString()));
  hb.last_x_observation_at = atIso || new Date().toISOString();
  hb.last_x_observation_source = source || 'CHILD_REAL_X_READ';
  writeJson(HEARTBEAT, hb);
  appendLog(`x-observed at=${hb.last_x_observation_at} source=${hb.last_x_observation_source}`);
  return { ok: true, at: hb.last_x_observation_at };
}

// Marqueur durable : n'avance QU'APRES un vrai patrol CM complet (VERIFY X -> notifications ->
// mentions -> replies -> surface -> qualification -> discovery fraiche). Jamais sur un simple
// heartbeat, un ping CDP, un owner tick, ni un child crash avant patrol complet.
// Distingue FULL_PATROL_COMPLETED_AT (fin travail) et PATROL_SELF_MARK_AT (appel --patrol-complete).
function markPatrolComplete(atIso, source) {
  const now = atIso || new Date().toISOString();
  const hb = readJsonSafe(HEARTBEAT) || {};
  hb.last_full_cm_patrol_at = now;         // metrique de completion (conserve compat)
  hb.full_patrol_completed_at = now;
  hb.patrol_self_mark_at = now;
  hb.last_full_cm_patrol_source = source || 'OWNER_CHILD_EXIT_OK';
  writeJson(HEARTBEAT, hb);
  appendLog(`patrol-complete at=${hb.last_full_cm_patrol_at} source=${hb.last_full_cm_patrol_source}`);
  return hb.last_full_cm_patrol_at;
}

// POST_PATROL_LINGER : temps entre PATROL_SELF_MARK_AT et CHILD_EXIT_AT. Un process vivant apres le
// travail utile n'est PAS de la couverture. Pur (testable sans process).
function computePostPatrolLingerMs(selfMarkAtIso, exitIso) {
  if (!selfMarkAtIso || !exitIso) return null;
  const d = new Date(exitIso).getTime() - new Date(selfMarkAtIso).getTime();
  return Number.isFinite(d) ? Math.max(0, d) : null;
}

function readChildPid() {
  const s = readTextSafe(CHILD_PID);
  const pid = s ? parseInt(s.trim(), 10) : NaN;
  return Number.isFinite(pid) ? pid : null;
}

function childAlive() {
  const pid = readChildPid();
  if (!pid) return false;
  return pidAlive(pid) === true;   // UNKNOWN/null => non vivant (jamais "mort prouve" ailleurs)
}

// Liveness d'un PID arbitraire (holder d'admission enregistre). TRUE=alive, FALSE=mort prouve,
// null=indeterminable (jamais traite comme "mort" => fail-closed, TTL normal conserve).
function pidAlive(pid) {
  if (!pid) return null;
  const p = parseInt(String(pid), 10);
  if (!Number.isFinite(p)) return null;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    `if (Get-Process -Id ${p} -ErrorAction SilentlyContinue) { 'ALIVE' } else { 'DEAD' }`],
    { encoding: 'utf8', timeout: 8000, windowsHide: true });
  if (/ALIVE/.test(r.stdout || '')) return true;
  if (/DEAD/.test(r.stdout || '')) return false;
  return null;
}

// --- SESSION PRIMAIRE : reuse pendant le wake normal (P1-GOV-CM-PERSISTENT-OWNER / session-proliferation) ---
// Store local project-owned : l'ID reel ne sort JAMAIS d'ici (alias SESSION_PRIMARY dans heartbeat/log/docs).
function opencodeDbPath() {
  if (process.env.CM_OPENCODE_DB) return process.env.CM_OPENCODE_DB;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return path.join(home, '.local', 'share', 'opencode', 'opencode.db');
}
// Lit la DB opencode en LECTURE SEULE (aucune ecriture). Retourne null si indisponible (=> inconnu, jamais bloquant).
function opencodeDb() {
  try { const { DatabaseSync } = require('node:sqlite'); return new DatabaseSync(opencodeDbPath(), { readOnly: true }); }
  catch (_) { return null; }
}
function wcoreSessionCount() {
  const db = opencodeDb(); if (!db) return null;
  try { return db.prepare("SELECT COUNT(*) n FROM session WHERE directory=?").get(String(ROOT).replace(/\\/g, '/')).n; }
  catch (_) { return null; } finally { try { db.close(); } catch (_) {} }
}
function sessionExists(id) {
  if (!id) return null;
  const db = opencodeDb(); if (!db) return null;
  try { return !!db.prepare('SELECT 1 x FROM session WHERE id=? LIMIT 1').get(String(id)); }
  catch (_) { return null; } finally { try { db.close(); } catch (_) {} }
}
// Plus recente session WCORE EXISTANTE parmi les titres de continuite connus (adoption SANS creation).
// On ne retient qu'une session reellement presente en DB (jamais adopter une id morte).
function latestContinuitySessionId() {
  const db = opencodeDb(); if (!db) return null;
  let rows = [];
  try {
    const dir = String(ROOT).replace(/\\/g, '/');
    // PRIORITE 1 : la CONVERSATION PRINCIPALE canonique (titre CANONICAL_TITLE, la plus ANCIENNE du
    // directory = conversation historique de l'operateur). On n'adopte JAMAIS un artefact de continuity en premier.
    rows = db.prepare('SELECT id FROM session WHERE directory=? AND title=? ORDER BY time_created ASC LIMIT 5').all(dir, CANONICAL_TITLE);
    // PRIORITE 2 (repli seulement) : anciens titres de continuity (adoption seule, creation interdite).
    if (!rows.length) {
      const ph = LEGACY_WAKE_TITLES.map(() => '?').join(',');
      rows = db.prepare(`SELECT id FROM session WHERE directory=? AND title IN (${ph}) ORDER BY time_created DESC LIMIT 20`).all(dir, ...LEGACY_WAKE_TITLES);
    }
  } catch (_) { return null; } finally { try { db.close(); } catch (_) {} }
  for (const r of rows) { if (sessionExists(r.id)) return r.id; }
  return null;
}
function readPrimaryId() {
  const o = readJsonSafe(PRIMARY_SESSION);
  const id = o && typeof o.session_id === 'string' ? o.session_id : null;
  return id && /^ses_/.test(id) ? id : null;
}
function writePrimaryId(id, origin) {
  if (!id || !/^ses_/.test(String(id))) return false;
  const prev = readJsonSafe(PRIMARY_SESSION) || {};
  writeJson(PRIMARY_SESSION, {
    alias: 'SESSION_PRIMARY', session_id: String(id), origin: origin || 'UNKNOWN',
    directory: String(ROOT).replace(/\\/g, '/'),
    created_at: prev.created_at || new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  return true;
}
// RESUMÉ de sante (masque) : expose l'alias + un prefixe court, JAMAIS l'ID reel complet.
function primaryStatus() {
  const id = readPrimaryId();
  return { alias: id ? 'SESSION_PRIMARY' : null, has_primary: !!id, session_id_prefix: id ? String(id).slice(0, 8) : null, exists_in_db: id ? sessionExists(id) : null };
}

// Re-invocation SYNCHRONE de l'agent OpenCode. L'instance de la tache planifiee ATTEND la fin du
// child (sinon Task Scheduler tue l'arbre quand l'action se termine). Single-flight = lease +
// MultipleInstances=IgnoreNew. La sortie est capturee dans CHILD_LOG (fd herite). L'owner ne publie rien.
function invokeAgentSync(decision, wakeType, admToken) {
  // Spec de patrol detaillee ecrite dans un fichier durable (le message inline reste COURT et fiable).
  const spec = [
    `PATROL CM COMPLET OBLIGATOIRE (child WC-01 = Community Manager permanent de X @WCORExyz).`,
    `Ce n'est PAS un simple check de signal : tu dois ACTIVEMENT relire X et chercher ce qui a pu apparaitre.`,
    `ADMISSION GLOBALE WC-01 : UN SEUL child WC-01 a la fois, TOUS chemins confondus. Ton ticket d'admission = ${admToken || 'ABSENT'} (aussi dans l'env CM_ADMISSION_TOKEN).`,
    `0) AVANT TOUT TRAVAIL X : verifie l'admission en LECTURE SEULE -> node scripts/cm-continuity-runner.cjs --admit-status --token=${admToken || 'ABSENT'} ; si held=false => ARRETE-TOI IMMEDIATEMENT (0 lecture/action X, 0 ecriture de doc CURRENT, 0 publication). N'appelle PAS --admit (l'admission est deja detenue par l'owner pour toi).`,
    `FRAICHEUR REELLE : la metrique de couverture est LAST_X_OBSERVATION_AT, PAS le process vivant. La couverture n'est vraie que si X est REELLEMENT relu.`,
    `ETAPES — LECTURE X D'ABORD (la fraicheur reelle est la priorite), PUIS le reste :`,
    `1) VERIFY surface X project-owned (CDP 127.0.0.1:9222) + auth (bouton 'Editer le profil').`,
    `2) notifications fraiches.`,
    `3) mentions fraiches.`,
    `4) with_replies / conversations actives.`,
    `X_OBSERVED (TRES TOT, vise <=3 min apres le start) : DES QUE auth + notifications + mentions + with_replies sont lues (en CDP BRUT si connectOverCDP rame ; ne paie PAS plusieurs fois 20-30 s), execute IMMEDIATEMENT node scripts/cm-continuity-runner.cjs --x-observed --token=${admToken || 'ABSENT'}. C'est la SEULE action qui avance LAST_X_OBSERVATION_AT (ping CDP, heartbeat, discovery web seule, self-mark NE comptent PAS). Si tu ne stamps pas tot, la couverture reelle est consideree BRECHEE.`,
    `5) timeline / posts recents + D si pertinent.`,
    `6) RESTORE etat disque LUEGER : ne relis PAS tout review-context.md (huge) ; lit seulement son en-tete + la ligne LAST_CM_OBSERVATION, plus les preuves durables utiles. ROADMAP seulement si besoin.`,
    `7) rechercher de NOUVEAUX entrants/opportunites.`,
    `8) AU MAXIMUM UNE discovery FRAICHE et bornee (rotation d'angle, 1 requete live) : permissions/delegated execution, session keys, read-only verification, wallet observability, simulation/signing, account abstraction, onchain permission boundaries, portfolio/state freshness, semantic integrity, security UX.`,
    `NO_DEEP_RESEARCH_MONOPOLIZING_PATROL : pas de recherche profonde multi-requetes dans un cycle NO_ACTION ; consigne le curseur/editorial au backlog et differe le reste.`,
    `9) QUALIFIER chaque entrant (QUALIFIED_REPLY_OPPORTUNITY / QUALIFIED_COMMUNITY_SIGNAL / ALREADY_COVERED / REDUNDANT / SPAM / IRRELEVANT / UNKNOWN).`,
    `10) ACT seulement si gate NET (R-024) : pertinent WCORE, apport marginal reel, exact, non redondant, non paraphrase, aucune claim non sourcee.`,
    `PUBLIC_ACTION_FAIL_CLOSED_CONCURRENCY : avant TOUTE action publique (reply/post/like/follow/direct message), re-verifie l'admission (--admit-status) ; si tu ne la detiens plus => NE PUBLIE PAS (aucune double action possible).`,
    `FICHIERS TEMPORAIRES : utilise un nom invocation-scoped (prefixe du token CM_ADMISSION_TOKEN) ou le dossier Temp/opencode ; JAMAIS un nom fixe partage (ex. scripts/_patrol.tmp.cjs).`,
    `BUDGET NO_ACTION : cible <= 9 min, plafond dur <= 10 min (le tick naturel est ~12 min : il faut une marge pour exit/release). Si le budget approche : termine la verification X essentielle, au plus une discovery, persiste le curseur, self-mark, exit.`,
    `CYCLE LONG : si elapsed_since_LAST_X_OBSERVATION approche 10-12 min (ou un vrai travail qualifie l'exige), fais un FAST_X_REFRESH borne (notifications + mentions + with_replies, read-only) puis re-execute --x-observed. Un child long ne compte comme couverture QUE s'il produit de vraies observations fraiches.`,
    `CONNECTOR : si le connecteur Playwright connectOverCDP est lent/timeout, fais UN probe borne court puis bascule sur le CDP BRUT read-only (WebSocket Runtime.evaluate). NE PAIS pas 20-30 s plusieurs fois. NE REDEMARRE PAS Chrome si CDP_UP + AUTH_READ + RAW_CDP_WORKS. PLAYWRIGHT_CONNECTOR_DEGRADED != CM_BROWSER_DOWN.`,
    `11) CHECKPOINT seulement si changement materiel.`,
    `NO_ACTION != NO_WORK : un cycle avec PUBLIC_ACTIONS=0 reste un cycle CM utile s'il a relu X, verifie les entrants, fait une discovery fraiche et qualifie.`,
    `TIME GATE : si now >= gate D 24h, ajouter UNE observation D (vues/replies/likes/reposts/bookmarks-si-rendu-sinon-UNKNOWN), timestamp reel, JAMAIS antidate.`,
    `FIN DE CYCLE : si le cycle a dure >8 min depuis la derniere lecture X essentielle, fais un DERNIER fast refresh X borne (notifications + mentions + with_replies) PUIS node scripts/cm-continuity-runner.cjs --x-observed --token=${admToken || 'ABSENT'}, PUIS : node scripts/cm-continuity-runner.cjs --patrol-complete (pose FULL_PATROL_COMPLETED_AT + PATROL_SELF_MARK_AT).`,
    `NO_MORE_X_MUTATION_AFTER_SELF_MARK=TRUE ; NO_MORE_REVIEW_CONTEXT_MUTATION_AFTER_SELF_MARK=TRUE ; EXIT_AS_SOON_AS_POSSIBLE=TRUE (pas de travail apres le self-mark : un process vivant apres le travail utile n'est PAS de la couverture).`,
    `Rendre la main = fin du turn, PAS fin de la responsabilite ; l'owner relancera un patrol a la cadence.`,
    `INTERDITS : reinstaller l'owner, creer une seconde Scheduled Task, relancer un autre child, modifier le runner ou les taches planifiees, publier sans gate net, republier D, aucun secret, aucun PID reel.`,
    `Ne demande pas what next.`,
  ].join('\n');
  try { if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(PATROL_SPEC, spec, 'utf8'); } catch (_) {}
  // (supprime 2026-09-16) le texte de wake `[INVOCATION_SOURCE=…][WAKE=…] …` n'est PLUS construit : il ne servait
  // qu'a alimenter `opencode-run --session` (faux user-turn + fenetre cmd). Le runner publie uniquement un etat capteur.
  const sensorWake = { source: INVOCATION_SOURCE, wake: wakeType || 'PATROL_WAKE', injected_message: false, agent_turn: 'NONE' };
  // RESOLUTION DE SESSION PRIMAIRE — JAMAIS de nouvelle session par wake normal.
  // 1) reuse de l'ID persiste ; 2) sinon ADOPTION de la derniere session WC-01 EXISTANTE (delta 0) ;
  // 3) si aucune primaire reutilisable => FAIL-CLOSED (aucun spawn, aucune creation silencieuse).
  let primaryId = readPrimaryId();
  let sessionAction = 'REUSE_PERSISTED';
  if (!primaryId) {
    const adopt = latestContinuitySessionId();
    if (adopt) { primaryId = adopt; writePrimaryId(adopt, 'ADOPTED_EXISTING'); sessionAction = 'ADOPTED_EXISTING'; }
  }
  if (!primaryId) {
    fs.appendFileSync(CHILD_LOG, `\n===== CHILD SKIP ${new Date().toISOString()} reason=NO_REUSABLE_PRIMARY_SESSION (fail-closed; aucune session creee) =====\n`, 'utf8');
    return { invoked: false, reason: 'NO_REUSABLE_PRIMARY_SESSION', sessionAction: 'FAIL_CLOSED_NO_PRIMARY' };
  }
  if (sessionExists(primaryId) === false) {
    // Primaire persistee mais absente de la DB (supprimee/corrompue) : NE PAS creer en silence => FAIL-CLOSED.
    fs.appendFileSync(CHILD_LOG, `\n===== CHILD SKIP ${new Date().toISOString()} reason=PRIMARY_SESSION_MISSING (fail-closed; 0 creation) =====\n`, 'utf8');
    return { invoked: false, reason: 'PRIMARY_SESSION_MISSING', sessionAction: 'FAIL_CLOSED_PRIMARY_MISSING' };
  }
  // GARDE D'ISOLATION (securite) : en bac a sable (CM_CONTINUITY_DIR defini), on ne spawn JAMAIS un vrai
  // `opencode-run` (sinon un enfant de test agirait sur la session X reelle et les docs de production).
  // En prod CM_CONTINUITY_DIR est absent => invocation reelle. Echappatoire : CM_ALLOW_REAL_INVOKE=1.
  // On ne spawn pas du tout => aucun enfant concurrent (single-flight preserve).
  if (process.env.CM_CONTINUITY_DIR && process.env.CM_ALLOW_REAL_INVOKE !== '1') {
    try { fs.appendFileSync(CHILD_LOG, `\n===== CHILD NO_SPAWN ${new Date().toISOString()} decision=${decision.mode} wake=${wakeType || 'PATROL_WAKE'} token=${admToken ? tokenPrefix(admToken) : 'none'} session=${sessionAction} reason=SANDBOX_NO_REAL_INVOKE =====\n`, 'utf8'); } catch (_) {}
    return { invoked: true, startedAt: new Date().toISOString(), exit: 0, childAlias: 'CM_CHILD_1', sessionAction: 'SANDBOX_NO_SPAWN', cardinalityDelta: 0, sandboxNoSpawn: true };
  }
  const countBefore = wcoreSessionCount();
  let fd;
  try {
    fs.appendFileSync(CHILD_LOG, `\n===== CHILD START ${new Date().toISOString()} decision=${decision.mode} wake=${wakeType || 'PATROL_WAKE'} token=${admToken ? tokenPrefix(admToken) : 'none'} session=${sessionAction} =====\n`, 'utf8');
    fd = fs.openSync(CHILD_LOG, 'a');
    // Pas de --dir (spawnSync cwd=ROOT le fournit deja) : evite tout mangling de chemin node->cmd.
    // --session : REUSE stricte de la session primaire. opencode est lui-meme fail-closed (ID invalide
    // => 'Session not found', AUCUNE creation). On ne passe PAS --title (pas de nouveau titre par wake).
    // Seul le message garde des guillemets ; ni --session ni le reste n'en contiennent.
    // SENSOR_ONLY (operateur 2026-09-16) : AUCUN spawn d'agent. Le chemin historique cmd-exe/opencode-run (spawnn --session <id> "<msg>"'])`
    // violait DEUX invariants : fenetre console visible + faux user-turn synthetique. Le runner ne fait plus
    // que publier un etat capteur ; le CM relit LUI-MEME son etat et selectionne son travail. Aucun remplacement
    // (execFile/spawn/powershell/vbs) : toute technique qui injecte un user-turn est egalement interdite.
    const childEnv = Object.assign({}, process.env, admToken ? { CM_ADMISSION_TOKEN: admToken } : {});
    void childEnv;
    fs.appendFileSync(CHILD_LOG, `\n===== CHILD SENSOR_ONLY ${new Date().toISOString()} decision=${decision.mode} wake=${wakeType || 'PATROL_WAKE'} session=${sessionAction} injected_message=false agent_turn=NONE =====\n`, 'utf8');
    return { invoked: false, reason: 'SENSOR_ONLY_NO_AGENT_TURN', sessionAction, injectedMessage: false, cardinalityDelta: 0, sensorOnly: true };
    // (supprime 2026-09-16) ancien chemin d invocation agent : spawn-Sync cmd.exe) + retry transient.
    // Aucun remplacement : toute technique injectant un user-turn est interdite (SENSOR_ONLY).
  } catch (e) {
    return { invoked: false, reason: 'SPAWN_FAILED' };
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
  }
}

function writeWake(decision, extra) {
  writeJson(WAKE, Object.assign({
    owner: OWNER, requestedAt: new Date().toISOString(),
    decision_mode: decision.mode, decision_reason: decision.reason,
    next_safe_action: 'INVOKE_CM_CYCLE', publication: 'NONE', invocation_source: INVOCATION_SOURCE,
  }, extra || {}));
}

let args = parseArgs(process.argv);

// Decision de wake PURE (sans effet de bord) : testable sans lancer d'agent reel.
// PATROL_DUE bypasse l'anti-dup ; backoff ne s'applique qu'a une VRAIE panne ; NO_ACTION != panne.
function decideWake(s) {
  const nowMs = s.nowMs;
  // Metrique = FRAICHEUR REELLE d'observation X (LAST_X_OBSERVATION_AT), PAS le process ni la completion.
  const lastXMs = s.lastXObservationAt ? new Date(s.lastXObservationAt).getTime() : null;
  const xObservationAgeMs = lastXMs === null ? Number.POSITIVE_INFINITY : (nowMs - lastXMs);
  const coverageBreach = xObservationAgeMs > PATROL_MAX_STALENESS_MS;   // >15m sans VRAIE observation X => breach
  const patrolStale = xObservationAgeMs >= PATROL_MAX_STALENESS_MS;
  const patrolDue = xObservationAgeMs >= PATROL_INTERVAL_MS;
  const antiDupLeftMs = s.lastWakeAt ? Math.max(0, PATROL_MIN_GAP_MS - (nowMs - new Date(s.lastWakeAt).getTime())) : 0;
  const backoffMs = Math.min(FAILURE_BACKOFF_MAX_MS, FAILURE_BACKOFF_BASE_MS * Math.max(1, s.consecutiveFailures || 0));
  const backoffLeftMs = (s.consecutiveFailures || 0) > 0
    ? Math.max(0, backoffMs - (nowMs - new Date(s.prevUpdatedAt || 0).getTime())) : 0;

  let wakeType = 'NONE';
  if (!s.leaseActive && s.reinvoke) {
    if (patrolDue) wakeType = patrolStale ? 'PATROL_WAKE_STALE' : 'PATROL_WAKE';
    else if (/TIME_GATE/i.test(s.reason || '')) wakeType = 'TIME_GATE_WAKE';
    else wakeType = 'EVENT_OR_MANUAL';
  }

  let action, shouldInvoke = false;
  if (s.leaseActive) action = 'AGENT_ACTIVE_SINGLE_FLIGHT';
  else if (!s.invokeEnabled) action = 'GATED_OFF';
  else if (!s.reinvoke) action = 'NO_WAKE_JUSTIFIED';
  else if (backoffLeftMs > 0 && !patrolStale) action = 'FAILURE_BACKOFF_SKIP';
  else if (patrolDue) { shouldInvoke = true; action = 'AGENT_INVOKED'; }
  else if (antiDupLeftMs > 0) action = 'DEDUP_COOLDOWN_SKIP';
  else action = 'MONITOR_TICK_NOT_PATROL_DUE';

  return { patrolAgeMs: xObservationAgeMs, xObservationAgeMs, coverageBreach, patrolStale, patrolDue, antiDupLeftMs, backoffLeftMs, wakeType, shouldInvoke, action };
}

function tick(n) {
  const startedAt = new Date().toISOString();
  const nowMs = Date.now();
  const prev = readJsonSafe(HEARTBEAT) || {};
  const pipeline = readPipelineState();

  // 1) surface
  let surface = checkXSurface();
  let heal = { healed: false, reason: 'NOT_ATTEMPTED' };
  if (!surface.cdp && args.heal && n <= args.maxHeals) {
    heal = healXSurface();
    surface = checkXSurface();
  }

  // 2) decision
  const deciderOut = runDecider();
  const decision = deciderOut.decision || { mode: 'UNKNOWN_NEEDS_EVIDENCE', reinvoke: false, reason: 'NO_DECISION' };

  // 3) single-flight + FAST WAKE RECOVERY (P1 FAILED_WAKE_RECOVERY_LATENCY_GAP) + wake/backoff (decision pure).
  // Si le child tracke d'une invocation precedente n'est PLUS vivant, on recupere la lease IMMEDIATEMENT,
  // sur le MEME tick, puis on POURSUIT la decision (le tick peut re-invoquer) — au lieu d'attendre le tick suivant.
  const lease = leaseActive(nowMs);
  let leaseActiveNow = lease.active;
  let wakeRecovery = null;
  if (leaseActiveNow && !childAlive()) {
    releaseLease('WAKE_NO_CHILD_PROGRESS');
    leaseActiveNow = false;
    wakeRecovery = 'WAKE_STARTED_BUT_NO_CHILD_PROGRESS';
    appendLog('WAKE_RECOVERY lease_recovered_no_child_progress (fast, same tick)');
  }
  const plan = decideWake({
    leaseActive: leaseActiveNow, reinvoke: !!decision.reinvoke, reason: decision.reason,
    lastXObservationAt: pipeline.lastXObservationAt, lastWakeAt: pipeline.lastWakeAt,
    consecutiveFailures: pipeline.consecutiveFailures, prevUpdatedAt: prev.updatedAt,
    nowMs, invokeEnabled: args.invoke,
  });
  const { patrolDue, patrolStale, coverageBreach, patrolAgeMs, antiDupLeftMs, backoffLeftMs, wakeType } = plan;
  if (coverageBreach) appendLog(`COVERAGE_BREACH xObservationAgeMs=${patrolAgeMs} (childActive=${lease.active})`);

  let action = 'SKIP';
  let invokeResult = { invoked: false, reason: 'SKIP' };

  if (leaseActiveNow) {
    action = 'AGENT_ALREADY_ACTIVE_SKIP_INVOCATION';   // single-flight : jamais un 2e child
    touchLease();
  } else if (!args.invoke) {
    action = 'GATED_OFF_OPT_IN_REQUIRED';
    if (decision.reinvoke) writeWake(decision, { blocked_by: 'GATED_OFF' });
  } else if (!decision.reinvoke) {
    action = 'NO_WAKE_JUSTIFIED';
  } else if (backoffLeftMs > 0 && !patrolStale) {
    action = 'FAILURE_BACKOFF_SKIP';
    writeWake(decision, { blocked_by: 'FAILURE_BACKOFF', backoffLeftMs });
  } else if (patrolDue) {
    // PATROL_DUE bypasse tout cooldown de succes => couverture CM active continue.
    // ADMISSION GLOBALE atomique AVANT tout spawn : un seul child WC-01 a la fois, tout chemin confondu.
    const admToken = randomToken();
    const adm = acquireAdmission(admToken, 'scheduler', process.pid);
    if (!adm.ok) {
      // Un autre child WC-01 est deja admis (ou reprise en cours) => AUCUN spawn, AUCUN travail X.
      if (adm.reason === 'DENIED_ALREADY_ACTIVE' || adm.reason === 'ALREADY_HELD_BY_ME') {
        action = 'ADMISSION_DENIED_ALREADY_ACTIVE_NO_SPAWN';
        if (childAlive()) touchLease();
        writeWake(decision, { blocked_by: 'ADMISSION_DENIED', admission_holder: adm.admission ? adm.admission.source : null });
      } else {
        action = 'ADMISSION_FAIL_CLOSED';   // ambiguite (erreur lecture/creation/recovery race) => on NE spawn PAS
        writeWake(decision, { blocked_by: 'ADMISSION_FAIL_CLOSED', admission_reason: adm.reason });
      }
    } else {
      acquireLease(startedAt, decision, wakeType);
      try { fs.writeFileSync(CHILD_PID, String(process.pid), 'utf8'); } catch (_) {}
      const preXObs = pipeline.lastXObservationAt;              // horloge de fraicheur avant ce cycle
      const prePatrolMarker = pipeline.lastFullPatrolAt;
      invokeResult = invokeAgentSync(decision, wakeType, admToken);
      if (invokeResult.invoked) {
        // Le child a pu ecrire pendant son run (heartbeat) : on relit pour PRESERVER ses horloges.
        const afterHb = readJsonSafe(HEARTBEAT) || {};
        const selfMarked = !!afterHb.patrol_self_mark_at && afterHb.patrol_self_mark_at !== pipeline.patrolSelfMarkAt;
        const ok = invokeResult.exit === 0 || selfMarked;
        invokeResult.selfMarked = selfMarked;
        // Lifecycle mesure (B) : runtime child reel, pas la seule existence du process.
        const childStartedAt = invokeResult.startedAt;
        const childExitAt = new Date().toISOString();
        const childRuntimeMs = childStartedAt ? (Date.now() - new Date(childStartedAt).getTime()) : null;
        const selfMarkAt = afterHb.patrol_self_mark_at || null;
        const postPatrolLingerMs = computePostPatrolLingerMs(selfMarkAt, childExitAt);
        invokeResult.childStartedAt = childStartedAt;
        invokeResult.childExitAt = childExitAt;
        invokeResult.childRuntimeMs = childRuntimeMs;
        invokeResult.postPatrolLingerMs = postPatrolLingerMs;
        invokeResult.xObservedThisCycle = !!afterHb.last_x_observation_at && afterHb.last_x_observation_at !== preXObs;
        releaseLease(ok ? (selfMarked ? 'CHILD_COMPLETED_OK_SELFMARK' : 'CHILD_COMPLETED_OK') : `CHILD_EXIT_${invokeResult.exit}`);
        action = ok ? 'AGENT_INVOKED' : 'AGENT_INVOKED_CHILD_FAILED';
        if (postPatrolLingerMs !== null && postPatrolLingerMs > POST_PATROL_LINGER_TARGET_MS) {
          appendLog(`POST_PATROL_LINGER_HIGH ms=${postPatrolLingerMs} (self-mark->exit > cible)`);
        }
        writeWake(decision, { invoked: true, wake_type: wakeType, childAlias: invokeResult.childAlias, session_action: invokeResult.sessionAction, session_cardinality_delta: invokeResult.cardinalityDelta === undefined ? null : invokeResult.cardinalityDelta, childStartedAt, childExitAt, childRuntimeMs, postPatrolLingerMs, xObservedThisCycle: invokeResult.xObservedThisCycle, childExit: invokeResult.exit, self_marked: selfMarked });
      } else {
        const sessionSkip = invokeResult.reason === 'NO_REUSABLE_PRIMARY_SESSION' || invokeResult.reason === 'PRIMARY_SESSION_MISSING';
        releaseLease(sessionSkip ? 'SESSION_REUSE_UNAVAILABLE' : 'SPAWN_FAILED');
        action = sessionSkip ? 'AGENT_INVOCATION_SKIPPED_SESSION_REUSE_UNAVAILABLE' : 'INVOKE_FAILED';
        writeWake(decision, { blocked_by: sessionSkip ? 'SESSION_REUSE_UNAVAILABLE' : 'SPAWN_FAILED', session_action: invokeResult.sessionAction, session_reason: invokeResult.reason });
      }
      releaseAdmission(admToken);
      try { fs.unlinkSync(CHILD_PID); } catch (_) {}
    }
  } else if (antiDupLeftMs > 0) {
    action = 'DEDUP_COOLDOWN_SKIP';
  } else {
    action = 'MONITOR_TICK_NOT_PATROL_DUE';
  }

  // 4) heartbeat durable — relu pour PRESERVER les horloges ecrites par le child pendant son run.
  const latest = readJsonSafe(HEARTBEAT) || prev;
  const beats = Array.isArray(latest.beats) ? latest.beats.slice(-49) : [];
  const run = (typeof latest.runs === 'number' ? latest.runs : (typeof prev.runs === 'number' ? prev.runs : 0)) + 1;
  beats.push({ ts: startedAt, run, cdp: surface.cdp, browser: surface.browser, mode: decision.mode, reason: decision.reason, action, wake_type: wakeType, x_age_ms: Number.isFinite(patrolAgeMs) ? patrolAgeMs : 'NEVER' });
  const invokedOk = action === 'AGENT_INVOKED';
  const childFailed = action === 'AGENT_INVOKED_CHILD_FAILED' || action === 'INVOKE_FAILED';
  const newLastWakeAt = (invokedOk || childFailed) ? startedAt : pipeline.lastWakeAt;
  const newFailures = invokedOk ? 0 : (childFailed ? pipeline.consecutiveFailures + 1 : pipeline.consecutiveFailures);
  // Fraicheur REELLE : ne bouge QUE si le child a vraiment lu X (--x-observed). Le tick ne l'artificialise JAMAIS.
  const lastXObservationAt = latest.last_x_observation_at || pipeline.lastXObservationAt || null;
  const lastFullPatrolAt = latest.last_full_cm_patrol_at || pipeline.lastFullPatrolAt || null; // completion, distincte
  const xAgeNow = lastXObservationAt ? (Date.now() - new Date(lastXObservationAt).getTime()) : null;
  const coverageBreachNow = xAgeNow === null || xAgeNow > PATROL_MAX_STALENESS_MS;
  writeJson(HEARTBEAT, {
    owner: OWNER, updatedAt: new Date().toISOString(), tick: n, runs: run,
    x_surface_cdp: surface.cdp, x_print: 'NONE', publication: 'NONE',
    decision_mode: decision.mode, decision_reason: decision.reason, reinvoke: !!decision.reinvoke,
    heal_attempted: heal.reason !== 'NOT_ATTEMPTED', heal_result: heal,
    action, wake_type: wakeType, patrol_due: patrolDue,
    wake_recovery: wakeRecovery,
    // FRAICHEUR REELLE (coverage) — la seule qui compte pour MAX_TIME_WITHOUT_REAL_X_OBSERVATION.
    last_x_observation_at: lastXObservationAt,
    x_observation_age_ms: xAgeNow === null ? 'NEVER' : xAgeNow,
    x_observation_max_staleness_ms: PATROL_MAX_STALENESS_MS,
    coverage_breach: coverageBreachNow,
    // COMPLETION (distincte de la fraicheur ; ne pretends pas que c'est une observation X).
    last_full_cm_patrol_at: lastFullPatrolAt,
    full_patrol_completed_at: latest.full_patrol_completed_at || null,
    patrol_self_mark_at: latest.patrol_self_mark_at || null,
    // CYCLE LIFE-CYCLE : runtime child reel vs POST_WORK_LINGER (process vivant != couverture).
    child_started_at: invokeResult.childStartedAt || null,
    child_exit_at: invokeResult.childExitAt || null,
    child_runtime_ms: invokeResult.childRuntimeMs === undefined ? null : invokeResult.childRuntimeMs,
    post_patrol_linger_ms: invokeResult.postPatrolLingerMs === undefined ? null : invokeResult.postPatrolLingerMs,
    no_action_runtime_target_ms: NO_ACTION_RUNTIME_TARGET_MS,
    no_action_runtime_hard_budget_ms: NO_ACTION_RUNTIME_HARD_BUDGET_MS,
    agent_lease_status: (readLease() || {}).status || 'NONE',
    // SESSION PRIMAIRE (anti-proliferation) : alias + action + delta de cardinalite. JAMAIS l'ID reel.
    session_primary_alias: primaryStatus().has_primary ? 'SESSION_PRIMARY' : null,
    session_action: invokeResult.sessionAction || null,
    session_cardinality_delta: invokeResult.cardinalityDelta === undefined ? null : invokeResult.cardinalityDelta,
    last_wake_at: newLastWakeAt,
    consecutive_failures: newFailures,
    beats,
  });

  appendLog(`tick=${n} run=${run} mode=${decision.mode} cdp=${surface.cdp} action=${action} wake=${wakeType} xAgeMs=${Number.isFinite(patrolAgeMs) ? patrolAgeMs : 'NEVER'} childRuntimeMs=${invokeResult.childRuntimeMs === undefined ? 'na' : invokeResult.childRuntimeMs} lingerMs=${invokeResult.postPatrolLingerMs === undefined ? 'na' : invokeResult.postPatrolLingerMs} session=${invokeResult.sessionAction || 'na'} sessionDelta=${invokeResult.cardinalityDelta === undefined || invokeResult.cardinalityDelta === null ? 'na' : invokeResult.cardinalityDelta}`);
  return { tick: n, run, startedAt, cdp: surface.cdp, mode: decision.mode, reason: decision.reason, action, wakeType, patrolDue, coverageBreach, heal, invoke: invokeResult };
}

function main() {
  ensureDir();
  if (args.coverageLedger) {
    const all = readXObservationLedger();
    const gaps = all.map((e) => e.gap_min).filter((g) => typeof g === 'number');
    const v = all.filter((e) => e.violation);
    const out = { owner: OWNER, action: 'COVERAGE_LEDGER', entries: all.length, gaps_min: gaps,
      max_gap_min: gaps.length ? Math.max.apply(null, gaps) : null, violations: v.length,
      violation_entries: v, hard_ms: CHILD_X_HARD_MS, soft_ms: CHILD_X_SOFT_MS, publication: 'NONE' };
    console.log(JSON.stringify(out, null, 1));
    return 0;
  }
  if (args.guardCheck) {
    const hb = readJsonSafe(HEARTBEAT) || {};
    const xAt = Date.parse(hb.last_x_observation_at);
    const nowMs = args.now ? Date.parse(args.now) : Date.now();
    if (!Number.isFinite(xAt)) {
      console.log(JSON.stringify({ owner: OWNER, action: 'CHILD_GUARD_CHECK', action_required: 'REFRESH_X_NOW', must_refresh: true,
        reason: 'NO_X_OBSERVATION', real_x_read_required: true, soft_ms: CHILD_X_SOFT_MS, hard_ms: CHILD_X_HARD_MS, publication: 'NONE' }, null, 1));
    } else {
      const b = childFreshnessBudget(xAt, nowMs, args.budgetMs);
      console.log(JSON.stringify(Object.assign({ owner: OWNER, action: 'CHILD_GUARD_CHECK', action_required: b.action, last_x_observation_at: hb.last_x_observation_at, publication: 'NONE' }, b), null, 1));
    }
    return 0;
  }
  // Porte d'admission GLOBALE (child-side, atomique). Tout chemin project-owned DOIT passer ici AVANT
  // tout travail X substantiel/public. Refus => le child ne fait AUCUN patrol/publication et sort proprement.
  if (args.admitStatus) {
    const cur = readAdmission();
    const held = args.token ? !!(cur && cur.token === args.token) : !!cur;
    console.log(JSON.stringify({ owner: OWNER, action: 'ADMIT_STATUS', held,
      any_holder: !!cur, token_prefix: args.token ? tokenPrefix(args.token) : null,
      holder_prefix: cur ? tokenPrefix(cur.token) : null, source: cur ? cur.source : null,
      ageMs: cur ? Date.now() - new Date(cur.acquiredAt).getTime() : null, publication: 'NONE' }, null, 1));
    return 0;
  }
  if (args.primaryStatus) {
    console.log(JSON.stringify(Object.assign({ owner: OWNER, action: 'PRIMARY_SESSION_STATUS', publication: 'NONE' }, primaryStatus()), null, 1));
    return 0;
  }
  if (args.admit) {
    const tok = args.token || randomToken();
    // P1-GOV-CM-PERSISTENT-OWNER (REOPEN_RESIDENT_COVERAGE_BREACH_NOT_AUTOWOKEN) : le PID du PROCESS
    // detenteur est enregistre, ce qui arme le FAST DEAD-HOLDER RECOVERY (90 s) au lieu du TTL 20 min.
    const r = acquireAdmission(tok, args.source || 'child', args.pid || null);
    const denied = !r.ok;
    console.log(JSON.stringify({ owner: OWNER, action: denied ? 'WC01_ADMISSION_DENIED_ALREADY_ACTIVE' : 'WC01_ADMISSION_ACQUIRED',
      reason: r.reason, token: tok, token_prefix: tokenPrefix(tok), holder: r.admission ? { source: r.admission.source, token_prefix: tokenPrefix(r.admission.token) } : null,
      ageMs: r.ageMs === undefined ? null : r.ageMs, publication: 'NONE' }, null, 1));
    return denied ? 3 : 0;   // exit 3 = refuse (le child doit s'arreter avant tout travail X)
  }
  if (args.admitRelease) {
    const r = releaseAdmission(args.token);
    console.log(JSON.stringify({ owner: OWNER, action: 'WC01_ADMISSION_RELEASE', result: r, publication: 'NONE' }, null, 1));
    return r.released ? 0 : 4;
  }
  if (args.releaseLease) {
    const r = releaseLeaseCommand(args.releaseReason);
    console.log(JSON.stringify({ owner: OWNER, action: 'RELEASE_LEASE', result: r, publication: 'NONE' }, null, 1));
    return 0;
  }
  if (args.xObserved) {
    const r = markXObservation(new Date().toISOString(), 'CHILD_REAL_X_READ', args.token);
    console.log(JSON.stringify({ owner: OWNER, action: r.ok ? 'X_OBSERVED' : 'X_OBSERVED_REFUSED', last_x_observation_at: r.at, reason: r.reason || null, publication: 'NONE' }, null, 1));
    return r.ok ? 0 : 3;
  }
  if (args.patrolComplete) {
    const at = markPatrolComplete(new Date().toISOString(), 'CHILD_SELF_MARK');
    console.log(JSON.stringify({ owner: OWNER, action: 'PATROL_COMPLETE', last_full_cm_patrol_at: at, publication: 'NONE' }, null, 1));
    return 0;
  }
  appendLog(`runner start owner=${OWNER} ticks=${args.tick} intervalMs=${args.intervalMs} invoke=${args.invoke} heal=${args.heal}`);
  const results = [];
  for (let i = 1; i <= args.tick; i++) {
    results.push(tick(i));
    if (i < args.tick) spawnSync('powershell.exe', ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${args.intervalMs}`], { timeout: args.intervalMs + 10000, windowsHide: true });
  }
  console.log(JSON.stringify({ owner: OWNER, ticks: args.tick, invoke_enabled: args.invoke, results }, null, 1));
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(); } catch (e) { console.error('ERR', e.message); process.exitCode = 1; }
}

module.exports = {
  parseArgs, checkXSurface, healXSurface, runDecider, invokeAgentSync, tick, decideWake,
  readLease, leaseActive, acquireLease, releaseLease, releaseLeaseCommand, touchLease, readPipelineState,
  readChildPid, childAlive, markPatrolComplete, markXObservation, computePostPatrolLingerMs,
  readAdmission, acquireAdmission, releaseAdmission, verifyAdmission, reclaimAdmission, randomToken, tokenPrefix, pidAlive,
  readPrimaryId, writePrimaryId, primaryStatus, latestContinuitySessionId, sessionExists, wcoreSessionCount,
  OWNER, OUT_DIR, LEASE, ADMISSION, PRIMARY_SESSION, PRIMARY_TITLE, CANONICAL_TITLE, LEGACY_WAKE_TITLES,
  LEASE_STALE_MS, STALE_ADMISSION_MS, DEAD_HOLDER_GRACE_MS, PATROL_INTERVAL_MS, PATROL_MAX_STALENESS_MS, PATROL_MIN_GAP_MS,
  NO_ACTION_RUNTIME_TARGET_MS, NO_ACTION_RUNTIME_HARD_BUDGET_MS, FAST_X_REFRESH_AFTER_MS, POST_PATROL_LINGER_TARGET_MS,
  CHILD_INSTANT_DEATH_MS, CHILD_RETRY_DELAY_MS, coverageLedgerEntry, readXObservationLedger, childFreshnessBudget, CHILD_X_SOFT_MS, CHILD_X_HARD_MS,
  FAILURE_BACKOFF_BASE_MS, FAILURE_BACKOFF_MAX_MS, INVOCATION_SOURCE,
};
