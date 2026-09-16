// Garde de non-regression — WCORE continuity RESIDENT (P1-GOV-CM-PERSISTENT-OWNER,
// REOPEN_REASON=OPERATOR_SUPERSEDES_SCHEDULED_TASK_ARCHITECTURE).
// POS = comportements exiges ; NEG = regressions qui DOIVENT echouer la garde.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let failed = 0;
function check(id, desc, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + id + '  ' + desc + (ok ? '' : '  -> ' + detail));
}
const src = read('scripts/cm-resident-supervisor.cjs');
const runner = read('scripts/cm-continuity-runner.cjs');
const codeOnly = (s) => s.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');

// ---------- NEG (regressions interdites) ----------
const schTasks = (() => { try { const { execSync } = require('child_process'); return execSync('schtasks /query /fo csv /nh', { encoding: 'utf8', windowsHide: true }); } catch (_) { return ''; } })();
check('NEG_SCHEDULED_TASK_WAKE_REQUIRED', 'aucune tache planifiee de wake agent WCORE',
  !/WCORE CM Continuity Owner/i.test(schTasks), 'tache de wake encore presente');
check('NEG_WAKE_CREATES_NEW_VISIBLE_SESSION', 'aucune primitive de creation de session dans le resident',
  !/--title|--new-session|session create|NEW_SESSION/.test(codeOnly(src)), 'primitive de creation presente');
check('NEG_MAIN_SESSION_MISSING_CREATES_CHILD', 'fin-closed si la principale est introuvable (aucun fallback creation)',
  /FAIL_CLOSED_NO_PRIMARY/.test(src) && !/resolvePrimaryFromDb\(\)\s*\|\|\s*create/i.test(codeOnly(src)), 'fallback de creation');
check('NEG_PATROL_WAKE_SPAWNS_NEW_CONVERSATION', 'le resident N INJECTE AUCUN message (aucun spawn opencode, aucun faux message)',
  !/'run', '--session'/.test(codeOnly(src)) && /SENSOR_ONLY/.test(src), 'injection encore presente');
check('NEG_CONTINUITY_LAUNCH_OPENS_VISIBLE_CMD', 'aucun spawn sans windowsHide dans le resident',
  (src.match(/spawnSync\(/g) || []).length === (src.match(/windowsHide: true/g) || []).length, 'spawn non masque');
check('NEG_DONE_WAITS_FOR_OPERATOR', 'la boucle repropose du travail (pas d attente passive)',
  /ACTIONABLE_WORK_IDLE/.test(src) && /agent inactive while actionable roadmap work remains/.test(src), 'pas de reprise proactive');
check('NEG_LOCAL_BLOCKER_STOPS_AGENT', 'un blocker local n arrete pas le superviseur (monitoring continue)',
  /backoff/.test(codeOnly(src)) && /roadmap_blocked/.test(src), 'arret sur blocker');

// ---------- POS (comportements exiges) ----------
check('POS_RESIDENT_OWNER_STAYS_AVAILABLE', 'runtime resident avec boucle + heartbeat',
  /for \(;;\)/.test(codeOnly(src)) && /resident-heartbeat\.json/.test(src), 'pas de boucle residente');
check('POS_WAKE_OR_EVENT_REUSES_SESSION_PRIMARY', 'le resident resout SESSION_PRIMARY SANS jamais injecter de message',
  /SESSION_PRIMARY/.test(src) && /SENSOR_ONLY/.test(src) && !/Contrat DUAL-LANE/.test(src), 'injection encore presente');
check('POS_ACTIONABLE_ROADMAP_ACTS_IMMEDIATELY', 'travail actionnable => invocation (edge-trigger)',
  /ACTIONABLE_WORK_IDLE/.test(src) && /decideInvocation/.test(src), 'pas de reprise du travail actionnable');
check('POS_DONE_SELECTS_NEXT_WORK', 'le capteur expose lane/action ; le CM selectionne LUI-MEME (aucune consigne injectee)',
  /SELECT_NEXT_ACTIONABLE_WORK/.test(src) && /injected_message: false/.test(src), 'pas d exposition de selection');
check('POS_NO_IMMEDIATE_WORK_MONITORS_BOUNDED', 'monitoring borne (backoff min/max, pas de tight polling)',
  /TICK_MIN_MS/.test(src) && /TICK_MAX_MS/.test(src) && /backoff/.test(src), 'pas de backoff');
check('POS_BLOCKER_DISAPPEARS_RESUMES_WORK', 'signal disparu => oublie (peut redeclencher)',
  /NO_NEW_SIGNAL/.test(src) && /handled_signal = null/.test(src), 'signal non oublie');
check('POS_ZERO_AGENT_WAKE_SCHEDULED_TASKS', 'aucune dependance Scheduled Task dans le code',
  !/Get-ScheduledTask|Register-ScheduledTask|schtasks/i.test(codeOnly(src)), 'dependance scheduler presente');
check('POS_NO_VISIBLE_CMD_ANYWHERE', 'runner + resident : windowsHide partout',
  (runner.match(/spawnSync\(|spawn\(/g) || []).length === (runner.match(/windowsHide: true/g) || []).length, 'runner non masque');

// ---------- POS fonctionnels (unitaire, sans mutation runtime) ----------
const R = require(path.join(ROOT, 'scripts', 'cm-resident-supervisor.cjs'));
check('POS_ROADMAP_COUNT_DERIVED', 'roadmapState derive les compteurs des lignes',
  typeof R.roadmapState === 'function' && typeof R.roadmapState().open === 'number', 'roadmapState indisponible');

// decideInvocation : pas d invocation sans signal ; edge-trigger ; dedup ; cooldown.
const base = { last_invocation_at: null, handled_signal: null, last_work_seen_at: null };
const sigNone = { roadmap: { open: 0, blocked: 0 }, cm: { coverage_breach: false, consecutive_failures: 0 } };
check('POS_NO_SIGNAL_NO_INVOCATION', 'aucun signal => aucune invocation',
  R.decideInvocation(base, sigNone).invoke === false, JSON.stringify(R.decideInvocation(base, sigNone)));
const sigBreach = { roadmap: { open: 5, blocked: 0 }, cm: { coverage_breach: true, consecutive_failures: 0 } };
const d1 = R.decideInvocation(base, sigBreach);
check('POS_COVERAGE_BREACH_TRIGGERS', 'coverage breach => invocation (edge)',
  d1.invoke === true && d1.signal === 'CM_COVERAGE_BREACH', JSON.stringify(d1));
const d2 = R.decideInvocation(Object.assign({}, base, { handled_signal: 'CM_COVERAGE_BREACH' }), sigBreach);
check('POS_DEDUP_SAME_SIGNAL', 'meme signal DANS la fenetre de retry => pas de nouvelle invocation (anti-tight-loop)',
  R.decideInvocation(Object.assign({}, base, { handled_signal: 'CM_COVERAGE_BREACH', handled_signal_at: new Date().toISOString() }), sigBreach).invoke === false,
  JSON.stringify(d2));
const d3 = R.decideInvocation(Object.assign({}, base, { last_invocation_at: new Date().toISOString() }), sigBreach);
check('POS_COOLDOWN', 'cooldown respecte entre deux invocations',
  d3.invoke === false && /COOLDOWN/.test(d3.reason), JSON.stringify(d3));


// ---------- DUAL-LANE (P1-GOV-SINGLE-AGENT-DUAL-LANE, R-024 revise) ----------
// Apres un patrol CM sans action, le MEME agent doit selectionner + DEMARRER le prochain travail.
const CM_SAFE = { cm: { coverage_breach: false, x_observation_age_ms: 60 * 1000 }, roadmap: { open: 24, blocked: 1 } };
const CM_DUE  = { cm: { coverage_breach: true,  x_observation_age_ms: 60 * 1000 }, roadmap: { open: 24, blocked: 1 } };
const planSafe = R.dualLanePlan(CM_SAFE);
const planDue  = R.dualLanePlan(CM_DUE);

check('NO_ACTION_CM_PLUS_ACTIONABLE_ROADMAP_STARTS_REAL_WORK',
  'CM safe + roadmap actionnable => plan NON_CM SELECT_NEXT_ACTIONABLE_WORK + ordre EXECUTER',
  planSafe.lane === 'NON_CM' && planSafe.action === 'SELECT_NEXT_ACTIONABLE_WORK'
    && /mode: 'SENSOR_ONLY'/.test(src), JSON.stringify(planSafe));
check('DONE_SELECTS_AND_STARTS_NEXT_WORK',
  'boucle NON_STOP portee par l agent : plus aucun message de relance n est necessaire',
  /SENSOR_ONLY/.test(src) && /dualLanePlan/.test(src), 'pas de continuation');
check('LOCAL_BLOCKER_SELECTS_OTHER_ACTIONABLE_WORK',
  'un blocker LOCAL ne stoppe pas la selection (open>0 suffit)',
  R.dualLanePlan({ cm: CM_SAFE.cm, roadmap: { open: 5, blocked: 3 } }).action === 'SELECT_NEXT_ACTIONABLE_WORK',
  'blocker local a stoppe la selection');
check('CM_DUE_PREEMPTS_NON_CM_AT_SAFE_CHECKPOINT',
  'CM du => WC01_FIRST (preemption) expose par le capteur',
  planDue.lane === 'CM' && planDue.action === 'WC01_FIRST' && /SENSOR_ONLY/.test(src), JSON.stringify(planDue));
check('NON_CM_WORK_NEVER_BREAKS_X_FRESHNESS_BOUND',
  'canRunNonCmStep : faux a >=15 min, vrai a 14 min',
  R.canRunNonCmStep({ cm: { coverage_breach: false, x_observation_age_ms: 14 * 60 * 1000 } }) === true
    && R.canRunNonCmStep({ cm: { coverage_breach: false, x_observation_age_ms: 16 * 60 * 1000 } }) === false,
  'borne de fraicheur X non respectee');
check('SAME_PRIMARY_SESSION_PRESERVED',
  'SESSION_PRIMARY resolue, jamais dupliquee (aucune creation de session/conversation)',
  /SESSION_PRIMARY/.test(src) && /resolvePrimary/.test(src) && !/session create|NEW_SESSION/.test(codeOnly(src)), 'session non preservee');
check('NO_SECOND_WC01_CHILD',
  'SENSOR_ONLY : le resident ne lance AUCUN child => single-flight trivialement preserve',
  !/spawnSync\(spawnCmd/.test(src) && /SENSOR_ONLY/.test(src), 'single-flight WC-01 non garanti');
check('NO_NEW_VISIBLE_SESSION',
  'aucune primitive de creation de session ni de spawn (aucune conversation creee)',
  !/--title|--new-session|NEW_SESSION/.test(codeOnly(src)) && !/spawnSync\(spawnCmd/.test(src), 'creation possible');
check('NO_SCHEDULED_TASK_AGENT_WAKE',
  'aucune tache planifiee de wake agent + aucune dependance scheduler',
  !/WCORE CM Continuity Owner/i.test(schTasks) && !/Get-ScheduledTask|Register-ScheduledTask/i.test(codeOnly(src)),
  'wake planifie encore present');
check('NO_OPERATOR_ACK_REQUIRED_BETWEEN_NORMAL_WORK',
  'aucune attente d ACK operateur : le CM relit son etat et agit',
  !/readline|wait_for_operator|prompt\(/i.test(codeOnly(src)) && /SENSOR_ONLY/.test(src), 'attente operateur');
check('GREEN_HEARTBEAT_WITH_NO_WORK_PROGRESS_IS_NOT_SUCCESS',
  'le heartbeat exige une progression de travail, pas seulement un vert de processus',
  /GREEN_HEARTBEAT_WITH_NO_WORK_PROGRESS_IS_NOT_SUCCESS/.test(src) && /work_progress_required: true/.test(src),
  'heartbeat vert sans progression accepte');

// ---------- CONTINUITE POST-TOUR (REOPEN POST_DONE_ACTIONABLE_IDLE_GAP) ----------
const SRC = read('scripts/cm-resident-supervisor.cjs');
const SIG_SAFE = { roadmap: { open: 29, blocked: 1 }, cm: { coverage_breach: false, x_observation_age_ms: 60000, consecutive_failures: 0 }, agent: { idle_ms: 60000, last_activity_ms: Date.now() - 60000 } };
const SIG_CM_DUE = { roadmap: { open: 29, blocked: 1 }, cm: { coverage_breach: true, x_observation_age_ms: 900000, consecutive_failures: 0 }, agent: { idle_ms: 60000, last_activity_ms: Date.now() - 60000 } };
const T0 = Date.now() - 10 * 60000;

check('ACTIONABLE_WORK_AFTER_CHILD_EXIT_DOES_NOT_WAIT_10_MIN',
  'fin de tour + travail actionnable => invocation rapide (pas de seuil 10 min)',
  R.decideInvocation({}, SIG_SAFE).invoke === true
    && R.decideInvocation({}, SIG_SAFE).signal === 'ACTIONABLE_WORK_POST_TURN'
    && 60000 < R.IDLE_ACTION_MS && R.POST_TURN_CONTINUATION_MS < R.IDLE_ACTION_MS,
  JSON.stringify(R.decideInvocation({}, SIG_SAFE)));
check('ACTIONABLE_WORK_REINVOKES_SAME_PRIMARY_SESSION',
  'lane NON_CM exposee au capteur ; SESSION_PRIMARY resolue ; aucun message injecte',
  R.decideInvocation({}, SIG_SAFE).lane === 'NON_CM'
    && /SESSION_PRIMARY/.test(SRC) && /SENSOR_ONLY/.test(SRC), 'session non reutilisee');
check('ACTIONABLE_WORK_PROGRESS_REARMS_NEXT_CONTINUATION',
  'progression reelle (time_updated avance) => le signal se re-arme',
  R.decideInvocation({ handled_signal: 'ACTIONABLE_WORK_POST_TURN', last_invocation_activity_ms: T0 },
    { roadmap: SIG_SAFE.roadmap, cm: SIG_SAFE.cm, agent: { idle_ms: 60000, last_activity_ms: T0 + 1000 } }).invoke === true,
  'signal non re-arme apres progression');
check('SAME_SIGNAL_IS_DEDUPED',
  'meme signal SANS progression => pas de nouvelle invocation',
  R.decideInvocation({ handled_signal: 'ACTIONABLE_WORK_POST_TURN', last_invocation_activity_ms: T0 },
    { roadmap: SIG_SAFE.roadmap, cm: SIG_SAFE.cm, agent: { idle_ms: 60000, last_activity_ms: T0 } }).invoke === false,
  'doublon non dedupe');
check('FAILURE_USES_BACKOFF',
  'panne reelle (failures>=2) => signal dedie + backoff borne',
  R.decideInvocation({}, { roadmap: SIG_SAFE.roadmap, cm: { coverage_breach: false, x_observation_age_ms: 60000, consecutive_failures: 3 }, agent: SIG_SAFE.agent }).signal === 'CM_HEALTH_REGRESSION'
    && /TICK_MIN_MS/.test(SRC) && /TICK_MAX_MS/.test(SRC) && /backoff/.test(SRC), 'pas de backoff sur panne');
check('NO_USEFUL_ACTION_USES_BOUNDED_RECHECK',
  'aucun travail => MONITOR_PAUSE_RECHECK borne (pas de boucle)',
  R.dualLanePlan({ cm: SIG_SAFE.cm, roadmap: { open: 0, blocked: 0 } }).action === 'MONITOR_PAUSE_RECHECK'
    && R.decideInvocation({}, { roadmap: { open: 0, blocked: 0 }, cm: SIG_SAFE.cm, agent: SIG_SAFE.agent }).invoke === false,
  'recheck non borne');
check('CM_DUE_PREEMPTS_NON_CM',
  'CM du => CM_COVERAGE_BREACH en tete (aucune micro-etape non-CM)',
  R.decideInvocation({}, SIG_CM_DUE).signal === 'CM_COVERAGE_BREACH' && R.canRunNonCmStep(SIG_CM_DUE) === false,
  JSON.stringify(R.decideInvocation({}, SIG_CM_DUE)));
check('NO_SECOND_WC01_CHILD',
  'SENSOR_ONLY : le resident ne lance AUCUN child => single-flight trivialement preserve',
  !/spawnSync\(spawnCmd/.test(SRC) && /SENSOR_ONLY/.test(SRC), 'single-flight WC-01 non garanti');
check('NO_TIGHT_LOOP',
  'delai minimal post-tour borne (jamais 0) + FAST_COOLDOWN applique',
  R.POST_TURN_CONTINUATION_MS >= 20000 && /FAST_COOLDOWN/.test(SRC)
    && !/while\s*\(true\)/.test(codeOnly(SRC)), 'boucle serree possible');
check('NO_NEW_SESSION',
  'aucune primitive de creation de session ni de spawn',
  !/--title|--new-session|NEW_SESSION/.test(codeOnly(SRC)) && !/spawnSync\(spawnCmd/.test(SRC), 'creation possible');

// ---------- BREACH AUTOWAKE (REOPEN RESIDENT_COVERAGE_BREACH_NOT_AUTOWOKEN) ----------
// Cause prouvee : handled_signal epinglait CM_COVERAGE_BREACH sans borne -> un child rate bloquait
// TOUTE recuperation ulterieure (deadlock 01:50Z -> 04:46Z, 176 min).
const mkCm = (ageMin, breach) => ({ coverage_breach: !!breach, consecutive_failures: 0, x_observation_age_ms: ageMin == null ? null : ageMin * 60000 });
const noAgent = { idle_ms: null, last_activity_ms: null };
const SIG_STALE_HARD = { roadmap: { open: 29, blocked: 1 }, cm: mkCm(20, true), agent: noAgent };
const SIG_STALE_SOFT = { roadmap: { open: 29, blocked: 1 }, cm: mkCm(13, false), agent: noAgent };
const SIG_FRESH = { roadmap: { open: 29, blocked: 1 }, cm: mkCm(2, false), agent: noAgent };

check('BREACH_AUTOWAKE_AFTER_15MIN',
  'X stale (>borne) + resident + primaire resoluble => CM_COVERAGE_BREACH => WC01_FIRST (meme session)',
  (() => { const d = R.decideInvocation({}, SIG_STALE_HARD); const p = R.dualLanePlan(SIG_STALE_HARD);
    return d.invoke === true && d.signal === 'CM_COVERAGE_BREACH' && p.lane === 'CM' && p.action === 'WC01_FIRST'; })(),
  JSON.stringify(R.decideInvocation({}, SIG_STALE_HARD)));
check('DEDUP_DOES_NOT_MASK_PERSISTENT_BREACH',
  'breach PERSISTANT : bloquee dans la fenetre (<90s), RE-INVOQUEE apres (deadlock impossible)',
  R.decideInvocation({ handled_signal: 'CM_COVERAGE_BREACH', handled_signal_at: new Date().toISOString(), last_invocation_at: new Date(Date.now() - 95000).toISOString() }, SIG_STALE_HARD).invoke === false
    && R.decideInvocation({ handled_signal: 'CM_COVERAGE_BREACH', handled_signal_at: new Date(Date.now() - 95000).toISOString(), last_invocation_at: new Date(Date.now() - 95000).toISOString() }, SIG_STALE_HARD).invoke === true,
  'breach persistant non re-invoque (deadlock)');
check('SOFT_REFRESH_PREEMPTS_BEFORE_HARD_BOUND',
  'seuil doux (12 min) => lane CM AVANT la borne dure (marge pour tenir <=15 min)',
  R.dualLanePlan(SIG_STALE_SOFT).lane === 'CM' && R.decideInvocation({}, SIG_STALE_SOFT).signal === 'CM_COVERAGE_BREACH',
  JSON.stringify(R.dualLanePlan(SIG_STALE_SOFT)));
check('NON_X_PROGRESS_NEVER_REFRESHES_X_OBSERVED',
  'le resident ne peut JAMAIS avancer X_OBSERVED (seul le runner sur vraie lecture X)',
  !/last_x_observation_at\s*=/.test(codeOnly(read('scripts/cm-resident-supervisor.cjs')))
    && /hb\.last_x_observation_at\s*=/.test(read('scripts/cm-continuity-runner.cjs')), 'X_OBSERVED avancable hors vraie lecture');
check('POST_TURN_CANNOT_MASK_CM_BREACH',
  'ACTIONABLE_WORK_POST_TURN ne peut pas gagner sur un breach CM',
  R.decideInvocation({}, { roadmap: { open: 29, blocked: 1 }, cm: mkCm(20, true), agent: { idle_ms: 60000, last_activity_ms: Date.now() - 60000 } }).signal === 'CM_COVERAGE_BREACH',
  'le travail non-CM a masque le breach');
check('LANE_CM_ALWAYS_WINS_OVER_NON_CM',
  'lane CM des qu une action CM est due (hard ou soft)',
  R.dualLanePlan(SIG_STALE_HARD).lane === 'CM' && R.dualLanePlan(SIG_STALE_SOFT).lane === 'CM' && R.dualLanePlan(SIG_FRESH).lane === 'NON_CM',
  'lane non-CM a gagne a tort');
check('NO_TIGHT_LOOP_ON_PERSISTENT_BREACH',
  'retry persistant borne (>=30s) et PERSISTENT_SIGNAL_RETRY_MS < X_REFRESH_SOFT_MS',
  R.PERSISTENT_SIGNAL_RETRY_MS >= 30000 && R.PERSISTENT_SIGNAL_RETRY_MS < R.X_REFRESH_SOFT_MS, 'retry non borne');
check('NO_NEW_SESSION_ON_BREACH',
  'aucune primitive de creation de session dans le chemin de breach',
  !/--title|--new-session|NEW_SESSION/.test(codeOnly(read('scripts/cm-resident-supervisor.cjs'))) && !/spawnSync\(spawnCmd/.test(SRC), 'creation possible');
check('NO_SECOND_CHILD_ON_BREACH',
  'SENSOR_ONLY : aucun child cree, meme sous breach',
  !/spawnSync\(spawnCmd/.test(SRC) && /SENSOR_ONLY/.test(SRC), 'single-flight non garanti');

// Defaults: INVOCATION SANS SHELL (cause prouvee du child no-op silencieux).
check('NO_SYNTHETIC_SELF_PROMPT', 'aucun faux message utilisateur : ni [INVOCATION_SOURCE=], ni [WAKE=], ni [PLAN=], ni contrat A-J injecte',
  !/\[INVOCATION_SOURCE=/.test(codeOnly(SRC)) && !/Contrat DUAL-LANE/.test(codeOnly(SRC))
    && !/EXECUTE immediatement UNE micro-etape concrete/.test(codeOnly(SRC)) && !/'run', '--session'/.test(codeOnly(SRC)),
  'faux message utilisateur encore construit');
check('SENSOR_ONLY_NO_MESSAGE', 'le wake est un fichier capteur (wake-request.json), jamais un message de conversation',
  /WAKE_REQUEST/.test(SRC) && /injected_message: false/.test(SRC) && /mode: 'SENSOR_ONLY'/.test(SRC), 'wake non sensor-only');
const runnerSrc = read("scripts/cm-continuity-runner.cjs");
check('ADMISSION_RELEASE_USES_EQUALS_FORM', 'release envoie --token=<valeur> (la forme --token <valeur> echoue en silence)',
  /'--token=' \+ token/.test(SRC) && !/\['--admit-release', '--token', token\]/.test(SRC), 'release encore en forme separateur (admission jamais liberee)');
check('ADMISSION_REGISTERS_HOLDER_PID', 'le PID du detenteur est enregistre (arme le dead-holder 90s)',
  /--pid=/.test(SRC) && /startsWith\('--pid='\)/.test(runnerSrc) && /acquireAdmission\(tok, args\.source \|\| 'child', args\.pid \|\| null\)/.test(runnerSrc), 'PID detenteur non enregistre (TTL 20 min seul)');
console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAIL'));
process.exit(failed === 0 ? 0 : 1);
