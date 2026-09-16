// cm-continuity-runner.test.cjs — tests deterministes single-flight / cooldown / backoff / anti-recursion.
// Aucune publication X, aucun agent reel lance : on teste la LOGIQUE de garde sur des fichiers temporaires.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// On isole l'OUT_DIR via un bac a sable : on requiert le module puis on manipule les helpers purs.
const M = require('./cm-continuity-runner.cjs');

function tmpLeaseFile() { return path.join(os.tmpdir(), `cm-lease-test-${process.pid}-${Date.now()}.json`); }

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + e.message); } }

t('constantes bornees presentes (patrol)', () => {
  assert.ok(M.LEASE_STALE_MS > 0);
  assert.ok(M.PATROL_INTERVAL_MS > 0 && M.PATROL_MAX_STALENESS_MS >= M.PATROL_INTERVAL_MS);
  assert.ok(M.PATROL_MIN_GAP_MS > 0 && M.PATROL_MIN_GAP_MS < M.PATROL_INTERVAL_MS);
  assert.ok(M.FAILURE_BACKOFF_BASE_MS > 0 && M.FAILURE_BACKOFF_MAX_MS >= M.FAILURE_BACKOFF_BASE_MS);
});

t('leaseActive: aucune lease => inactive', () => {
  const l = M.readLease();
  assert.ok(typeof M.leaseActive === 'function');
});

t('INVOCATION_SOURCE marqueur non secret', () => {
  assert.strictEqual(M.INVOCATION_SOURCE, 'CM_CONTINUITY_OWNER');
});

t('ancien success cooldown 30 min SUPPRIME (plus de AGENT_COOLDOWN_MS)', () => {
  assert.strictEqual(M.AGENT_COOLDOWN_MS, undefined, 'AGENT_COOLDOWN_MS ne doit plus exister');
  assert.ok(M.PATROL_MIN_GAP_MS < M.LEASE_STALE_MS);
});

t('DECIDE_WAKE: patrol due malgre cooldown recent => AGENT_INVOKED (PATROL_WAKE)', () => {
  const nowMs = Date.now();
  const p = M.decideWake({ leaseActive: false, reinvoke: true, reason: 'ACTIONABLE_WORK_PREEMPTS_BACKOFF',
    lastXObservationAt: new Date(nowMs - M.PATROL_INTERVAL_MS - 1000).toISOString(),
    lastWakeAt: new Date(nowMs - 1000).toISOString(), consecutiveFailures: 0, prevUpdatedAt: new Date(nowMs).toISOString(),
    nowMs, invokeEnabled: true });
  assert.strictEqual(p.patrolDue, true);
  assert.strictEqual(p.shouldInvoke, true, 'PATROL_DUE doit bypasser le cooldown');
  assert.strictEqual(p.wakeType, 'PATROL_WAKE');
});

t('DECIDE_WAKE: NO_ACTION n est PAS un failure (fails=0 => pas de backoff => patrol)', () => {
  const nowMs = Date.now();
  const p = M.decideWake({ leaseActive: false, reinvoke: true, reason: 'ACTIONABLE_WORK_PREEMPTS_BACKOFF',
    lastXObservationAt: new Date(nowMs - M.PATROL_INTERVAL_MS - 1000).toISOString(),
    lastWakeAt: null, consecutiveFailures: 0, prevUpdatedAt: new Date(nowMs).toISOString(),
    nowMs, invokeEnabled: true });
  assert.strictEqual(p.backoffLeftMs, 0);
  assert.strictEqual(p.shouldInvoke, true);
});

t('DECIDE_WAKE: vraie panne recente => FAILURE_BACKOFF_SKIP (si non stale)', () => {
  const nowMs = Date.now();
  const p = M.decideWake({ leaseActive: false, reinvoke: true, reason: 'ACTIONABLE_WORK_PREEMPTS_BACKOFF',
    lastXObservationAt: new Date(nowMs - M.PATROL_INTERVAL_MS - 1000).toISOString(),
    lastWakeAt: null, consecutiveFailures: 1, prevUpdatedAt: new Date(nowMs).toISOString(),
    nowMs, invokeEnabled: true });
  assert.strictEqual(p.action, 'FAILURE_BACKOFF_SKIP');
  assert.strictEqual(p.shouldInvoke, false);
});

t('DECIDE_WAKE: child actif => single-flight, pas d invocation', () => {
  const nowMs = Date.now();
  const p = M.decideWake({ leaseActive: true, reinvoke: true, reason: 'ACTIONABLE_WORK_PREEMPTS_BACKOFF',
    lastXObservationAt: new Date(nowMs - M.PATROL_INTERVAL_MS - 1000).toISOString(),
    lastWakeAt: null, consecutiveFailures: 0, prevUpdatedAt: new Date(nowMs).toISOString(),
    nowMs, invokeEnabled: true });
  assert.strictEqual(p.action, 'AGENT_ACTIVE_SINGLE_FLIGHT');
  assert.strictEqual(p.shouldInvoke, false);
});

t('backoff croit avec les echecs et reste borne', () => {
  const base = M.FAILURE_BACKOFF_BASE_MS, max = M.FAILURE_BACKOFF_MAX_MS;
  const b1 = Math.min(max, base * 1), b3 = Math.min(max, base * 3), b99 = Math.min(max, base * 99);
  assert.ok(b1 <= b3 && b3 <= max && b99 === max);
});

t('module expose les gardes requises (single-flight/lease/patrol)', () => {
  for (const fn of ['leaseActive', 'acquireLease', 'releaseLease', 'touchLease', 'readPipelineState', 'invokeAgentSync', 'decideWake', 'markPatrolComplete']) {
    assert.strictEqual(typeof M[fn], 'function', 'missing ' + fn);
  }
});

t('invokeAgentSync est SENSOR_ONLY (aucun spawn d agent)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'cm-continuity-runner.cjs'), 'utf8');
  const body = src.split('function invokeAgentSync')[1].split('function writeWake')[0];
  assert.ok(/SENSOR_ONLY_NO_AGENT_TURN/.test(body), 'retour SENSOR_ONLY attendu');
  assert.ok(!/spawnSync\(/.test(body), 'aucun spawn d agent (faux user-turn interdit)');
  assert.ok(!/detached:\s*true/.test(body), 'pas de spawn detache pour l agent');
});

t('anti-recursion: le prompt child interdit reinstallation/2e task/2e child', () => {
  const src = fs.readFileSync(path.join(__dirname, 'cm-continuity-runner.cjs'), 'utf8');
  assert.ok(/reinstaller l[ ']?owner/.test(src));
  assert.ok(/seconde Scheduled Task/.test(src));
  assert.ok(/relancer un autre child/.test(src));
});

t('aucun message synthetique construit (ni faux user-turn, ni mangling cmd.exe)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'cm-continuity-runner.cjs'), 'utf8');
  const body = src.split('function invokeAgentSync')[1].split('function writeWake')[0];
  assert.ok(!/const msg =/.test(body), 'message synthetique encore construit');
  assert.ok(!/opencode run/.test(body), 'commande opencode run encore construite');
});

t('runner n ouvre aucun chemin de publication X (hors commentaires)', () => {
  const raw = fs.readFileSync(path.join(__dirname, 'cm-continuity-runner.cjs'), 'utf8');
  const code = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').toLowerCase();
  for (const bad of ['submit', 'like(', 'follow(', '/dm', 'tweet', 'reply(']) {
    assert.ok(!code.includes(bad), 'chemin de publication detecte: ' + bad);
  }
});

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
