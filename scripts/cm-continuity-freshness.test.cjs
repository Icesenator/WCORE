// cm-continuity-freshness.test.cjs — tests de FRAICHEUR REELLE X et cycle child.
// P1-GOV-CM-PERSISTENT-OWNER (REOPEN_REASON=PATROL_RUNTIME_CADENCE_GAP).
// PROCESS_LIVENESS_IS_NOT_COVERAGE ; FRESH_X_OBSERVATION_IS_COVERAGE.
// Pur + isole (CM_CONTINUITY_DIR sandbox) : aucun opencode, aucune X, aucune publication.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const RUNNER_SRC = path.join(ROOT, 'scripts', 'cm-continuity-runner.cjs');
process.env.CM_CONTINUITY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-fresh-'));
const R = require(RUNNER_SRC);
const HB = path.join(R.OUT_DIR, 'heartbeat.json');
const MIN = 60 * 1000;

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + e.message); } }
function state(o) {
  const now = Date.now();
  return Object.assign({ nowMs: now, leaseActive: false, reinvoke: true, invokeEnabled: true, reason: 'X',
    lastXObservationAt: null, lastWakeAt: null, consecutiveFailures: 0, prevUpdatedAt: new Date(now).toISOString() }, o || {});
}

// TEST_FRESHNESS_1 : child ACTIF mais aucune observation X > 15m => COVERAGE_BREACH=TRUE.
t('TEST_FRESHNESS_1 : child actif + X observation >15m => COVERAGE_BREACH', () => {
  const now = Date.now();
  const p = R.decideWake(state({ leaseActive: true, lastXObservationAt: new Date(now - 16 * MIN).toISOString() }));
  assert.strictEqual(p.coverageBreach, true, 'age 16m > 15m => breach');
  assert.strictEqual(p.action, 'AGENT_ACTIVE_SINGLE_FLIGHT', 'child actif => pas de 2e child');
  assert.strictEqual(p.shouldInvoke, false, 'aucun paralllisme');
});

// TEST_FRESHNESS_2 : child LONG + refresh X avant 15m => COVERAGE_BREACH=FALSE.
t('TEST_FRESHNESS_2 : long child + X refresh <15m => PAS de breach', () => {
  const now = Date.now();
  const p = R.decideWake(state({ leaseActive: true, lastXObservationAt: new Date(now - 5 * MIN).toISOString() }));
  assert.strictEqual(p.coverageBreach, false, 'age 5m <= 15m => pas de breach');
  assert.strictEqual(p.action, 'AGENT_ACTIVE_SINGLE_FLIGHT');
});

// TEST_FRESHNESS_3 : heartbeat / ping CDP n'avance JAMAIS LAST_X_OBSERVATION_AT.
t('TEST_FRESHNESS_3 : heartbeat/CDP ping ne met pas a jour LAST_X_OBSERVATION_AT', () => {
  fs.writeFileSync(HB, JSON.stringify({ updatedAt: new Date().toISOString(), runs: 1, x_surface_cdp: true }, null, 2), 'utf8');
  assert.strictEqual(R.readPipelineState().lastXObservationAt, null, 'heartbeat/cdp ping != observation X');
  // Un token NON detenu => refus (fail-closed : pas de faux marquage de fraicheur).
  assert.strictEqual(R.markXObservation(new Date().toISOString(), 'PING', 'WRONG_TOKEN').ok, false);
  // Une vraie observation (child admis, sans token verifie ici) avance l'horloge.
  const r = R.markXObservation(new Date().toISOString(), 'REAL_READ', null);
  assert.strictEqual(r.ok, true);
  assert.ok(R.readPipelineState().lastXObservationAt, 'horloge avancee par une vraie lecture X');
});

// TEST_RUNTIME_4 : PATROL_SELF_MARK_AT distinct de CHILD_EXIT_AT (linger mesurable).
t('TEST_RUNTIME_4 : PATROL_SELF_MARK_AT distinct de CHILD_EXIT_AT', () => {
  assert.strictEqual(R.computePostPatrolLingerMs('2026-09-15T10:00:00.000Z', '2026-09-15T10:00:30.000Z'), 30000);
  assert.strictEqual(R.computePostPatrolLingerMs(null, '2026-09-15T10:00:30.000Z'), null);
  R.markPatrolComplete('2026-09-15T10:00:00.000Z', 'TEST');
  const hb = JSON.parse(fs.readFileSync(HB, 'utf8'));
  assert.strictEqual(hb.patrol_self_mark_at, '2026-09-15T10:00:00.000Z');
  assert.strictEqual(hb.full_patrol_completed_at, '2026-09-15T10:00:00.000Z');
  // child_exit_at est un champ DISTINCT, ecrit par le runner (pas par le self-mark).
  const src = fs.readFileSync(RUNNER_SRC, 'utf8');
  assert.ok(src.includes('child_exit_at'));
  assert.ok(src.includes('post_patrol_linger_ms'));
});

// TEST_RUNTIME_5 : budget NO_ACTION borne (research defere, exit propre).
t('TEST_RUNTIME_5 : NO_ACTION budget (cible<=9m, plafond<=10m)', () => {
  assert.strictEqual(R.NO_ACTION_RUNTIME_TARGET_MS, 9 * MIN);
  assert.strictEqual(R.NO_ACTION_RUNTIME_HARD_BUDGET_MS, 10 * MIN);
  assert.ok(R.NO_ACTION_RUNTIME_TARGET_MS <= R.NO_ACTION_RUNTIME_HARD_BUDGET_MS);
  const src = fs.readFileSync(RUNNER_SRC, 'utf8');
  assert.ok(src.includes('BUDGET NO_ACTION'), 'budget present dans le spec');
  assert.ok(src.includes('NO_MORE_X_MUTATION_AFTER_SELF_MARK'));
  assert.ok(src.includes('FAST_X_REFRESH'));
});

// TEST_RUNTIME_6 : second tick pendant child actif => aucun 2e child (single-flight).
t('TEST_RUNTIME_6 : 2e tick pendant child actif => single-flight preserve', () => {
  const p = R.decideWake(state({ leaseActive: true, lastXObservationAt: null }));
  assert.strictEqual(p.action, 'AGENT_ACTIVE_SINGLE_FLIGHT');
  assert.strictEqual(p.shouldInvoke, false);
});

// TEST_RUNTIME_7 : une action publique ne peut pas contourner l'admission globale.
t('TEST_RUNTIME_7 : action publique ne contourne pas l\'admission', () => {
  const src = fs.readFileSync(RUNNER_SRC, 'utf8');
  assert.ok(src.includes('PUBLIC_ACTION_FAIL_CLOSED_CONCURRENCY'), 'garde presente');
  fs.writeFileSync(R.ADMISSION, JSON.stringify({ token: 'OTHER', source: 'x', acquiredAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() }), 'utf8');
  assert.strictEqual(R.verifyAdmission('MINE').held, false, 'admission d autrui => fail closed');
  assert.strictEqual(R.verifyAdmission('OTHER').held, true, 'seul le detenteur passe');
});

// PATROL_RUNTIME_CADENCE_GAP : un child mort instantanement (panne provider) ne doit pas bruler le slot.
t('TEST_FRESHNESS_8 : SENSOR_ONLY => aucun spawn d agent, donc aucun risque de child concurrent', () => {
  const src = fs.readFileSync(RUNNER_SRC, 'utf8');
  const body = src.split('function invokeAgentSync')[1].split('function writeWake')[0];
  assert.ok(/SENSOR_ONLY_NO_AGENT_TURN/.test(body), 'retour SENSOR_ONLY attendu');
  assert.ok(!/spawnSync\(/.test(body), 'aucun spawn d agent (donc jamais 2 children)');
});
t('TEST_FRESHNESS_9 : SENSOR_ONLY => aucun retry d agent a classer (plus de chemin transient)', () => {
  const src = fs.readFileSync(RUNNER_SRC, 'utf8');
  const body = src.split('function invokeAgentSync')[1].split('function writeWake')[0];
  assert.ok(!/Cannot connect to API/.test(body), 'ancien classement transient encore present');
  assert.ok(/SENSOR_ONLY_NO_AGENT_TURN/.test(body), 'retour SENSOR_ONLY attendu');
});
t('TEST_FRESHNESS_10 : bornes de cadence coherentes (interval < staleness)', () => {
  assert.ok(R.PATROL_INTERVAL_MS < R.PATROL_MAX_STALENESS_MS, 'interval doit etre < staleness 15m');
  assert.ok(R.CHILD_INSTANT_DEATH_MS > 0 && R.CHILD_INSTANT_DEATH_MS <= 60000, 'seuil mort instantanee borne');
  assert.ok(R.NO_ACTION_RUNTIME_HARD_BUDGET_MS < R.PATROL_MAX_STALENESS_MS, 'budget child < staleness');
});

const TICK_PERIOD_MS = 12 * 60 * 1000; // periode reelle du planificateur 'WCORE CM Continuity Owner'

t('TEST_FRESHNESS_11 : un tick ne peut PAS sauter l observation (seuil derive du tick, pas du feeling)', () => {
  assert.ok(R.PATROL_INTERVAL_MS <= R.PATROL_MAX_STALENESS_MS - TICK_PERIOD_MS,
    'PATROL_INTERVAL_MS doit etre <= 15m - 12m = 3m sinon tout skip produit un gap > 15m');
  // Pire age realiste au moment d un tick : le child a rafraichi X au plus tard a FAST_X_REFRESH_AFTER_MS.
  const worstAgeAtTick = TICK_PERIOD_MS - R.FAST_X_REFRESH_AFTER_MS;
  const now = Date.now();
  const p = R.decideWake({
    nowMs: now,
    lastXObservationAt: new Date(now - worstAgeAtTick).toISOString(),
    lastWakeAt: new Date(now - TICK_PERIOD_MS).toISOString(),
    lastFullPatrolAt: new Date(now - 60 * 1000).toISOString(),
    leaseActive: false, reinvoke: true, invokeEnabled: true,
    consecutiveFailures: 0, prevUpdatedAt: new Date(now - TICK_PERIOD_MS).toISOString(),
    reason: 'ACTIONABLE_WORK_PREEMPTS_BACKOFF',
  });
  assert.strictEqual(p.patrolDue, true, 'au pire age du tick le patrol DOIT etre du (aucun skip)');
  assert.strictEqual(p.action, 'AGENT_INVOKED', 'action=' + p.action);
  assert.strictEqual(p.coverageBreach, false, 'cet age ne doit pas etre une breach');
});

t('TEST_FRESHNESS_12 : pas de wake quand la couverture est vraiment fraiche (anti busywork)', () => {
  const now = Date.now();
  const p = R.decideWake({
    nowMs: now,
    lastXObservationAt: new Date(now - 60 * 1000).toISOString(),
    lastWakeAt: new Date(now - TICK_PERIOD_MS).toISOString(),
    lastFullPatrolAt: new Date(now - 60 * 1000).toISOString(),
    leaseActive: false, reinvoke: true, invokeEnabled: true,
    consecutiveFailures: 0, prevUpdatedAt: new Date(now - TICK_PERIOD_MS).toISOString(),
    reason: 'OK',
  });
  assert.strictEqual(p.patrolDue, false, 'age 1 min < seuil => pas de patrol force');
  assert.ok(!p.coverageBreach, 'fraicheur ok');
});

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
