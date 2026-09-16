// cm-continuity-gate.test.cjs — tests de GARDE via le runner reel, ISOLES dans un dossier temp
// (CM_CONTINUITY_DIR) : ne touchent JAMAIS l'etat de production.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// Bac a sable isole (jamais l'etat de prod).
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-gate-'));
const HB = path.join(D, 'heartbeat.json');
const LEASE = path.join(D, 'agent-lease.json');
const CHILD = path.join(D, 'agent-child.log');

function w(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n', 'utf8'); }
function r(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return null; } }
function runTick() {
  const res = spawnSync('node', [path.join(ROOT, 'scripts', 'cm-continuity-runner.cjs'), '--tick=1'],
    { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { CM_INVOKE_AGENT: '1', CM_CONTINUITY_DIR: D }) });
  try { return JSON.parse((res.stdout || '').trim()); } catch (_) { return null; }
}
function childLines() { try { return fs.readFileSync(CHILD, 'utf8').split('\n').length; } catch (_) { return 0; } }

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + e.message); } }
const assert = require('assert');

t('I. lease ACTIVE + child vivant => AGENT_ALREADY_ACTIVE_SKIP_INVOCATION, aucun child', () => {
  const now = new Date().toISOString();
  w(LEASE, { status: 'ACTIVE', owner: 'WCORE_CM_CONTINUITY_OWNER', invocation_source: 'CM_CONTINUITY_OWNER', acquiredAt: now, lastSeenAt: now, childPidAlias: 'CM_CHILD_1', publication: 'NONE' });
  fs.writeFileSync(path.join(D, 'child.pid'), String(process.pid), 'utf8'); // PID vivant (le process de test)
  const before = childLines();
  const out = runTick();
  const after = childLines();
  const action = out && out.results && out.results[0] && out.results[0].action;
  assert.strictEqual(action, 'AGENT_ALREADY_ACTIVE_SKIP_INVOCATION', 'action=' + action);
  assert.strictEqual(after, before, 'aucun child ne doit demarrer');
});

t('I2. lease ACTIVE + child mort => FAST recovery meme-tick (lease liberee, plus de tick perdu)', () => {
  const now = new Date().toISOString();
  w(LEASE, { status: 'ACTIVE', owner: 'WCORE_CM_CONTINUITY_OWNER', invocation_source: 'CM_CONTINUITY_OWNER', acquiredAt: now, lastSeenAt: now, childPidAlias: 'CM_CHILD_1', publication: 'NONE' });
  fs.writeFileSync(path.join(D, 'child.pid'), '999999', 'utf8'); // PID inexistant
  const before = childLines();
  const out = runTick();
  const action = out && out.results && out.results[0] && out.results[0].action;
  // FAST recovery : la lease morte est liberee, et le MEME tick poursuit (invocation tentee) au lieu d'attendre
  // le tick suivant. Le bac a sable ne spawne JAMAIS de vrai opencode (garde CM_CONTINUITY_DIR) => pas de child reel.
  const l = r(LEASE);
  assert.strictEqual(l.status, 'RELEASED', 'lease doit etre RELEASED');
  assert.notStrictEqual(action, 'LEASE_RECOVERED_CHILD_EXITED', 'plus de sortie seche (fast recovery)');
  const after = fs.readFileSync(CHILD, 'utf8');
  assert.ok(/CHILD NO_SPAWN/.test(after), 'le tick a poursuivi (tentative d\'invocation, sandbox no-spawn)');
  const starts = (after.match(/CHILD START/g) || []).length;
  assert.strictEqual(starts, 0, 'aucun vrai child spawne (garde bac a sable) => single-flight preserve');
  assert.strictEqual((after.match(/CHILD NO_SPAWN/g) || []).length, 1, 'une seule tentative de reprise (pas de boucle)');
  try { fs.unlinkSync(path.join(D, 'child.pid')); } catch (_) {}
});

t('J. vraie panne recente (non stale) => FAILURE_BACKOFF_SKIP', () => {
  fs.writeFileSync(LEASE, JSON.stringify({ status: 'RELEASED', releasedAt: new Date().toISOString() }, null, 2));
  const nowIso = new Date().toISOString();
  const recentPatrol = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  w(HB, { owner: 'WCORE_CM_CONTINUITY_OWNER', updatedAt: nowIso, runs: 1, beats: [], last_x_observation_at: recentPatrol, last_full_cm_patrol_at: recentPatrol, last_wake_at: nowIso, consecutive_failures: 2, publication: 'NONE' });
  const out = runTick();
  const action = out && out.results && out.results[0] && out.results[0].action;
  assert.strictEqual(action, 'FAILURE_BACKOFF_SKIP', 'action=' + action);
  const hbAfter = r(HB);
  assert.ok(hbAfter && hbAfter.consecutive_failures >= 2, 'failures conservees');
});

t('K. anti-duplication immediate (patrol non du) => DEDUP_COOLDOWN_SKIP, pas d invocation', () => {
  fs.writeFileSync(LEASE, JSON.stringify({ status: 'RELEASED', releasedAt: new Date().toISOString() }, null, 2));
  const recentPatrol = new Date(Date.now() - 60 * 1000).toISOString();
  w(HB, { owner: 'WCORE_CM_CONTINUITY_OWNER', updatedAt: new Date().toISOString(), runs: 1, beats: [], last_x_observation_at: recentPatrol, last_full_cm_patrol_at: recentPatrol, last_wake_at: new Date().toISOString(), consecutive_failures: 0, publication: 'NONE' });
  const out = runTick();
  const action = out && out.results && out.results[0] && out.results[0].action;
  assert.strictEqual(action, 'DEDUP_COOLDOWN_SKIP', 'action=' + action);
});

t('L. PATROL_DUE (dernier patrol ancien, pas de panne) => AGENT_INVOKED (bypass cooldown)', () => {
  // On ne lance PAS de vrai child : on verifie la decision PURE decideWake.
  const M = require('./cm-continuity-runner.cjs');
  const nowMs = Date.now();
  const p = M.decideWake({ leaseActive: false, reinvoke: true, reason: 'ACTIONABLE_WORK_PREEMPTS_BACKOFF',
    lastXObservationAt: new Date(nowMs - M.PATROL_INTERVAL_MS - 60000).toISOString(),
    lastWakeAt: new Date(nowMs - 5000).toISOString(), consecutiveFailures: 0, prevUpdatedAt: new Date(nowMs).toISOString(),
    nowMs, invokeEnabled: true });
  assert.strictEqual(p.shouldInvoke, true);
  assert.strictEqual(p.wakeType, 'PATROL_WAKE');
});

// nettoyage du bac a sable
try { fs.rmSync(D, { recursive: true, force: true }); } catch (_) {}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
