'use strict';
// Turn-end gate DETERMINISTE (P1-GOV-CM-PERSISTENT-OWNER + frontiere ROOT/CM + P1-CM-TURNEND-CHECKPOINT-SEMANTICS).
// REGLES :
//  1) une action doit etre SINGULIERE, CONCRETE, rattachee a un PRIORITY_ID du domaine CM, avec un OP executable ;
//  2) STARTED exige une PREUVE POSTERIEURE a la selection ;
//  3) la file de travail est CM/ROADMAP.md (via cm-boundary) — ROOT n'est JAMAIS une file de travail CM ;
//  4) NEXT_ACTION_START_IS_NOT_TURN_CONTINUITY : demarrer la NEXT ne clôt PAS le tour ; la NEXT devient CURRENT
//     avec checkpoint=false et doit etre EXECUTEE jusqu'a son propre checkpoint ;
//  5) QUEUE_MUST_BE_RECOMPUTED_AFTER_EACH_CHECKPOINT ;
//  6) une action DEJA COMPLETEE ce tour ne peut pas servir de preuve NEXT demarree.
// Aucun LLM, aucun reseau.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.generated', 'cm-continuity');
const SELECTION = path.join(OUT, 'next-action.json');
const EVIDENCE = path.join(OUT, 'next-action-evidence.json');
const CHECKPOINT = path.join(OUT, 'next-action-checkpoint.json');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } };
function boundary() {
  try { return require(path.join(__dirname, 'cm-boundary.cjs')); } catch (_) { return null; }
}

const META = new Set(['SELECT_NEXT_ACTIONABLE_WORK', 'CONTINUE_ROADMAP', 'ACT_AGAIN', 'CONTINUE', 'SELECT_NEXT', 'NEXT', 'NONE', 'TBD', 'UNKNOWN']);

function validateNextAction(sel, opts) {
  const o = opts || {};
  const reasons = [];
  if (!sel || typeof sel !== 'object') return { ok: false, reasons: ['MISSING_SELECTION'] };
  const action = String(sel.action || '').trim();
  const op = String(sel.op || '').trim();
  const pid = String(sel.priority_id || '').trim();
  if (!action) reasons.push('EMPTY_ACTION');
  if (META.has(action.toUpperCase())) reasons.push('META_SELECTION_IS_NOT_ACTION');
  if (/\bou\b/i.test(action) || /\s\/\s/.test(action)) reasons.push('DISJUNCTIVE_NEXT_ACTION_IS_FORBIDDEN');
  if (!pid) reasons.push('MISSING_PRIORITY_ID');
  if (!op) reasons.push('MISSING_EXECUTABLE_OPERATION');
  const B = boundary();
  if (pid && B && B.isCmWorkItem(pid) === false) reasons.push('ROOT_PRODUCT_TASK_SELECTION_ALLOWED_FALSE');
  if (o.knownIds && pid && !o.knownIds.has(pid)) reasons.push('PRIORITY_ID_NOT_IN_CM_QUEUE');
  return { ok: reasons.length === 0, reasons, action, priority_id: pid, op };
}

function evaluateNextStarted(sel, evidence) {
  if (!sel || !sel.selected_at) return { started: false, reason: 'NO_SELECTION' };
  if (!evidence || !evidence.at) return { started: false, reason: 'NO_EVIDENCE' };
  const tSel = Date.parse(sel.selected_at);
  const tEv = Date.parse(evidence.at);
  if (!Number.isFinite(tSel) || !Number.isFinite(tEv)) return { started: false, reason: 'BAD_TIMESTAMPS' };
  if (tEv <= tSel) return { started: false, reason: 'PREVIOUS_COMPLETED_STEP_CANNOT_MARK_NEXT_STARTED' };
  const evAction = typeof evidence.action === 'string' ? evidence.action : null;
  const matchByString = typeof evidence.matches_action === 'string' && !!sel.action && evidence.matches_action === sel.action;
  if (evidence.matches_action !== undefined && typeof evidence.matches_action === 'boolean' && !evidence.matches_action) {
    return { started: false, reason: 'EVIDENCE_MISMATCHES_ACTION' };
  }
  if (typeof evidence.matches_action === 'string' && sel.action && evidence.matches_action !== sel.action) {
    return { started: false, reason: 'EVIDENCE_MISMATCHES_ACTION' };
  }
  if (evAction && sel.action && evAction !== sel.action) {
    return { started: false, reason: 'EVIDENCE_MISMATCHES_ACTION' };
  }
  if (!evAction && evidence.matches_action !== true && !matchByString) {
    return { started: false, reason: 'EVIDENCE_ACTION_UNSPECIFIED' };
  }
  return { started: true, reason: 'EVIDENCE_AFTER_SELECTION', evidence };
}

function evaluateCheckpoint(sel, cp) {
  if (!sel || !sel.selected_at) return { reached: false, reason: 'NO_SELECTION' };
  if (!cp || !cp.at) return { reached: false, reason: 'NO_CHECKPOINT' };
  const tSel = Date.parse(sel.selected_at);
  const tCp = Date.parse(cp.at);
  if (!Number.isFinite(tSel) || !Number.isFinite(tCp)) return { reached: false, reason: 'BAD_TIMESTAMPS' };
  if (tCp <= tSel) return { reached: false, reason: 'CHECKPOINT_BEFORE_SELECTION' };
  const cpAction = typeof cp.action === 'string' ? cp.action : null;
  if (cpAction && sel.action && cpAction !== sel.action) return { reached: false, reason: 'CHECKPOINT_MISMATCHES_ACTION' };
  return { reached: true, reason: 'CHECKPOINT_AFTER_SELECTION' };
}

// Une action DEJA COMPLETEE ce tour ne peut pas servir de preuve NEXT_CM_ACTION_STARTED.
function validateNextCmStarted(evidence, ctx) {
  const c = ctx || {};
  const started = !!(evidence && evidence.next_cm_action_started === true);
  if (!started) return { started: false, reason: 'NO_NEXT_CM_STARTED' };
  const nextAction = evidence.next_cm_action || null;
  if (!nextAction) return { started: false, reason: 'NEXT_CM_ACTION_UNSPECIFIED' };
  const completed = new Set(c.completedThisTurn || []);
  if (completed.has(nextAction)) return { started: false, reason: 'COMPLETED_PATROL_CANNOT_BE_REUSED_AS_NEXT_STARTED' };
  const cpAt = c.checkpointAt ? Date.parse(c.checkpointAt) : NaN;
  const evAt = evidence.next_cm_action_evidence && evidence.next_cm_action_evidence.at ? Date.parse(evidence.next_cm_action_evidence.at) : NaN;
  if (Number.isFinite(cpAt) && Number.isFinite(evAt) && evAt <= cpAt) {
    return { started: false, reason: 'NEXT_START_BEFORE_CHECKPOINT' };
  }
  return { started: true, reason: 'NEXT_CM_ACTION_REALLY_STARTED', next_action: nextAction };
}

// RECOMPUTE_CM_QUEUE : ce qui est immediatement executable maintenant (hors action courante,
// hors actions deja completees ce tour, hors taches time-gated).
function immediatelyExecutableWork(rows, ctx) {
  const c = ctx || {};
  const done = new Set(c.completedThisTurn || []);
  const gated = new Set(c.timeGated || []);
  const notOwned = new Set(c.notOwnedThisAgent || []);
  const current = c.currentAction || null;
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    const st = String(r.status || '').toUpperCase();
    if (st === 'DONE' || st === 'BLOCKED') return false;
    if (done.has(r.id)) return false;
    if (gated.has(r.id)) return false;
    // CONFORMITY_WORKSTREAM_IS_NOT_LOCAL_CM_WORK : un item possede par un autre workstream
    // (conformite/architecture) n'est PAS executable par cet agent.
    if (notOwned.has(r.id)) return false;
    if (current && r.id === current) return false;
    return true;
  });
}

// Semantique de fin de tour (V2).
//  - demarrer la NEXT n'autorise PAS la fin : la NEXT devient CURRENT, checkpoint=false => START_THEN_FINAL_FORBIDDEN ;
//  - du travail CM immediatement executable et un tour capable d'executer => pas de fin ;
//  - action courante non checkpointee => pas de fin ;
//  - sinon (aucun travail CM immediat) => fin autorisee (honnete : ce n'est pas une preuve de continuite).
function evaluateTurnEnd(o) {
  const s = {
    startedNext: !!(o && o.startedNext),
    currentStarted: !!(o && o.currentStarted),
    checkpointReached: !!(o && o.checkpointReached),
    immediatelyExecutableCmWork: !!(o && o.immediatelyExecutableCmWork),
    currentTurnCanExecute: !(o && o.currentTurnCanExecute === false),
  };
  if (s.startedNext) {
    return {
      finalAllowed: false, reason: 'START_THEN_FINAL_FORBIDDEN',
      effectiveCurrentStarted: true, effectiveCheckpointReached: false,
    };
  }
  if (s.immediatelyExecutableCmWork && s.currentTurnCanExecute) {
    return { finalAllowed: false, reason: 'EXECUTABLE_CM_WORK_EXISTS', effectiveCurrentStarted: s.currentStarted, effectiveCheckpointReached: s.checkpointReached };
  }
  if (s.currentStarted && !s.checkpointReached) {
    return { finalAllowed: false, reason: 'CURRENT_ACTION_NOT_CHECKPOINTED', effectiveCurrentStarted: true, effectiveCheckpointReached: false };
  }
  return { finalAllowed: true, reason: 'NO_IMMEDIATELY_EXECUTABLE_CM_WORK', effectiveCurrentStarted: s.currentStarted, effectiveCheckpointReached: s.checkpointReached };
}

// SENSOR_ONLY ne prouve JAMAIS une continuite post-turn : la liveness capteur n'est pas la liveness modele.
function postTurnContinuityProven(sensor) {
  const s = sensor || {};
  return { proven: false, reason: 'SENSOR_ONLY_DOES_NOT_PROVE_POST_TURN_CONTINUITY', sensor_only: true, model_liveness: false };
}

function finalAllowed(o) {
  return evaluateTurnEnd(o).finalAllowed;
}
function pickNextWork(list) {
  const rows = Array.isArray(list) ? list : [];
  const ip = rows.filter((r) => String(r.status).toUpperCase() === 'IN_PROGRESS');
  if (ip.length) return { picked: ip[0].id, reason: 'ACTIVE_IN_PROGRESS_BEATS_NEW_TODO' };
  const td = rows.filter((r) => String(r.status).toUpperCase() === 'TODO');
  if (td.length) return { picked: td[0].id, reason: 'TODO' };
  return { picked: null, reason: 'NONE' };
}
function preemptWithCm(sig) {
  return !!(sig && (sig.cmDue || sig.operatorCmSignal));
}

module.exports = {
  validateNextAction, evaluateNextStarted, evaluateCheckpoint, evaluateTurnEnd,
  validateNextCmStarted, immediatelyExecutableWork, postTurnContinuityProven,
  finalAllowed, pickNextWork, preemptWithCm, META,
};

// ---- etat disque (CLI uniquement) ----
if (require.main === module) {
  const B = boundary();
  const hb = readJson(path.join(OUT, 'heartbeat.json')) || {};
  const wake = readJson(path.join(OUT, 'wake-request.json')) || {};
  const sel = readJson(SELECTION);
  const ev = readJson(EVIDENCE);
  const cp = readJson(CHECKPOINT);

  const cmQueue = B ? B.readCmQueue() : [];
  const rootRows = (read(B ? B.ROOT_ROADMAP : path.join(ROOT, 'ROADMAP.md')) || '')
    .split(/\r?\n/).filter((l) => /^\| (WC-\d+|P\d-)/.test(l));
  const rootFiltered = B ? B.filterToCmWork(rootRows.map((r) => {
    const c = r.split('|');
    return { id: (c[1] || '').trim(), status: (c[3] || '').trim().toUpperCase() };
  })) : { accepted: [], rejected: [], root_product_selection_count: 0 };

  const knownIds = new Set(cmQueue.map((i) => i.id));
  const counts = { open: 0, todo: 0, inprogress: 0, blocked: 0, done: 0 };
  for (const it of cmQueue) {
    const st = String(it.status).toUpperCase();
    if (st === 'DONE') counts.done++;
    else if (st === 'BLOCKED') counts.blocked++;
    else { counts.open++; if (st === 'IN_PROGRESS') counts.inprogress++; else if (st === 'TODO') counts.todo++; }
  }

  const v = validateNextAction(sel, { knownIds });
  const st = evaluateNextStarted(sel, ev);
  const cpr = evaluateCheckpoint(sel, cp);
  const nextStarted = validateNextCmStarted(ev, { completedThisTurn: (ev && ev.completed_this_turn) || [], checkpointAt: cp && cp.at });
  const exec = immediatelyExecutableWork(cmQueue, { currentAction: sel && sel.action, completedThisTurn: (ev && ev.completed_this_turn) || [], timeGated: (ev && ev.time_gated) || [], notOwnedThisAgent: (ev && ev.not_owned_by_this_agent) || [] });
  const picked = pickNextWork(exec.length ? exec : []);

  const xAt = hb.last_x_observation_at ? Date.parse(hb.last_x_observation_at) : NaN;
  const xAgeMin = Number.isFinite(xAt) ? Number(((Date.now() - xAt) / 60000).toFixed(2)) : null;
  const cmDue = xAgeMin === null || xAgeMin >= 12;

  const te = evaluateTurnEnd({
    startedNext: nextStarted.started === true,
    currentStarted: st.started === true,
    checkpointReached: cpr.reached === true,
    immediatelyExecutableCmWork: exec.length > 0,
    currentTurnCanExecute: true,
  });

  const res = {
    owner: 'WCORE_CM_TURN_END_CHECK',
    CM_ACTIVE_PROJECT_ROOT: B ? B.CM_PROJECT_ROOT : null,
    CM_CANONICAL_ROADMAP: 'CM/ROADMAP.md',
    ROOT_ROADMAP_IS_WORK_QUEUE: false,
    ROOT_PRODUCT_TASK_SELECTION_ALLOWED: false,
    CM_ROOT_PRODUCT_SELECTION_COUNT: 0,
    ROOT_PRODUCT_ITEMS_REJECTED: rootFiltered.root_product_selection_count,
    CM_QUEUE_ITEMS: cmQueue.map((i) => i.id),
    CM_QUEUE_ACTIONABLE_WORK_EXISTS: counts.open > 0,
    CM_QUEUE_OPEN: counts.open,
    ROADMAP_ACTIONABLE_WORK_EXISTS: counts.open > 0,
    CURRENT_CM_ACTION: sel ? sel.action : null,
    CURRENT_ACTIVE_TASK: sel ? sel.action : null,
    NEXT_SAFE_ACTION: sel ? sel.action : null,
    NEXT_SAFE_ACTION_PRIORITY_ID: sel ? sel.priority_id : null,
    NEXT_SAFE_ACTION_OP: sel ? sel.op : null,
    NEXT_SAFE_ACTION_VALID: v.ok,
    NEXT_SAFE_ACTION_INVALID_REASONS: v.reasons,
    NEXT_SAFE_ACTION_PRIORITY_ID_EXISTS: v.priority_id ? knownIds.has(v.priority_id) : false,
    NEXT_SAFE_ACTION_EVIDENCE: ev || null,
    CURRENT_ACTION_STARTED: st.started,
    CURRENT_ACTION_STARTED_REASON: st.reason,
    CURRENT_ACTION_CHECKPOINT_REACHED: cpr.reached,
    CURRENT_ACTION_CHECKPOINT_REASON: cpr.reason,
    NEXT_CM_ACTION_STARTED: nextStarted.started,
    NEXT_CM_ACTION_STARTED_REASON: nextStarted.reason,
    NEXT_CM_ACTION_STARTED_TARGET: nextStarted.next_action || null,
    IMMEDIATELY_EXECUTABLE_CM_WORK_EXISTS: exec.length > 0,
    IMMEDIATELY_EXECUTABLE_CM_WORK: exec.map((i) => i.id),
    NOT_OWNED_BY_THIS_AGENT: (ev && ev.not_owned_by_this_agent) || [],
    CURRENT_AGENT_OWNS_P1_GOV_CM_SHELL_HARMONIZATION: !((ev && ev.not_owned_by_this_agent) || []).includes('P1-GOV-CM-SHELL-HARMONIZATION'),
    NEXT_CM_ACTION_EXISTS: exec.length > 0,
    NEXT_CM_ACTION_PICKED: picked.picked,
    NEXT_CM_ACTION_PICK_REASON: picked.reason,
    CURRENT_TURN_CAN_EXECUTE: true,
    NEXT_ACTION_START_IS_NOT_TURN_CONTINUITY: true,
    START_THEN_FINAL_IS_FORBIDDEN: true,
    QUEUE_MUST_BE_RECOMPUTED_AFTER_EACH_CHECKPOINT: true,
    COMPLETED_NEXT_ACTION_BECOMES_PREVIOUS_ACTION: true,
    X_OBSERVED_AGE_MIN: xAgeMin,
    CM_ACTION_DUE: cmDue,
    SENSOR_MODE: wake.mode || null,
    SENSOR_CAN_WAKE_MODEL: false,
    POST_TURN_CONTINUITY_PROVEN: postTurnContinuityProven(wake).proven,
    POST_TURN_AUTO_REINVOKE_PROVEN: false,
    POST_TURN_LIMITATION: 'OPENCODE_HAS_NO_NONVISIBLE_POST_TURN_CONTINUATION',
    HARD_BLOCKER_GLOBAL: false,
    publication: 'NONE',
  };

  res.FINAL_RESPONSE_ALLOWED = te.finalAllowed;
  res.FINAL_RESPONSE_BLOCKED_REASON = te.finalAllowed ? null : te.reason;
  res.DECISION = res.FINAL_RESPONSE_ALLOWED ? 'ALLOW' : 'CONTINUE';
  res.MODE = res.FINAL_RESPONSE_ALLOWED ? 'REPORT' : 'ACT';

  console.log(JSON.stringify(res, null, 1));
  process.exit(0);
}
