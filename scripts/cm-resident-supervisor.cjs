// cm-resident-supervisor.cjs — RUNTIME RESIDENT project-owned WCORE (P1-GOV-CM-PERSISTENT-OWNER,
// REOPEN_REASON=OPERATOR_SUPERSEDES_SCHEDULED_TASK_ARCHITECTURE).
//
// Remplace la Scheduled Task de wake. AUCUNE tache planifiee n'est utilisee, AUCUNE invocation
// periodique : le superviseur reste RESIDENT et n'invoque l'agent que sur EVENEMENT/CONDITION
// (edge-trigger + dedup + cooldown), dans la MEME conversation principale (SESSION_PRIMARY).
//
// Invariants :
//   - SAME_PRIMARY_OPENCODE_SESSION=TRUE (jamais de nouvelle session/conversation)
//   - NO_SCHEDULED_TASK_AGENT_WAKE (aucune dependance Task Scheduler)
//   - FAIL_CLOSED si SESSION_PRIMARY introuvable (aucune creation de remplacement)
//   - VISIBLE_CMD=NO (windowsHide partout) ; heartbeat/logs/exit codes conserves
//   - SINGLE_FLIGHT (un seul superviseur resident ; un seul child a la fois)
//   - NO_TIGHT_POLLING (backoff adaptatif 30s -> 300s)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// OUT_DIR overridable pour les TESTS (bac a sable) : jamais de mutation du runtime reel en test.
const OUT_DIR = process.env.CM_RESIDENT_DIR || path.join(ROOT, '.generated', 'cm-continuity');
const PRIMARY_SESSION = path.join(OUT_DIR, 'primary-session.json');
const RESIDENT_STATE = path.join(OUT_DIR, 'resident-state.json');
const RESIDENT_HEARTBEAT = path.join(OUT_DIR, 'resident-heartbeat.json');
const RESIDENT_PID = path.join(OUT_DIR, 'resident.pid');
const RESIDENT_LOG = path.join(OUT_DIR, 'resident.log');
const CM_HEARTBEAT = path.join(OUT_DIR, 'heartbeat.json');
const WAKE_REQUEST = path.join(OUT_DIR, 'wake-request.json');
const ROADMAP = path.join(ROOT, 'ROADMAP.md');

const CANONICAL_TITLE = 'WCORE CM';
// Invocation SANS SHELL : cmd.exe interprete `>` `<` `|` `&` `^` `%` `!` `"` MEME dans une chaine
// argument, donc un simple `->` dans le message faisait afficher l'AIDE d'opencode et sortir 1
// (child no-op silencieux, prouve 2026-09-16 01:50Z et 04:46Z). On lance l'EXE directement.
const OPENCODE_EXE = process.env.WCORE_OPENCODE_EXE || path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
function sanitizeForCmd(s) { return String(s).replace(/[<>|&^%!"\r\n]/g, ' '); }
const INVOCATION_SOURCE = 'CM_RESIDENT_SUPERVISOR';
const WAKE = 'RESIDENT_EVENT';

// Bornes (jamais de tight polling)
const TICK_MIN_MS = 30 * 1000;       // pas minimal entre deux verifications
const TICK_MAX_MS = 5 * 60 * 1000;   // backoff max
const COOLDOWN_MS = 5 * 60 * 1000;   // pas plus d'une invocation par 5 min
const IDLE_ACTION_MS = 10 * 60 * 1000; // reveil d'une conversation REELLEMENT inactive sans prochaine action
// Continuation DUAL-LANE post-tour : delai COURT quand une action non-CM sure est deja actionnable
// (CM safe + borne X OK). Anti-tight-loop, JAMAIS anti-progression.
const POST_TURN_CONTINUATION_MS = 45 * 1000;
// Un CM_COVERAGE_BREACH qui PERSISTE est une condition RECURRENTE, pas un evenement one-shot :
// le dedup ne doit jamais l'epingler indefiniment (sinon: deadlock -> le signal ne peut s'effacer que
// par l'action meme que le dedup bloque). Re-invocation bornee = anti-tight-loop, PAS anti-recuperation.
const PERSISTENT_SIGNAL_RETRY_MS = 90 * 1000;
// Declencheur de RAFRAICHISSEMENT a seuil DOUX : on vise <=15 min sur la mesure REELLE, or une
// invocation met ~1-3 min a aboutir -> on declenche AVANT la borne dure pour garder la marge.
const X_REFRESH_SOFT_MS = 12 * 60 * 1000;
const COVERAGE_BREACH_MS = 15 * 60 * 1000;
const CHILD_TIMEOUT_MS = 55 * 60 * 1000;
const ONE_SHOT = process.argv.includes('--once');
const SANDBOX = process.env.CM_CONTINUITY_DIR && process.env.CM_ALLOW_REAL_INVOKE !== '1';

function nowIso() { return new Date().toISOString(); }
function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }
function writeJson(p, o) { try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2), 'utf8'); } catch (_) {} }
function appendLog(line) { try { fs.appendFileSync(RESIDENT_LOG, '[' + nowIso() + '] ' + line + '\n', 'utf8'); } catch (_) {} }

function opencodeDb() {
  try { const { DatabaseSync } = require('node:sqlite'); return new DatabaseSync(opencodeDbPath(), { readOnly: true }); }
  catch (_) { return null; }
}
function opencodeDbPath() {
  return process.env.OPENCODE_DB || path.join(process.env.USERPROFILE || '', '.local', 'share', 'opencode', 'opencode.db');
}
function sessionExists(id) {
  if (!id) return null;
  const db = opencodeDb(); if (!db) return null;
  try { return !!db.prepare('SELECT 1 x FROM session WHERE id=? LIMIT 1').get(String(id)); }
  catch (_) { return null; } finally { try { db.close(); } catch (_) {} }
}
function wcoreSessionCount() {
  const db = opencodeDb(); if (!db) return null;
  try { return db.prepare('SELECT COUNT(*) n FROM session WHERE directory=?').get(String(ROOT).replace(/\\/g, '/')).n; }
  catch (_) { return null; } finally { try { db.close(); } catch (_) {} }
}
function primaryLastActivity(id) {
  if (!id) return null;
  const db = opencodeDb(); if (!db) return null;
  try { const r = db.prepare('SELECT time_updated FROM session WHERE id=? LIMIT 1').get(String(id)); return r ? r.time_updated : null; }
  catch (_) { return null; } finally { try { db.close(); } catch (_) {} }
}
function pidAlive(pid) {
  const p = parseInt(String(pid), 10);
  if (!Number.isFinite(p)) return null;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', `if (Get-Process -Id ${p} -ErrorAction SilentlyContinue) { 'ALIVE' } else { 'DEAD' }`], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  if (/ALIVE/.test(r.stdout || '')) return true;
  if (/DEAD/.test(r.stdout || '')) return false;
  return null;
}

// --- Resolutions ---
function readPrimaryId() {
  const o = readJsonSafe(PRIMARY_SESSION);
  const id = o && typeof o.session_id === 'string' ? o.session_id : null;
  return id && /^ses_/.test(id) ? id : null;
}
// La conversation principale est resolue par TITRE CANONIQUE dans le directory WCORE (la plus ancienne) ;
// jamais un ID code en dur. Fail-closed si introuvable.
function resolvePrimaryFromDb() {
  const db = opencodeDb(); if (!db) return null;
  try {
    const dir = String(ROOT).replace(/\\/g, '/');
    const row = db.prepare('SELECT id FROM session WHERE directory=? AND title=? ORDER BY time_created ASC LIMIT 1').get(dir, CANONICAL_TITLE);
    return row ? row.id : null;
  } catch (_) { return null; } finally { try { db.close(); } catch (_) {} }
}
function resolvePrimary() {
  const ref = readPrimaryId();
  if (ref && sessionExists(ref) === true) return { ok: true, id: ref, via: 'REF' };
  const fromDb = resolvePrimaryFromDb();
  if (fromDb && sessionExists(fromDb) === true) {
    // Re-ancre le pointeur runtime sur la conversation principale (aucun ID en clair dans les docs).
    const prev = readJsonSafe(PRIMARY_SESSION) || {};
    writeJson(PRIMARY_SESSION, { alias: 'SESSION_PRIMARY', session_id: String(fromDb), origin: 'RESIDENT_RERESOLVE', directory: String(ROOT).replace(/\\/g, '/'), created_at: prev.created_at || nowIso(), updated_at: nowIso() });
    return { ok: true, id: fromDb, via: 'DB_CANONICAL' };
  }
  return { ok: false, id: null, via: ref ? 'REF_STALE' : 'NO_PRIMARY' };
}

// --- Signaux (derives du disque, jamais inventes) ---
// FRONTIERE ROOT/CM : la file de travail est CM/ROADMAP.md (via cm-boundary.cjs).
// ROOT/ROADMAP.md n'est JAMAIS une file de travail CM : il n'est lu que comme interface/pointeur,
// et ses items produit sont exposes separement (rejetes), jamais additionnes a `open`.
function boundaryMod() {
  try { return require('./cm-boundary.cjs'); } catch (_) { return null; }
}
function roadmapState() {
  const B = boundaryMod();
  const q = B ? B.readCmQueue() : [];
  let cmOpen = 0, cmBlocked = 0, cmInProgress = 0;
  for (const it of q) {
    const st = String(it.status || '').toUpperCase();
    if (st === 'BLOCKED') cmBlocked++;
    else if (st !== 'DONE') { cmOpen++; if (st === 'IN_PROGRESS') cmInProgress++; }
  }
  // ROOT : uniquement compteur d'items produit NON selectionnables (interface), jamais une file de travail.
  let rootRejected = 0;
  try {
    if (B) {
      const rows = fs.readFileSync(ROADMAP, 'utf8').split(/\r?\n/)
        .filter((l) => /^\| (WC-\d+|P\d-)/.test(l))
        .map((r) => { const c = r.split('|'); return { id: (c[1] || '').trim(), status: (c[3] || '').trim().toUpperCase() }; });
      const f = B.filterToCmWork(rows);
      rootRejected = f.root_product_selection_count;
      // File CM presente dans le ROOT par erreur : jamais consommee comme travail CM.
    }
  } catch (_) {}
  return {
    open: cmOpen, blocked: cmBlocked, wc_open: cmOpen, transversal_open: 0,
    cm_queue_items: q.length, cm_in_progress: cmInProgress,
    root_product_items_rejected: rootRejected,
    root_roadmap_is_work_queue: false,
  };
}
function cmState() {
  const hb = readJsonSafe(CM_HEARTBEAT) || {};
  const lastX = hb.last_x_observation_at || null;
  const ageMs = lastX ? Date.now() - Date.parse(lastX) : null;
  return {
    last_x_observation_at: lastX,
    x_observation_age_ms: ageMs,
    coverage_breach: ageMs !== null ? ageMs > COVERAGE_BREACH_MS : null,
    consecutive_failures: hb.consecutive_failures != null ? hb.consecutive_failures : null,
    last_full_cm_patrol_at: hb.last_full_cm_patrol_at || null,
  };
}
// --- Politique DUAL-LANE (R-024 revise, P1-GOV-SINGLE-AGENT-DUAL-LANE) ------------------------
// WC-01 reste prioritaire et PREEMPTIF. Le travail non-CM (roadmap) n'est autorise que si AUCUNE
// action CM n'est due ET que la borne de fraicheur X peut etre preservee.
//   CM du            -> WC01_FIRST (aucun travail non-CM)
//   CM safe + roadmap actionnable -> SELECT_NEXT_ACTIONABLE_WORK (micro-etape REELLE)
//   sinon            -> MONITOR_PAUSE_RECHECK
const X_FRESHNESS_BOUND_MS = COVERAGE_BREACH_MS; // une seule source de verite pour la borne X
function dualLanePlan(sig) {
  // Une couverture X a rafraichir (seuil doux OU borne dure) est une action CM : WC-01 gagne PREEMPTIVEMENT.
  const xAge = sig.cm.x_observation_age_ms;
  const cmActionDue = sig.cm.coverage_breach === true || (xAge != null && xAge >= X_REFRESH_SOFT_MS);
  const roadmapActionable = sig.roadmap.open !== null && sig.roadmap.open > 0;
  if (cmActionDue) return { lane: 'CM', action: 'WC01_FIRST', reason: 'CM_ACTION_DUE', roadmapActionable };
  if (roadmapActionable) return { lane: 'NON_CM', action: 'SELECT_NEXT_ACTIONABLE_WORK', reason: 'CM_SAFE_ROADMAP_ACTIONABLE', roadmapActionable };
  return { lane: 'NONE', action: 'MONITOR_PAUSE_RECHECK', reason: 'NO_ACTIONABLE_WORK', roadmapActionable };
}
// NON_CM_MICROSTEP_ALLOWED_WHEN_CM_SAFE : jamais si CM du, jamais si la marge de fraicheur X est insuffisante.
function canRunNonCmStep(sig) {
  if (sig.cm.coverage_breach === true) return false;
  const age = sig.cm.x_observation_age_ms;
  if (age !== null && age >= X_FRESHNESS_BOUND_MS) return false;
  return true;
}

// Edge-trigger + dedup : on n'invoque QUE si un signal NOUVEAU apparait, et jamais deux fois de suite
// pour le meme signal tant qu'il n'a pas disparu.
function decideInvocation(state, sig) {
  const sinceLast = state.last_invocation_at ? Date.now() - Date.parse(state.last_invocation_at) : Infinity;
  const plan = dualLanePlan(sig);
  const idle = (sig.agent && sig.agent.idle_ms != null) ? sig.agent.idle_ms : null;
  const lastAct = (sig.agent && sig.agent.last_activity_ms != null) ? sig.agent.last_activity_ms : null;
  // Progression REELLE depuis la derniere invocation => le signal peut se RE-ARMER (le dedup ne bloque
  // plus une nouvelle invocation apres un vrai checkpoint).
  const progressed = (state.last_invocation_activity_ms != null && lastAct != null && lastAct > state.last_invocation_activity_ms);

  const candidates = [];
  // CM_COVERAGE_BREACH : (a) borne DURE depassee, ou (b) seuil DOUX de rafraichissement (marge).
  // Signal PERSISTANT : une couverture X stale est une condition RECURRENTE.
  const xAge = sig.cm.x_observation_age_ms;
  if (sig.cm.coverage_breach === true || (xAge != null && xAge >= X_REFRESH_SOFT_MS)) {
    candidates.push({ key: 'CM_COVERAGE_BREACH', reason: 'X coverage stale (soft ' + Math.round(X_REFRESH_SOFT_MS / 60000) + ' min / hard 15 min)', fast: true, persistent: true });
  }
  if (sig.cm.consecutive_failures !== null && sig.cm.consecutive_failures >= 2) {
    candidates.push({ key: 'CM_HEALTH_REGRESSION', reason: 'consecutive failures >= 2', fast: false, persistent: true });
  }
  if (idle != null) {
    // (B) Continuation DUAL-LANE POST-TOUR : CM safe + travail actionnable connu + tour termine.
    //     Delai COURT : on n'attend JAMAIS l'idle long quand une action non-CM sure est disponible.
    if (plan.lane === 'NON_CM' && canRunNonCmStep(sig) && idle >= POST_TURN_CONTINUATION_MS) {
      candidates.push({ key: 'ACTIONABLE_WORK_POST_TURN', reason: 'post-turn continuation: CM safe + actionable roadmap work', fast: true, persistent: false });
    }
    // (A) Reveil d'une conversation REELLEMENT inactive SANS prochaine action connue.
    if (plan.roadmapActionable && idle > IDLE_ACTION_MS) {
      candidates.push({ key: 'ACTIONABLE_WORK_IDLE', reason: 'agent inactive while actionable roadmap work remains', fast: false, persistent: false });
    }
  }
  if (!candidates.length) return { invoke: false, reason: 'NO_NEW_SIGNAL' };
  const best = candidates[0];
  const isPersistent = best.persistent === true;
  const handledAt = state.handled_signal_at ? Date.parse(state.handled_signal_at) : null;
  const handledAgo = handledAt != null ? Date.now() - handledAt : Infinity;
  // Le mode rapide exige une progression reelle depuis la derniere invocation (sinon = pas de tight loop).
  const fast = best.fast === true && progressed;
  // Une condition PERSISTANTE depassee peut etre re-invoquee meme sans progression : sinon un child
  // rate epinglerait le signal pour toujours (deadlock prouve 01:50Z -> 04:46Z, 176 min).
  const retryPersistent = isPersistent && handledAgo >= PERSISTENT_SIGNAL_RETRY_MS;
  // DEDUP : un MEME signal ne se repete pas, SAUF progression reelle ou condition persistante depassee.
  if (state.handled_signal === best.key && !fast && !retryPersistent) return { invoke: false, reason: 'SIGNAL_ALREADY_HANDLED:' + best.key };
  // COOLDOWN anti-duplication : reduit quand le signal est rapide/persistant (jamais un idle impose).
  const floor = (fast || isPersistent) ? PERSISTENT_SIGNAL_RETRY_MS : COOLDOWN_MS;
  if (sinceLast < floor) return { invoke: false, reason: (fast || isPersistent) ? 'FAST_COOLDOWN' : 'COOLDOWN' };
  return { invoke: true, signal: best.key, reason: best.reason, lane: plan.lane, plan: plan.action, progressed, persistent: isPersistent };
}

// --- Admission (SINGLE_FLIGHT GLOBAL WC-01) : le resident ACQUIERT avant d'invoquer et RELEASE apres.
// Sans cela le child verrait held=false (patrol-spec step 0) et s'arreterait : aucun travail utile.
const RUNNER = path.join(ROOT, 'scripts', 'cm-continuity-runner.cjs');
function runCli(args) {
  const r = spawnSync('node', [RUNNER, ...args], { encoding: 'utf8', timeout: 30000, cwd: ROOT, windowsHide: true });
  let j = null; try { j = JSON.parse((r.stdout || '').trim()); } catch (_) {}
  return { code: r.status, json: j };
}
function acquireAdmission() {
  const r = runCli(['--admit', '--source', 'CM_RESIDENT', '--pid=' + process.pid]);
  if (r.json && r.json.action === 'WC01_ADMISSION_ACQUIRED' && r.json.token) return { ok: true, token: r.json.token };
  return { ok: false, reason: (r.json && r.json.action) || ('EXIT_' + r.code) };
}
// Le runner n'accepte QUE `--token=<valeur>` (pas `--token <valeur>`). L'ancienne forme laissait
// l'admission DETENUE pour toujours (release en echec silencieux) => toutes les invocations suivantes
// en WC01_ADMISSION_DENIED_ALREADY_ACTIVE (deadlock prouve 05:08Z -> jamais libere).
function releaseAdmission(token) { try { return runCli(['--admit-release', '--token=' + token]); } catch (_) { return null; } }

// Invariant preserve : GREEN_HEARTBEAT_WITH_NO_WORK_PROGRESS_IS_NOT_SUCCESS -> le capteur publie
// work_progress_required:true. Un heartbeat vert sans progression de travail n est PAS un succes.
// --- Continuation du CM : AUCUN message injecte (SENSOR_ONLY) ---
// opencode n'expose AUCUNE primitive de continuation non visible : `session.prompt` cree un
// UserMessage (SDK : `noReply:true` injecte du contexte SANS reponse). Injecter un texte produirait
// un FAUX message utilisateur portant un plan -> INTERDIT par l'operateur.
// Donc le resident NE PARLE JAMAIS dans la conversation : il publie un etat capteur (wake-request.json,
// heartbeat, admission) et le CM relit LUI-MEME ROADMAP.md / review-context.md / heartbeat et
// selectionne LUI-MEME son travail. Aucun faux message, aucun [WAKE=], aucun [PLAN=], aucun micro-plan.
function invokeAgent(reason, primaryId) {
  if (SANDBOX) { appendLog('NO_SPAWN sandbox reason=' + reason); return { invoked: false, sandbox: true }; }
  const plan = dualLanePlan({ cm: cmState(), roadmap: roadmapState() });
  const sensor = {
    at: nowIso(),
    reason: String(reason || ''),
    lane: plan.lane,
    action: plan.action,
    mode: 'SENSOR_ONLY',
    injected_message: false,
    primary_present: !!primaryId,
    note: 'aucun message conversation ; le CM relit son etat et selectionne son travail',
  };
  writeJson(WAKE_REQUEST, sensor);
  appendLog('SENSOR_ONLY reason=' + reason + ' lane=' + plan.lane + ' plan=' + plan.action + ' injected_message=false');
  return { invoked: false, wakeMode: 'SENSOR_ONLY', sensor: true, injectedMessage: false };
}
// --- Boucle residente ---
function tick(state) {
  const primary = resolvePrimary();
  const lastAct = primary.ok ? primaryLastActivity(primary.id) : null;
  const sig = {
    roadmap: roadmapState(),
    cm: cmState(),
    agent: { last_activity_ms: lastAct, idle_ms: lastAct ? Date.now() - lastAct : null },
  };
  const decision = primary.ok
    ? decideInvocation(state, sig)
    : { invoke: false, reason: 'FAIL_CLOSED_NO_PRIMARY:' + primary.via };

  const plan = dualLanePlan(sig);
  let next = Object.assign({}, state, {
    last_check_at: nowIso(),
    lane: plan.lane,
    plan: plan.action,
    non_cm_allowed: canRunNonCmStep(sig),
    progressed: (state.last_invocation_activity_ms != null && sig.agent.last_activity_ms != null && sig.agent.last_activity_ms > state.last_invocation_activity_ms),
    primary_ok: primary.ok,
    primary_via: primary.via,
    roadmap_open: sig.roadmap.open,
    roadmap_blocked: sig.roadmap.blocked,
    x_observation_age_ms: sig.cm.x_observation_age_ms,
    coverage_breach: sig.cm.coverage_breach,
    scheduled_task_dependency: 'NONE',
  });

  if (decision.invoke) {
    const res = invokeAgent(decision.reason, primary.id);
    next.last_invocation_at = nowIso();
    next.last_invocation_activity_ms = sig.agent.last_activity_ms;
    next.last_invocation_reason = decision.reason;
    next.invocation_count = (state.invocation_count || 0) + 1;
    next.handled_signal = res.aborted ? 'ABORTED_SESSION_CREATED' : decision.signal;
    next.handled_signal_at = nowIso();
    next.last_invocation_result = res;
    if (res.aborted) next.abort_reason = 'SESSION_CREATED_BY_INVOCATION';
  } else {
    next.last_decision_reason = decision.reason;
    // Un signal disparu est oublie => il pourra redeclencher plus tard (edge-trigger propre).
    if (decision.reason.indexOf('NO_NEW_SIGNAL') === 0) next.handled_signal = null;
  }
  writeJson(RESIDENT_STATE, next);
  writeJson(RESIDENT_HEARTBEAT, {
    runtime: 'CM_RESIDENT_SUPERVISOR', pid: process.pid, updatedAt: next.last_check_at,
    primary_ok: next.primary_ok, primary_via: next.primary_via,
    roadmap_open: next.roadmap_open, roadmap_blocked: next.roadmap_blocked,
    x_observation_age_ms: next.x_observation_age_ms, coverage_breach: next.coverage_breach,
    agent_idle_ms: sig.agent.idle_ms,
    last_invocation_at: next.last_invocation_at || null, invocation_count: next.invocation_count || 0,
    last_decision_reason: next.last_decision_reason || null,
    lane: next.lane || null, plan: next.plan || null,
    non_cm_allowed: next.non_cm_allowed === true,
    work_progress_required: true,
    progressed: next.progressed === true,
    scheduled_task_dependency: 'NONE', publication: 'NONE', backoff_ms: next.backoff_ms,
  });
  return { next, decision, sig };
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // SINGLE_FLIGHT du superviseur : un seul resident.
  const prevPid = (() => { try { return parseInt(fs.readFileSync(RESIDENT_PID, 'utf8').trim(), 10); } catch (_) { return null; } })();
  if (prevPid && prevPid !== process.pid && pidAlive(prevPid) === true) {
    appendLog('RESIDENT_ALREADY_RUNNING pid_alias=' + String(prevPid).slice(0, 6));
    console.log(JSON.stringify({ resident: 'ALREADY_RUNNING' }));
    return 0;
  }
  fs.writeFileSync(RESIDENT_PID, String(process.pid), 'utf8');
  appendLog('RESIDENT_START pid_alias=' + String(process.pid).slice(0, 6) + ' sandbox=' + !!SANDBOX + ' scheduled_task_dependency=NONE');

  let state = readJsonSafe(RESIDENT_STATE) || {};
  let backoff = state.backoff_ms && state.backoff_ms >= TICK_MIN_MS ? state.backoff_ms : TICK_MIN_MS;
  let iterations = 0;
  for (;;) {
    let out;
    try { out = tick(state); } catch (e) { appendLog('TICK_ERROR ' + e.message); out = { next: state, decision: { invoke: false, reason: 'TICK_ERROR' } }; }
    state = out.next;
    iterations++;
    const changed = out.decision && out.decision.invoke;
    // Tant que la couverture X est stale, on ne laisse PAS le backoff s'allonger : la recuperation
    // prime, et la borne de fraicheur (<=15 min) doit rester tenable malgre la latence du child.
    const staleCoverage = state.coverage_breach === true || (state.x_observation_age_ms != null && state.x_observation_age_ms >= X_REFRESH_SOFT_MS);
    backoff = (changed || staleCoverage) ? TICK_MIN_MS : Math.min(TICK_MAX_MS, Math.round(backoff * 1.5));
    state.backoff_ms = backoff;
    writeJson(RESIDENT_STATE, state);
    if (ONE_SHOT || iterations >= 1 && process.argv.includes('--max-iter=1')) break;
    if (ONE_SHOT) break;
    spawnSync('powershell.exe', ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${backoff}`], { timeout: backoff + 10000, windowsHide: true });
  }
  if (ONE_SHOT) { console.log(JSON.stringify({ resident: 'ONESHOT', state }, null, 1)); return 0; }
  return 0;
}

if (require.main === module) {
  if (process.argv.includes('--status')) {
    console.log(JSON.stringify({ state: readJsonSafe(RESIDENT_STATE), heartbeat: readJsonSafe(RESIDENT_HEARTBEAT) }, null, 1));
    process.exit(0);
  }
  process.exit(main());
}
module.exports = { resolvePrimary, resolvePrimaryFromDb, roadmapState, cmState, decideInvocation, dualLanePlan, canRunNonCmStep, tick, CANONICAL_TITLE, COVERAGE_BREACH_MS, IDLE_ACTION_MS, COOLDOWN_MS, X_FRESHNESS_BOUND_MS, POST_TURN_CONTINUATION_MS, PERSISTENT_SIGNAL_RETRY_MS, X_REFRESH_SOFT_MS };
