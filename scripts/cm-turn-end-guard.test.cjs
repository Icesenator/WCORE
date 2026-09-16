// Gardes du turn-end gate — P1-GOV-CM-PERSISTENT-OWNER.
// But : interdire les faux NEXT_SAFE_ACTION_STARTED (meta-verbes, disjonctions, preuve anterieure).
'use strict';
const path = require('path');
const T = require(path.join(__dirname, 'cm-turn-end-check.cjs'));
let failed = 0;
function check(id, desc, ok, detail) {
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + id + '  ' + desc + (ok ? '' : '  -> ' + detail));
}

// 1) un meta-verbe n'est pas une action
check('META_SELECTION_IS_NOT_ACTION', 'SELECT_NEXT_ACTIONABLE_WORK / CONTINUE_ROADMAP / ACT_AGAIN rejetes',
  ['SELECT_NEXT_ACTIONABLE_WORK', 'CONTINUE_ROADMAP', 'ACT_AGAIN'].every((a) =>
    T.validateNextAction({ action: a, priority_id: 'P2-CM-DISCOVERY-RESULT-VALIDATION', op: 'x' })
      .reasons.includes('META_SELECTION_IS_NOT_ACTION')),
  JSON.stringify(T.validateNextAction({ action: 'ACT_AGAIN', priority_id: 'P', op: 'x' })));

// 2) une disjonction est interdite
check('DISJUNCTIVE_NEXT_ACTION_IS_FORBIDDEN', '"A ou B" et "A / B" rejetes',
  T.validateNextAction({ action: 'P2-OBS-FX-PARITY ou P2-CM', priority_id: 'P2-CM-DISCOVERY-RESULT-VALIDATION', op: 'x' })
    .reasons.includes('DISJUNCTIVE_NEXT_ACTION_IS_FORBIDDEN')
  && T.validateNextAction({ action: 'A / B', priority_id: 'P2-CM-DISCOVERY-RESULT-VALIDATION', op: 'x' })
    .reasons.includes('DISJUNCTIVE_NEXT_ACTION_IS_FORBIDDEN'),
  'disjonction acceptee');

// 3) une etape TERMINEE avant la selection ne peut pas marquer STARTED
{
  const sel = { action: 'WC01_ARC_EDITORIAL_PACKAGE', priority_id: 'WC-01', op: 'creer draft', selected_at: '2026-09-16T08:40:00.000Z' };
  const evBefore = { at: '2026-09-16T08:31:12.000Z', kind: 'x-observed', matches_action: 'WC01_ARC_EDITORIAL_PACKAGE' };
  check('PREVIOUS_COMPLETED_STEP_CANNOT_MARK_NEXT_STARTED', 'preuve anterieure => started=false',
    T.evaluateNextStarted(sel, evBefore).started === false
    && T.evaluateNextStarted(sel, evBefore).reason === 'PREVIOUS_COMPLETED_STEP_CANNOT_MARK_NEXT_STARTED',
    JSON.stringify(T.evaluateNextStarted(sel, evBefore)));
}

// 4) STARTED exige une preuve POSTERIEURE et qui CORRESPOND a l'action
{
  const sel = { action: 'WC01_ARC_EDITORIAL_PACKAGE', priority_id: 'WC-01', op: 'creer draft', selected_at: '2026-09-16T08:40:00.000Z' };
  const ok = { at: '2026-09-16T08:41:00.000Z', kind: 'file-created', matches_action: 'WC01_ARC_EDITORIAL_PACKAGE' };
  const mismatch = { at: '2026-09-16T08:41:00.000Z', kind: 'file-created', matches_action: 'AUTRE_CHOSE' };
  check('NEXT_STARTED_REQUIRES_MATCHING_ACTION_EVIDENCE', 'posterieure+meme action => true ; mismatch => false ; absente => false',
    T.evaluateNextStarted(sel, ok).started === true
    && T.evaluateNextStarted(sel, mismatch).started === false
    && T.evaluateNextStarted(sel, null).started === false,
    JSON.stringify({ ok: T.evaluateNextStarted(sel, ok).started, mm: T.evaluateNextStarted(sel, mismatch).reason }));
}

// 5) une tache IN_PROGRESS reprendable prime une TODO
check('ACTIVE_IN_PROGRESS_BEATS_NEW_TODO', 'IN_PROGRESS choisi avant TODO',
  T.pickNextWork([{ id: 'P2-OBS', status: 'TODO' }, { id: 'P2-CM', status: 'IN_PROGRESS' }]).picked === 'P2-CM'
  && T.pickNextWork([{ id: 'P2-OBS', status: 'TODO' }]).picked === 'P2-OBS',
  JSON.stringify(T.pickNextWork([{ id: 'P2-CM', status: 'IN_PROGRESS' }])));

// 6) du travail CM strictement actionnable et executables dans ce tour => reponse finale interdite
check('ACTIONABLE_WORK_WITH_UNSTARTED_NEXT_FORBIDS_FINAL', 'executable CM => false ; aucun executable => true',
  T.finalAllowed({ currentStarted: true, checkpointReached: false, immediatelyExecutableCmWork: false }) === false
  && T.finalAllowed({ currentStarted: true, checkpointReached: true, immediatelyExecutableCmWork: false }) === true
  && T.finalAllowed({ currentStarted: true, checkpointReached: true, immediatelyExecutableCmWork: true }) === false,
  'formule incorrecte');

// 7) un signal CM/operateur preempte le non-CM
check('WC01_OPERATOR_SIGNAL_PREEMPTS_NON_CM', 'CM du ou signal operateur => preemption TRUE',
  T.preemptWithCm({ cmDue: true, operatorCmSignal: false }) === true
  && T.preemptWithCm({ cmDue: false, operatorCmSignal: true }) === true
  && T.preemptWithCm({ cmDue: false, operatorCmSignal: false }) === false,
  'preemption CM non appliquee');

// 8) ROBUSTESSE DE FORME DE LA PREUVE — bug reel trouve au runtime le 2026-09-16 :
//    une preuve `{matches_action:true}` (booleen) etait comparee comme une CHAINE => EVIDENCE_MISMATCHES_ACTION
//    => faux negatif (l'action etait en fait bien demarree). La forme bool doit etre acceptee.
{
  const sel = { action: 'WC01_ARC_EDITORIAL_PACKAGE', priority_id: 'WC-01', op: 'creer draft', selected_at: '2026-09-16T08:40:00.000Z' };
  const boolMatch = { at: '2026-09-16T08:41:00.000Z', action: 'WC01_ARC_EDITORIAL_PACKAGE', matches_action: true };
  const boolOnly = { at: '2026-09-16T08:41:00.000Z', matches_action: true };
  const boolFalse = { at: '2026-09-16T08:41:00.000Z', matches_action: false };
  const strMismatch = { at: '2026-09-16T08:41:00.000Z', matches_action: 'AUTRE_CHOSE' };
  const unspecified = { at: '2026-09-16T08:41:00.000Z', kind: 'file-created' };
  check('EVIDENCE_ACTION_SHAPE_ROBUST', 'booleen true et chaine identique acceptes ; false/mismatch/non specifie rejetes',
    T.evaluateNextStarted(sel, boolMatch).started === true
    && T.evaluateNextStarted(sel, boolOnly).started === true
    && T.evaluateNextStarted(sel, boolFalse).started === false
    && T.evaluateNextStarted(sel, strMismatch).reason === 'EVIDENCE_MISMATCHES_ACTION'
    && T.evaluateNextStarted(sel, unspecified).reason === 'EVIDENCE_ACTION_UNSPECIFIED',
    JSON.stringify({
      bm: T.evaluateNextStarted(sel, boolMatch).reason,
      bo: T.evaluateNextStarted(sel, boolOnly).reason,
      bf: T.evaluateNextStarted(sel, boolFalse).reason,
      sm: T.evaluateNextStarted(sel, strMismatch).reason,
      un: T.evaluateNextStarted(sel, unspecified).reason,
    }));
}

// 9) STARTED seul ne suffit pas : action courante non checkpointee => on continue
check('STARTED_ALONE_IS_NOT_ENOUGH', 'STARTED=true + checkpoint=false => FINAL_RESPONSE_ALLOWED=false',
  T.evaluateTurnEnd({ currentStarted: true, checkpointReached: false, nextCmExists: false, nextCmStarted: false }).finalAllowed === false
  && T.evaluateTurnEnd({ currentStarted: true, checkpointReached: false, nextCmExists: false, nextCmStarted: false }).reason === 'CURRENT_ACTION_NOT_CHECKPOINTED',
  JSON.stringify(T.evaluateTurnEnd({ currentStarted: true, checkpointReached: false })));

// 10) V2 : apres checkpoint, s'il reste du travail CM immediatement executable => on continue (recompute obligatoire)
check('NEXT_CM_ACTION_MUST_BE_STARTED_AFTER_CHECKPOINT', 'checkpoint + executable CM => false (EXECUTABLE_CM_WORK_EXISTS)',
  T.evaluateTurnEnd({ currentStarted: true, checkpointReached: true, immediatelyExecutableCmWork: true, currentTurnCanExecute: true }).finalAllowed === false
  && T.evaluateTurnEnd({ currentStarted: true, checkpointReached: true, immediatelyExecutableCmWork: true }).reason === 'EXECUTABLE_CM_WORK_EXISTS',
  JSON.stringify(T.evaluateTurnEnd({ currentStarted: true, checkpointReached: true, immediatelyExecutableCmWork: true })));

// 11) checkpoint atteint, plus de travail CM => reponse autorisee
check('CHECKPOINT_WITH_NO_NEXT_CM_WORK_ALLOWS', 'checkpoint=true + nextCmExists=false => true',
  T.evaluateTurnEnd({ currentStarted: true, checkpointReached: true, nextCmExists: false, nextCmStarted: false }).finalAllowed === true,
  JSON.stringify(T.evaluateTurnEnd({ currentStarted: true, checkpointReached: true })));

// 12) une action ROOT n'est pas une action CM (frontiere appliquee par le gate lui-meme)
check('ROOT_NEXT_ACTION_IS_NOT_CM_WORK', 'P2-OBS / WC-11 / Kraken rejetes par validateNextAction',
  ['P2-OBS-FX-PARITY-WEB-SIDE', 'WC-11', 'P1-REL-KRAKEN-NONCE-LOCKOUT', 'P1-OBS-GSHEET-HTTP-ATTRIBUTION']
    .every((pid) => T.validateNextAction({ action: 'reprendre ' + pid, priority_id: pid, op: 'x' })
      .reasons.includes('ROOT_PRODUCT_TASK_SELECTION_ALLOWED_FALSE'))
  && T.validateNextAction({ action: 'patrol X WC-01', priority_id: 'WC-01', op: 'lire X' }).ok === true,
  JSON.stringify(T.validateNextAction({ action: 'a', priority_id: 'P2-OBS-FX-PARITY-WEB-SIDE', op: 'x' }).reasons));

// 13) un checkpoint anterieur a la selection ne compte pas
{
  const sel = { action: 'A', priority_id: 'WC-01', op: 'x', selected_at: '2026-09-16T09:00:00.000Z' };
  const cpOld = { at: '2026-09-16T08:59:00.000Z', action: 'A' };
  const cpOk = { at: '2026-09-16T09:01:00.000Z', action: 'A' };
  const cpOther = { at: '2026-09-16T09:01:00.000Z', action: 'B' };
  check('CHECKPOINT_BEFORE_SELECTION_REJECTED', 'checkpoint anterieur ou mismatch => non atteint',
    T.evaluateCheckpoint(sel, cpOld).reached === false
    && T.evaluateCheckpoint(sel, cpOld).reason === 'CHECKPOINT_BEFORE_SELECTION'
    && T.evaluateCheckpoint(sel, cpOther).reason === 'CHECKPOINT_MISMATCHES_ACTION'
    && T.evaluateCheckpoint(sel, cpOk).reached === true,
    JSON.stringify({ old: T.evaluateCheckpoint(sel, cpOld).reason, ok: T.evaluateCheckpoint(sel, cpOk).reason }));
}

// 14) un PRIORITY_ID absent de la file CM est rejete
check('PRIORITY_ID_MUST_BE_IN_CM_QUEUE', 'un ID hors file CM => PRIORITY_ID_NOT_IN_CM_QUEUE',
  T.validateNextAction({ action: 'patrol', priority_id: 'WC-01', op: 'x' }, { knownIds: new Set(['WC-01']) }).ok === true
  && T.validateNextAction({ action: 'patrol', priority_id: 'P1-GOV-CM-INEXISTANT', op: 'x' }, { knownIds: new Set(['WC-01']) })
    .reasons.includes('PRIORITY_ID_NOT_IN_CM_QUEUE'),
  'file CM non appliquee');

// 15) V2 : demarrer la NEXT n'est PAS une continuite de tour (START -> FINAL interdit)
check('START_NEXT_THEN_FINAL_FORBIDDEN', 'startedNext=true => FINAL_RESPONSE_ALLOWED=false quoi qu\'il arrive',
  T.evaluateTurnEnd({ startedNext: true, currentStarted: true, checkpointReached: true, immediatelyExecutableCmWork: false, currentTurnCanExecute: true }).finalAllowed === false
  && T.evaluateTurnEnd({ startedNext: true, currentStarted: true, checkpointReached: true, immediatelyExecutableCmWork: false })
    .reason === 'START_THEN_FINAL_FORBIDDEN',
  JSON.stringify(T.evaluateTurnEnd({ startedNext: true })));

// 16) la NEXT demarree devient CURRENT avec checkpoint=false
{
  const r = T.evaluateTurnEnd({ startedNext: true, currentStarted: false, checkpointReached: false, immediatelyExecutableCmWork: false });
  check('STARTED_NEXT_BECOMES_CURRENT', 'startedNext => effectiveCurrentStarted=true ET effectiveCheckpointReached=false',
    r.effectiveCurrentStarted === true && r.effectiveCheckpointReached === false,
    JSON.stringify(r));
}

// 17) action courante sans checkpoint => pas de reponse finale
check('CURRENT_WITHOUT_CHECKPOINT_FORBIDS_FINAL', 'currentStarted + !checkpoint => false',
  T.evaluateTurnEnd({ currentStarted: true, checkpointReached: false, immediatelyExecutableCmWork: false }).finalAllowed === false,
  JSON.stringify(T.evaluateTurnEnd({ currentStarted: true, checkpointReached: false })));

// 18) checkpoint atteint mais travail CM immediatement executable => pas de reponse finale
check('CHECKPOINT_WITH_EXECUTABLE_CM_WORK_FORBIDS_FINAL', 'checkpoint + executable CM => false',
  T.evaluateTurnEnd({ currentStarted: true, checkpointReached: true, immediatelyExecutableCmWork: true, currentTurnCanExecute: true }).finalAllowed === false
  && T.evaluateTurnEnd({ currentStarted: true, checkpointReached: true, immediatelyExecutableCmWork: true }).reason === 'EXECUTABLE_CM_WORK_EXISTS',
  JSON.stringify(T.evaluateTurnEnd({ currentStarted: true, checkpointReached: true, immediatelyExecutableCmWork: true })));

// 19) une action terminee ce tour ne peut pas resservir de NEXT demarree
{
  const ev = { next_cm_action: 'WC-01', next_cm_action_started: true, next_cm_action_evidence: { at: '2026-09-16T09:40:00.000Z' } };
  const bad = T.validateNextCmStarted(ev, { completedThisTurn: ['WC-01'], checkpointAt: '2026-09-16T09:35:00.000Z' });
  const good = T.validateNextCmStarted(ev, { completedThisTurn: [], checkpointAt: '2026-09-16T09:35:00.000Z' });
  const pre = T.validateNextCmStarted(ev, { completedThisTurn: [], checkpointAt: '2026-09-16T09:45:00.000Z' });
  check('COMPLETED_PATROL_CANNOT_BE_REUSED_AS_NEXT_STARTED', 'action completee => refus ; non completee + posterieure => ok ; anterieure au checkpoint => refus',
    bad.started === false && bad.reason === 'COMPLETED_PATROL_CANNOT_BE_REUSED_AS_NEXT_STARTED'
    && good.started === true && pre.reason === 'NEXT_START_BEFORE_CHECKPOINT',
    JSON.stringify({ bad: bad.reason, good: good.reason, pre: pre.reason }));
}

// 20) SENSOR_ONLY ne prouve jamais une continuite post-turn
check('SENSOR_ONLY_DOES_NOT_PROVE_POST_TURN_CONTINUITY', 'capteur vivant => proven=false',
  T.postTurnContinuityProven({ mode: 'SENSOR_ONLY' }).proven === false
  && T.postTurnContinuityProven({ mode: 'SENSOR_ONLY' }).reason === 'SENSOR_ONLY_DOES_NOT_PROVE_POST_TURN_CONTINUITY',
  JSON.stringify(T.postTurnContinuityProven({ mode: 'SENSOR_ONLY' })));

// 21) la queue est recalculee apres checkpoint : l'action completee sort des candidats executables
check('TURN_END_RECOMPUTE_AFTER_CHECKPOINT', 'completedThisTurn exclu de la file executable',
  (() => {
    const rows = [{ id: 'WC-01', status: 'IN_PROGRESS' }, { id: 'P2-CM-X', status: 'IN_PROGRESS' }];
    const all = T.immediatelyExecutableWork(rows, {});
    const after = T.immediatelyExecutableWork(rows, { completedThisTurn: ['WC-01'] });
    return all.length === 2 && after.length === 1 && after[0].id === 'P2-CM-X';
  })(),
  JSON.stringify(T.immediatelyExecutableWork([{ id: 'WC-01', status: 'IN_PROGRESS' }, { id: 'P2-CM-X', status: 'IN_PROGRESS' }], { completedThisTurn: ['WC-01'] })));

console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAIL'));
process.exit(failed === 0 ? 0 : 1);
