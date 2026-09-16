// cm-continuity-admission.test.cjs — tests NON DESTRUCTIFS de l'ADMISSION GLOBALE WC-01.
// P1-GOV-CM-PERSISTENT-OWNER (REOPEN_REASON=SINGLE_FLIGHT_PATH_COVERAGE_GAP).
// Isoles dans un dossier temp (CM_CONTINUITY_DIR) : ne touchent JAMAIS l'etat de production,
// ne lancent AUCUN opencode, ne publient RIEN sur X.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(ROOT, 'scripts', 'cm-continuity-runner.cjs');

function freshDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cm-adm-')); }
function admissionPath(d) { return path.join(d, 'admission.json'); }
function wAdmission(d, o) { fs.writeFileSync(admissionPath(d), JSON.stringify(o, null, 2) + '\n', 'utf8'); }
function rAdmission(d) { try { return JSON.parse(fs.readFileSync(admissionPath(d), 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return null; } }
function admit(d, token, source) {
  const res = spawnSync('node', [RUNNER, '--admit', `--token=${token}`, `--source=${source || 'child'}`],
    { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { CM_CONTINUITY_DIR: d }) });
  let out = null; try { out = JSON.parse((res.stdout || '').trim()); } catch (_) {}
  return { code: res.status, out };
}
function admitRelease(d, token) {
  const res = spawnSync('node', [RUNNER, '--admit-release', `--token=${token}`],
    { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { CM_CONTINUITY_DIR: d }) });
  let out = null; try { out = JSON.parse((res.stdout || '').trim()); } catch (_) {}
  return { code: res.status, out };
}
// Bac a sable IN-PROCESS (pour les fonctions PURES uniquement : jamais d'ecriture prod).
process.env.CM_CONTINUITY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-adm-sandbox-'));
const R = require(path.join(ROOT, 'scripts', 'cm-continuity-runner.cjs'));

function admitStatus(d, token) {
  const argv = [RUNNER, '--admit-status'];
  if (token) argv.push(`--token=${token}`);
  const res = spawnSync('node', argv, { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { CM_CONTINUITY_DIR: d }) });
  let out = null; try { out = JSON.parse((res.stdout || '').trim()); } catch (_) {}
  return out;
}

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + e.message); } }

// TEST_1 : meme chemin scheduler en chevauchement => un seul admis.
t('TEST_1_SAME_SCHEDULER_OVERLAP : un seul admis', () => {
  const d = freshDir();
  const a = admit(d, 'A', 'scheduler');
  const b = admit(d, 'B', 'scheduler');
  assert.strictEqual(a.out.action, 'WC01_ADMISSION_ACQUIRED', 'A doit etre admis');
  assert.strictEqual(b.out.action, 'WC01_ADMISSION_DENIED_ALREADY_ACTIVE', 'B doit etre refuse');
  assert.strictEqual(b.code, 3, 'refus => exit 3');
});

// TEST_2 : scheduler + second chemin project-owned => un admis, second refuse.
t('TEST_2_SCHEDULER_PLUS_SECOND_PROJECT_PATH : second refuse', () => {
  const d = freshDir();
  const a = admit(d, 'A', 'scheduler');
  const b = admit(d, 'B', 'direct-manual-opencode');
  assert.strictEqual(a.out.action, 'WC01_ADMISSION_ACQUIRED');
  assert.strictEqual(b.out.action, 'WC01_ADMISSION_DENIED_ALREADY_ACTIVE');
  assert.ok(b.out.holder && b.out.holder.token_prefix, 'le holder doit etre rapporte (audit)');
});

// TEST_3 : admission stale => recuperee EXACTEMENT une fois.
t('TEST_3_STALE_LEASE : recover exactly once', () => {
  const d = freshDir();
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 60 min > STALE_ADMISSION_MS
  wAdmission(d, { token: 'DEADTOKEN', source: 'scheduler', acquiredAt: old, lastSeenAt: old, publication: 'NONE' });
  const a = admit(d, 'A', 'scheduler');
  assert.strictEqual(a.out.action, 'WC01_ADMISSION_ACQUIRED', 'A doit recuperer la stale');
  assert.strictEqual(a.out.reason, 'ADMITTED_AFTER_STALE_RECOVERY');
  const b = admit(d, 'B', 'scheduler');
  assert.strictEqual(b.out.action, 'WC01_ADMISSION_DENIED_ALREADY_ACTIVE', 'pas de seconde recuperation');
});

// TEST_4 : crash child => pas de reprise prematuree (age<stale) ; reprise possible apres borne.
t('TEST_4_CHILD_CRASH : future patrol recoverable', () => {
  const d = freshDir();
  const now = new Date().toISOString();
  wAdmission(d, { token: 'HOLDER', source: 'scheduler', acquiredAt: now, lastSeenAt: now, publication: 'NONE' });
  fs.writeFileSync(path.join(d, 'child.pid'), '999999', 'utf8'); // PID mort
  const premature = admit(d, 'B', 'scheduler');
  assert.strictEqual(premature.out.action, 'WC01_ADMISSION_DENIED_ALREADY_ACTIVE', 'pas de reprise avant la borne');
  // Apres la borne de staleness, une reprise bornee est possible.
  const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  wAdmission(d, { token: 'HOLDER', source: 'scheduler', acquiredAt: old, lastSeenAt: old, publication: 'NONE' });
  const rec = admit(d, 'C', 'scheduler');
  assert.strictEqual(rec.out.action, 'WC01_ADMISSION_ACQUIRED', 'reprise apres crash+borne');
});

// TEST_5 : NO_ACTION = completion OK, jamais de failure backoff.
t('TEST_5_NO_ACTION : completion OK, pas de failure backoff', () => {
  const now = Date.now();
  const w = R.decideWake({
    nowMs: now, lastFullPatrolAt: new Date(now - 12 * 60 * 1000).toISOString(),
    lastWakeAt: new Date(now - 12 * 60 * 1000).toISOString(), consecutiveFailures: 0,
    prevUpdatedAt: new Date(now).toISOString(), leaseActive: false, reinvoke: true, invokeEnabled: true, reason: 'NO_ACTION',
  });
  assert.strictEqual(w.backoffLeftMs, 0, 'aucun backoff sur NO_ACTION');
  assert.strictEqual(w.patrolDue, true, 'un patrol reste du (couverture active preservee)');
  assert.strictEqual(w.shouldInvoke, true, 'le patrol doit etre invoque');
  assert.ok(/PATROL_WAKE/.test(w.wakeType), 'wakeType=' + w.wakeType);
});

// TEST_6 : action publique en concurrence ambigue => fail closed.
t('TEST_6_PUBLIC_ACTION_WITH_AMBIGUOUS_CONCURRENCY : fail closed', () => {
  const d1 = freshDir();
  assert.strictEqual(admitStatus(d1, 'MINE').held, false, 'aucune admission => non detenue (fail closed)');
  const d2 = freshDir();
  admit(d2, 'OTHER', 'scheduler');
  const s = admitStatus(d2, 'MINE');
  assert.strictEqual(s.held, false, 'admission detenue par autrui => non detenue pour moi (fail closed)');
  assert.strictEqual(s.any_holder, true, 'un holder existe bien (audit)');
  // Fichier corrompu => acquisition fail-closed (refus), jamais un faux succes.
  const d3 = freshDir();
  fs.writeFileSync(admissionPath(d3), '{ pas du json', 'utf8');
  const bad = admit(d3, 'X', 'scheduler');
  assert.notStrictEqual(bad.out.action, 'WC01_ADMISSION_ACQUIRED', 'corrompu => jamais ACQUIRED');
});

// TEST_7 : deux tentatives ATOMIQUES => exactement un gagnant (attente asynchrone via helper).
t('TEST_7_TWO_ADMISSION_ATTEMPTS_ATOMIC : exactly one winner', (done) => {
  const d = freshDir();
  const helper = path.join(d, '_race.cjs');
  fs.writeFileSync(helper,
    "const{spawn}=require('child_process');\n" +
    "const R=process.env._R, D=process.env._D;\n" +
    "const env=Object.assign({},process.env,{CM_CONTINUITY_DIR:D});\n" +
    "const p1=spawn('node',[R,'--admit','--token=A','--source=scheduler'],{cwd:process.cwd(),env});\n" +
    "const p2=spawn('node',[R,'--admit','--token=B','--source=direct'],{cwd:process.cwd(),env});\n" +
    "let n=0,cs=[];const fin=()=>{cs.sort();console.log(JSON.stringify(cs));};\n" +
    "const chk=()=>{if(++n===2)fin();};p1.on('exit',c=>{cs.push(c);chk();});p2.on('exit',c=>{cs.push(c);chk();});\n", 'utf8');
  const res = spawnSync('node', [helper], { cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, { _R: RUNNER, _D: d }) });
  const codes = JSON.parse((res.stdout || '[]').trim());
  assert.strictEqual(codes.length, 2, 'les deux processus ont termine (codes=' + JSON.stringify(codes) + ')');
  const winners = codes.filter((c) => c === 0).length;
  assert.strictEqual(winners, 1, 'exactement un gagnant (codes=' + JSON.stringify(codes) + ')');
  const adm = rAdmission(d);
  assert.ok(adm && adm.token, 'une admission unique existe');
});

// === P1-GOV-CM-PERSISTENT-OWNER (REOPEN_REASON=FAILED_WAKE_RECOVERY_LATENCY_GAP) ===
// FAST DEAD-HOLDER RECOVERY : un holder PROUVE MORT (PID enregistre non vivant) est reclaimable
// SANS attendre le TTL 20 min ; UNKNOWN (liveness indeterminable) reste fail-closed (TTL conserve).
function seedAdmission(o) { wAdmission(R.OUT_DIR, o); }
const MIN = 60 * 1000;

t('TEST_1_CHILD_DIES_BEFORE_PROGRESS : holder PID mort => reclaim immédiat (< TTL 20 min)', () => {
  seedAdmission({ token: 'deadholder', source: 'scheduler', pid: 999999, acquiredAt: new Date(Date.now() - 2 * MIN).toISOString(), lastSeenAt: new Date(Date.now() - 2 * MIN).toISOString(), publication: 'NONE' });
  const r = R.acquireAdmission('newtok-' + Date.now(), 'scheduler', process.pid);
  assert.strictEqual(r.ok, true, 'doit reclaim (dead holder) — reason=' + r.reason);
  assert.strictEqual(r.reason, 'ADMITTED_AFTER_DEAD_HOLDER_RECOVERY');
  const cur = R.readAdmission();
  assert.strictEqual(cur.pid, process.pid, 'la nouvelle admission porte le PID detenteur (pour detection future)');
  assert.strictEqual(cur.recoveredCause, 'DEAD_HOLDER_PROVEN');
});

t('TEST_2_CHILD_LIVENESS_UNKNOWN : holder PID inconnu => FAIL-CLOSED (pas de reclaim prématuré)', () => {
  seedAdmission({ token: 'unknownholder', source: 'scheduler', pid: null, acquiredAt: new Date(Date.now() - 2 * MIN).toISOString(), lastSeenAt: new Date(Date.now() - 2 * MIN).toISOString(), publication: 'NONE' });
  const r = R.acquireAdmission('newtok2-' + Date.now(), 'scheduler', process.pid);
  assert.strictEqual(r.ok, false, 'UNKNOWN => pas de reclaim');
  assert.strictEqual(r.reason, 'DENIED_ALREADY_ACTIVE');
  assert.strictEqual(r.holder_liveness, 'UNKNOWN');
});

t('TEST_2b_ALIVE_HOLDER : holder PID vivant => jamais reclaim (même au-delà du TTL)', () => {
  seedAdmission({ token: 'aliveholder', source: 'scheduler', pid: process.pid, acquiredAt: new Date(Date.now() - 25 * MIN).toISOString(), lastSeenAt: new Date().toISOString(), publication: 'NONE' });
  const r = R.acquireAdmission('newtok3-' + Date.now(), 'scheduler', process.pid);
  assert.strictEqual(r.ok, false, 'holder vivant => DENIED meme age>TTL');
  assert.strictEqual(r.reason, 'DENIED_ALREADY_ACTIVE');
});

t('TEST_8_STALE_FALLBACK : liveness non prouvable ancienne => TTL 20 min reste le fallback', () => {
  seedAdmission({ token: 'staleno', source: 'scheduler', pid: null, acquiredAt: new Date(Date.now() - 25 * MIN).toISOString(), lastSeenAt: new Date(Date.now() - 25 * MIN).toISOString(), publication: 'NONE' });
  const r = R.acquireAdmission('newtok4-' + Date.now(), 'scheduler', process.pid);
  assert.strictEqual(r.ok, true, 'age>TTL sans pid => reclaim stale');
  assert.strictEqual(r.reason, 'ADMITTED_AFTER_STALE_RECOVERY');
});

t('TEST_8b_DEAD_HOLDER_MIN_GRACE : un holder PID-mort TRÈS récent n est pas reclaim (anti-course)', () => {
  seedAdmission({ token: 'youngdead', source: 'scheduler', pid: 999999, acquiredAt: new Date(Date.now() - 10 * 1000).toISOString(), lastSeenAt: new Date().toISOString(), publication: 'NONE' });
  const r = R.acquireAdmission('newtok5-' + Date.now(), 'scheduler', process.pid);
  assert.strictEqual(r.ok, false, 'trop recent => pas de reclaim (grace)');
  assert.strictEqual(r.reason, 'DENIED_ALREADY_ACTIVE');
});

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
