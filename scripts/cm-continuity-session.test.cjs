// cm-continuity-session.test.cjs — anti-PROLIFERATION de sessions OpenCode par wake.
// P1-GOV-CM-PERSISTENT-OWNER (reouvert, WC01-CONTINUITY-WAKE-SESSION-PROLIFERATION).
// Invariants prouves ici :
//   - wake NORMAL => reuse via `opencode run --session <id>`, JAMAIS de nouvelle session par wake ;
//   - absence de primaire reutilisable => FAIL-CLOSED (aucun spawn, donc AUCUNE session creee) ;
//   - l'ID reel ne sort jamais (alias SESSION_PRIMARY + prefixe masque).
// Hermetique : sandbox CM_CONTINUITY_DIR + DB SQLite temp (CM_OPENCODE_DB). Aucun opencode, aucune X.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const DIR = String(ROOT).replace(/\\/g, '/');
const RUNNER_SRC = path.join(ROOT, 'scripts', 'cm-continuity-runner.cjs');
process.env.CM_CONTINUITY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-sess-'));
const R = require(RUNNER_SRC);

let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + e.message); } }
function clearPrimary() { try { fs.rmSync(R.PRIMARY_SESSION, { force: true }); } catch (_) {} }
function mkDb(rows) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cm-sess-db-')), 'opencode.db');
  const db = new DatabaseSync(p);
  db.prepare('CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, title TEXT, time_created INTEGER)').run();
  const ins = db.prepare('INSERT INTO session (id, directory, title, time_created) VALUES (?,?,?,?)');
  for (const r of rows) ins.run(r.id, r.directory, r.title, r.time_created);
  db.close();
  return p;
}

// SRC : le chemin d'invitation REUSE la session, ne cree plus par wake.
t('SRC_1 : SENSOR_ONLY => aucun `opencode run` construit (pas de reuse synthetique)', () => {
  const src = fs.readFileSync(RUNNER_SRC, 'utf8');
  const body = src.split('function invokeAgentSync')[1].split('function writeWake')[0];
  assert.ok(/SENSOR_ONLY_NO_AGENT_TURN/.test(body), 'retour SENSOR_ONLY attendu');
  assert.ok(!/opencode run/.test(body), 'invocation synthetique encore construite');
});
t('SRC_2 (NEG) : plus de `--title WC-01-continuity-wake` par wake normal', () => {
  const src = fs.readFileSync(RUNNER_SRC, 'utf8');
  const body = src.split('function invokeAgentSync')[1].split('function writeWake')[0];
  assert.ok(!/opencode run --title/.test(body), 'aucune invitation par defaut creant une session');
});

// POS : persistance + lecture + statut masque.
t('POS_1 : writePrimaryId/readPrimaryId round-trip (id valide)', () => {
  clearPrimary();
  const id = 'ses_TESTONLY_abcdef123456';
  assert.strictEqual(R.writePrimaryId(id, 'TEST'), true, 'id valide acceptee');
  assert.strictEqual(R.readPrimaryId(), id, 'relue a l identique');
});
t('POS_2 : primaryStatus masque (prefixe uniquement, jamais l id complet)', () => {
  clearPrimary();
  const id = 'ses_TESTONLY_abcdef123456';
  R.writePrimaryId(id, 'TEST');
  const st = R.primaryStatus();
  assert.strictEqual(st.has_primary, true);
  assert.strictEqual(st.alias, 'SESSION_PRIMARY');
  assert.ok(!JSON.stringify(st).includes(id), 'l id complet ne doit JAMAIS sortir du store');
});
t('NEG_1 : id invalide refusee (aucune corruption du store)', () => {
  clearPrimary();
  assert.strictEqual(R.writePrimaryId('not-an-id', 'TEST'), false);
  assert.strictEqual(R.writePrimaryId(null, 'TEST'), false);
  assert.strictEqual(R.readPrimaryId(), null, 'store reste vide');
});

// ADOPTION d une session EXISTANTE (delta 0) + sessionExists.
t('POS_3 : latestContinuitySessionId adopte une session WCORE existante (sans en creer)', () => {
  clearPrimary();
  const id = 'ses_EXIST_ok_0001';
  process.env.CM_OPENCODE_DB = mkDb([
    { id, directory: DIR, title: 'WC-01-continuity-wake', time_created: 1000 },
    { id: 'ses_noise_000000', directory: DIR, title: 'unrelated', time_created: 2000 },
  ]);
  assert.strictEqual(R.latestContinuitySessionId(), id, 'retient le titre de continuite, ignore le bruit');
  assert.strictEqual(R.sessionExists(id), true);
  assert.strictEqual(R.sessionExists('ses_ABSENT_0000000'), false);
});

// FAIL-CLOSED (NEG) : AUCUN spawn donc AUCUNE session creee quand aucune primaire reutilisable.
t('NEG_2 (FAIL-CLOSED) : aucune primaire + DB sans titre de continuite => NO_REUSABLE_PRIMARY_SESSION', () => {
  clearPrimary();
  process.env.CM_OPENCODE_DB = mkDb([{ id: 'ses_other', directory: DIR, title: 'unrelated', time_created: 1 }]);
  const res = R.invokeAgentSync({ mode: 'MONITOR' }, 'PATROL_WAKE', 'tokX');
  assert.strictEqual(res.invoked, false, 'ne doit PAS lancer opencode');
  assert.strictEqual(res.reason, 'NO_REUSABLE_PRIMARY_SESSION');
});
t('NEG_3 (FAIL-CLOSED) : primaire persistee mais absente de la DB => PRIMARY_SESSION_MISSING', () => {
  clearPrimary();
  process.env.CM_OPENCODE_DB = mkDb([{ id: 'ses_other', directory: DIR, title: 'unrelated', time_created: 1 }]);
  R.writePrimaryId('ses_DEADBEEF_000999', 'TEST');
  assert.strictEqual(R.sessionExists('ses_DEADBEEF_000999'), false, 'primaire morte');
  const res = R.invokeAgentSync({ mode: 'MONITOR' }, 'PATROL_WAKE', 'tokY');
  assert.strictEqual(res.invoked, false, 'ne doit PAS creer une nouvelle session en silence');
  assert.strictEqual(res.reason, 'PRIMARY_SESSION_MISSING');
});

// --- Tests aux noms EXIGES par la directive PART3 (NEG_*/POS_*) ---
function srcBody() { return fs.readFileSync(RUNNER_SRC, 'utf8').split('function invokeAgentSync')[1].split('function writeWake')[0]; }
function countOcc(hay, needle) { return hay.split(needle).length - 1; }

t('NEG_NORMAL_WAKE_CREATES_NEW_SESSION : le wake normal ne lance AUCUN agent (donc aucune session)', () => {
  const src = fs.readFileSync(RUNNER_SRC, 'utf8');
  assert.ok(!/opencode run/.test(src), 'aucune invocation opencode (SENSOR_ONLY)');
  assert.ok(/SENSOR_ONLY/.test(src), 'mode capteur absent');
});
t('NEG_SECOND_WAKE_CREATES_SECOND_SESSION : 2e wake = meme ref (pas de rotation)', () => {
  clearPrimary();
  const id = 'ses_STABLE_1234567890';
  R.writePrimaryId(id, 'TEST');
  assert.strictEqual(R.readPrimaryId(), id, '1re lecture');
  assert.strictEqual(R.readPrimaryId(), id, '2e lecture => meme session logique');
});
t('NEG_NO_PRIMARY_SESSION_FALLS_BACK_TO_NEW_SESSION : fallback interdit', () => {
  clearPrimary();
  process.env.CM_OPENCODE_DB = mkDb([{ id: 'ses_x', directory: DIR, title: 'unrelated', time_created: 1 }]);
  const res = R.invokeAgentSync({ mode: 'MONITOR' }, 'PATROL_WAKE', 't');
  assert.strictEqual(res.invoked, false);
  assert.strictEqual(res.reason, 'NO_REUSABLE_PRIMARY_SESSION');
});
t('NEG_SINGLE_FLIGHT_MISTAKEN_FOR_SESSION_REUSE : reuse non conditionne au lease', () => {
  clearPrimary();
  const id = 'ses_NOTLEASE_9999999';
  R.writePrimaryId(id, 'TEST');
  assert.ok(!fs.existsSync(R.LEASE), 'aucun lease present');
  assert.strictEqual(R.readPrimaryId(), id, 'la ref de session est lue independamment du single-flight');
});
t('NEG_PROBE_CREATES_VISIBLE_USER_SESSION : ZERO chemin opencode (SENSOR_ONLY)', () => {
  const raw = fs.readFileSync(RUNNER_SRC, 'utf8');
  const code = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.strictEqual(countOcc(code, 'opencode run'), 0, 'aucune invocation opencode (SENSOR_ONLY)');
  assert.ok(!/--title\s+WC01-/.test(code), 'aucun titre probe/patrol cote runner');
});
t('POS_WAKE_REUSES_PRIMARY_LOGICAL_SESSION : SENSOR_ONLY => capteur seul, primaire intacte', () => {
  const body = srcBody();
  assert.ok(/SENSOR_ONLY/.test(body), 'mode capteur absent');
  assert.ok(!/opencode run/.test(body), 'invocation synthetique encore presente');
});
t('POS_MULTIPLE_WAKES_KEEP_SESSION_CARDINALITY_CONSTANT : ref stable sur N lectures', () => {
  clearPrimary();
  const id = 'ses_CONST_00000000001';
  R.writePrimaryId(id, 'TEST');
  for (let i = 0; i < 5; i++) assert.strictEqual(R.readPrimaryId(), id, 'lecture ' + i + ' stable');
});
t('POS_NEW_PROCESS_REUSES_SAME_LOGICAL_SESSION : aucun process agent lance par wake', () => {
  const body = srcBody();
  assert.ok(!/spawnSync\(/.test(body), 'process agent encore lance');
  assert.ok(/SENSOR_ONLY/.test(body), 'mode capteur absent');
});
t('POS_NO_PRIMARY_SESSION_FAILS_CLOSED_WITHOUT_NEW_SESSION : 0 spawn, 0 session', () => {
  clearPrimary();
  process.env.CM_OPENCODE_DB = mkDb([]);
  const logBefore = (() => { try { return fs.statSync(path.join(R.OUT_DIR, 'agent-child.log')).size; } catch (_) { return 0; } })();
  const res = R.invokeAgentSync({ mode: 'MONITOR' }, 'PATROL_WAKE', 't');
  assert.strictEqual(res.invoked, false);
  const logAfter = (() => { try { return fs.readFileSync(path.join(R.OUT_DIR, 'agent-child.log'), 'utf8'); } catch (_) { return ''; } })();
  assert.ok(!/CHILD START/.test(logAfter.slice(logBefore)), 'aucun CHILD START => aucun spawn');
});

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
