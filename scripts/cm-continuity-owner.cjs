// cm-continuity-owner.cjs — continuity owner MINIMAL pour la boucle CM WCORE (WC-01).
//
// Role (P1-RELIABILITY-CONTINUITY-ENFORCEMENT) : apres la fin d'un tour/child, relire l'etat
// DURABLE et decider s'il faut REINVOQUER le workstream CM (travail actionnable), rester en
// PAUSE_RECHECK borne, ou MONITOR. Convention identique au contrat CRS
// `src/codex-review-supervisor/continuity-enforcement.ts` (memes modes/reasons).
//
// INVARIANTS :
// - STRICTEMENT READ-ONLY sur X : ce module n'ouvre AUCUN chemin publish/reply/submit/follow.
//   Il ne fait que lire l'etat durable sur disque et rendre une DECISION.
// - Aucune secret, aucun ID runtime reel dans la sortie.
// - Un blocker local n'est pas un blocker global ; seule une frontiere externe reellement
//   bloquante arrete la branche.
//
// Usage :
//   node scripts/cm-continuity-owner.cjs --state=review-context.md            (decision + JSON)
//   node scripts/cm-continuity-owner.cjs --post-child --state=review-context.md
'use strict';
const fs = require('fs');
const path = require('path');

const MODES = ['CONTINUE_NOW', 'PAUSE_RECHECK', 'MONITOR', 'EXTERNAL_ESCALATION',
  'TERMINATE_EXPLICIT_OPERATOR_ORDER', 'UNKNOWN_NEEDS_EVIDENCE'];

function parseArgs(argv) {
  const a = { state: path.resolve(__dirname, '..', 'review-context.md'), postChild: false,
    now: null, operatorStop: false, externalBlocked: false, signalsToWatch: false };
  for (const t of argv.slice(2)) {
    if (t.startsWith('--state=')) a.state = t.slice(8);
    else if (t === '--post-child') a.postChild = true;
    else if (t.startsWith('--now=')) a.now = t.slice(6);
    else if (t === '--operator-stop') a.operatorStop = true;
    else if (t === '--external-blocked') a.externalBlocked = true;
    else if (t === '--signals-to-watch') a.signalsToWatch = true;
  }
  return a;
}

// Extrait une valeur `KEY=...` (mono-ligne, valeur pouvant s'etaler jusqu'a la clé suivante).
function readKey(text, key) {
  if (!text) return null;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const upper = key.toUpperCase() + '=';
  for (const raw of lines) {
    const line = raw.trim();
    if (line.toUpperCase().startsWith(upper)) {
      const val = line.slice(upper.length).trim();
      return val || null;
    }
  }
  return null;
}

function noneLike(val) {
  if (!val) return true;
  const first = String(val).trim().toUpperCase().split(/[\s(;]/)[0];
  return ['NONE', 'NO', 'FALSE', '0', 'NONE_AT_START', 'AUCUNE', 'AUCUN'].includes(first);
}

// Lit l'etat durable PROJECT-OWNED (review-context.md). Aucun secret, aucun runtime ID.
function readDurableState(statePath) {
  let text = '';
  let read = false;
  try {
    if (statePath && fs.existsSync(statePath)) { text = fs.readFileSync(statePath, 'utf8'); read = true; }
  } catch (_) { text = ''; read = false; }

  const currentTask = readKey(text, 'CURRENT_TASK');
  const priorityId = readKey(text, 'CURRENT_PRIORITY_ID');
  const nextSafeAction = readKey(text, 'NEXT_SAFE_ACTION');
  const blockers = readKey(text, 'BLOCKERS');
  const phase = readKey(text, 'CURRENT_PHASE');

  const cmActive = !!priorityId && /WC-01/i.test(priorityId);
  const blockersNone = noneLike(blockers);
  const hasNextAction = !!nextSafeAction && !noneLike(nextSafeAction);
  // WC-01 actif => workstream principal CM avec du travail immediat (qualifier/reply/editorial).
  const actionableInProgress = cmActive && blockersNone;
  const actionableNextSafeAction = hasNextAction && blockersNone;

  return {
    durableStateRead: read,
    currentTask,
    priorityId,
    cmActive,
    nextSafeAction,
    blockersNone,
    phase,
    // Contrat :
    currentTaskActionable: actionableInProgress,
    nextSafeActionActionable: actionableNextSafeAction,
    actionableRoadmapWork: actionableInProgress || actionableNextSafeAction,
    resumableInProgress: actionableInProgress,
  };
}

function actionableWorkExists(s) {
  return Boolean(
    (s.currentTask && s.currentTaskActionable) ||
    (s.nextSafeAction && s.nextSafeActionActionable) ||
    s.actionableRoadmapWork || s.newlyUnblockedWork || s.resumableInProgress,
  );
}

// Decide la continuite (memes modes que le contrat CRS). Read-only, aucune publication X.
function decideContinuity(s) {
  if (s.explicitOperatorStop === true) {
    return { mode: 'TERMINATE_EXPLICIT_OPERATOR_ORDER', reinvoke: false, reason: 'EXPLICIT_OPERATOR_STOP' };
  }
  if (s.durableStateRead !== true) {
    return { mode: 'UNKNOWN_NEEDS_EVIDENCE', reinvoke: false, reason: 'DURABLE_STATE_NOT_READ' };
  }
  if (s.externalBoundaryBlockingAllContinuation === true) {
    return { mode: 'EXTERNAL_ESCALATION', reinvoke: false, reason: 'HARD_EXTERNAL_BOUNDARY_ALL_CONTINUATION_EXHAUSTED' };
  }
  if (actionableWorkExists(s)) {
    return { mode: 'CONTINUE_NOW', reinvoke: true, reason: 'ACTIONABLE_WORK_PREEMPTS_BACKOFF' };
  }
  if (s.timeGatePending || s.signalsToWatch) {
    return { mode: 'PAUSE_RECHECK', reinvoke: true, reason: s.timeGatePending ? 'TIME_GATE_BOUNDED_RECHECK' : 'SIGNALS_TO_WATCH_BOUNDED_RECHECK' };
  }
  return { mode: 'MONITOR', reinvoke: false, reason: 'NO_OPEN_ACTIONABLE_WORK' };
}

// Apres le retour d'un child : une violation de continuite est RECUPERABLE (log + reinvocation),
// jamais un IDLE silencieux ni une question humaine.
function evaluateChildReturn(s) {
  const d = decideContinuity(s);
  if (d.mode === 'CONTINUE_NOW') {
    return { violation: true, reinvoke: true, code: 'RECOVERABLE_CONTINUITY_VIOLATION_ACTIONABLE_WORK', decision: d };
  }
  return { violation: false, reinvoke: d.reinvoke, code: d.mode, decision: d };
}

function main() {
  const args = parseArgs(process.argv);
  const durable = readDurableState(args.state);
  const state = {
    ...durable,
    explicitOperatorStop: args.operatorStop,
    externalBoundaryBlockingAllContinuation: args.externalBlocked,
    signalsToWatch: args.signalsToWatch,
    nowMs: args.now ? new Date(args.now).getTime() : Date.now(),
  };
  const out = args.postChild ? evaluateChildReturn(state) : { decision: decideContinuity(state) };
  out.read_only = true;
  out.x_publication = 'NONE';
  out.human_message_required = false;
  out.persistent_owner = 'WCORE_CM_CONTINUITY_OWNER';
  console.log(JSON.stringify(out, null, 1));
  return 0;
}

module.exports = { parseArgs, readKey, noneLike, readDurableState, actionableWorkExists, decideContinuity, evaluateChildReturn, MODES };

if (require.main === module) {
  try { process.exitCode = main(); } catch (e) { console.error('ERR', e.message); process.exitCode = 1; }
}
