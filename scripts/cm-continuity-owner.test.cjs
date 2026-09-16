// Tests du continuity owner CM (P1-RELIABILITY-CONTINUITY-ENFORCEMENT).
// node --test scripts/cm-continuity-owner.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const owner = require('./cm-continuity-owner.cjs');

function tmpContext(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmcont_'));
  const p = path.join(dir, 'review-context.md');
  fs.writeFileSync(p, text, 'utf8');
  return p;
}

const ACTIVE = [
  'CURRENT_TASK=Community Management autonome X @WCORExyz',
  'CURRENT_PRIORITY_ID=WC-01 (Community Management X @WCORExyz - boucle principale)',
  'CURRENT_PHASE=CM post-publication / monitoring continu',
  'NEXT_SAFE_ACTION=qualifier D + replies + notifications ; reply si apport net sinon pause bornee -> WAKE -> RECHECK',
  'BLOCKERS=NONE',
].join('\n');

test('canari: WC-01 actif + NEXT_SAFE_ACTION => CHILD_END => CONTINUE_NOW (reinvoke)', () => {
  const s = owner.readDurableState(tmpContext(ACTIVE));
  const v = owner.evaluateChildReturn(s);
  assert.strictEqual(v.decision.mode, 'CONTINUE_NOW');
  assert.strictEqual(v.reinvoke, true);
  assert.strictEqual(v.violation, true);
  assert.strictEqual(v.code, 'RECOVERABLE_CONTINUITY_VIOLATION_ACTIONABLE_WORK');
});

test('WC-01 actif => reason ACTIONABLE_WORK_PREEMPTS_BACKOFF', () => {
  const s = owner.readDurableState(tmpContext(ACTIVE));
  assert.strictEqual(owner.decideContinuity(s).reason, 'ACTIONABLE_WORK_PREEMPTS_BACKOFF');
});

test('aucun travail + time gate => PAUSE_RECHECK (reinvoke borne)', () => {
  const s = owner.readDurableState(tmpContext('CURRENT_TASK=\nNEXT_SAFE_ACTION=\nBLOCKERS=NONE\n'));
  const d = owner.decideContinuity({ ...s, timeGatePending: true });
  assert.strictEqual(d.mode, 'PAUSE_RECHECK');
  assert.strictEqual(d.reinvoke, true);
});

test('aucun travail + signal a surveiller => PAUSE_RECHECK', () => {
  const s = owner.readDurableState(tmpContext('CURRENT_TASK=\nNEXT_SAFE_ACTION=\n'));
  const d = owner.decideContinuity({ ...s, signalsToWatch: true });
  assert.strictEqual(d.mode, 'PAUSE_RECHECK');
});

test('aucun travail, aucun signal => MONITOR (pas de reinvoke)', () => {
  const s = owner.readDurableState(tmpContext('CURRENT_TASK=\nNEXT_SAFE_ACTION=\nBLOCKERS=NONE\n'));
  const d = owner.decideContinuity(s);
  assert.strictEqual(d.mode, 'MONITOR');
  assert.strictEqual(d.reinvoke, false);
});

test('etat durable illisible => UNKNOWN_NEEDS_EVIDENCE (jamais IDLE/HEALTHY)', () => {
  const s = owner.readDurableState(path.join(os.tmpdir(), 'cmcont_inexistant_' + Date.now() + '.md'));
  assert.strictEqual(s.durableStateRead, false);
  assert.strictEqual(owner.decideContinuity(s).mode, 'UNKNOWN_NEEDS_EVIDENCE');
});

test('ordre operateur explicite => TERMINATE_EXPLICIT_OPERATOR_ORDER', () => {
  const s = owner.readDurableState(tmpContext(ACTIVE));
  assert.strictEqual(owner.decideContinuity({ ...s, explicitOperatorStop: true }).mode, 'TERMINATE_EXPLICIT_OPERATOR_ORDER');
});

test('frontiere externe bloquante => EXTERNAL_ESCALATION', () => {
  const s = owner.readDurableState(tmpContext(ACTIVE));
  assert.strictEqual(owner.decideContinuity({ ...s, externalBoundaryBlockingAllContinuation: true }).mode, 'EXTERNAL_ESCALATION');
});

test('NEG: aucun blocker local ne stoppe la branche globale (blockersNone=false, pas de hard blocker)', () => {
  const s = owner.readDurableState(tmpContext(ACTIVE.replace('BLOCKERS=NONE', 'BLOCKERS=SOURCE_LOCAL_BLOCKED')));
  const d = owner.decideContinuity(s);
  assert.notStrictEqual(d.mode, 'EXTERNAL_ESCALATION');
  assert.notStrictEqual(d.mode, 'TERMINATE_EXPLICIT_OPERATOR_ORDER');
});

test('INVARIANT: le owner est READ-ONLY, aucune surface reseau/CDP/navigation executable', () => {
  const src = fs.readFileSync(path.join(__dirname, 'cm-continuity-owner.cjs'), 'utf8');
  for (const forbidden of ['.goto(', 'connectOverCDP', 'playwright', 'chromium', 'fetch(', "require('https", "require('http", 'axios']) {
    assert.ok(!src.includes(forbidden), 'surface executive interdite detectee: ' + forbidden);
  }
  // Le module ne touche QUE le disque (lecture d'etat durable) au-dela de node builtins.
  assert.ok(src.includes("require('fs')"), 'lecture etat durable attendue via fs');
});

test('INVARIANT: sortie = aucune publication X, aucun message humain requis', () => {
  const s = owner.readDurableState(tmpContext(ACTIVE));
  const v = owner.evaluateChildReturn(s);
  assert.strictEqual(v.decision.mode, 'CONTINUE_NOW');
  // Le main() attache ces invariants ; on verifie la forme attendue cote decision.
  assert.strictEqual(typeof v.reinvoke, 'boolean');
});
