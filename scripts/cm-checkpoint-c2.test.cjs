'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mod = require('./cm-checkpoint-c2.cjs');
const { parseArgs, atomicWrite, writeTestArtifact, collectionSucceeded, assertNotRaw, artifactName } = mod;

function capture(fn) {
  const log = [];
  const err = [];
  const ow = process.stdout.write;
  const ew = process.stderr.write;
  process.stdout.write = (c) => { log.push(String(c)); return true; };
  process.stderr.write = (c) => { err.push(String(c)); return true; };
  return Promise.resolve()
    .then(fn)
    .then((code) => { process.stdout.write = ow; process.stderr.write = ew; return { code, out: log.join(''), err: err.join('') }; })
    .catch((e) => { process.stdout.write = ow; process.stderr.write = ew; throw e; });
}

function runMainCore(args) {
  const saved = process.argv;
  process.argv = ['node', 'cm-checkpoint-c2.cjs', ...args];
  return capture(() => mod.main()).then((r) => { process.argv = saved; return r; });
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cm-c2-test-'));
}

test('atomicWrite: noms distincts (uuid), pas de collision, hash identique, staging nettoye', () => {
  const dir = mkTmp();
  const out = { official_checkpoint: false, incidents: [], surfaces: {}, status: 'DRYRUN_COLLECTED' };
  const a = atomicWrite(path.join(dir, artifactName(new Date('2026-09-13T00:00:00Z'))), out);
  const b = atomicWrite(path.join(dir, artifactName(new Date('2026-09-13T00:00:00Z'))), out);
  assert.notStrictEqual(a.path, b.path);
  assert.strictEqual(a.sha256, b.sha256);
  assert.match(a.sha256, /^[0-9a-f]{64}$/);
  assert.ok(fs.existsSync(a.path) && fs.existsSync(b.path));
  const left = fs.readdirSync(dir).filter((f) => f.endsWith('.staging'));
  assert.strictEqual(left.length, 0);
});

test('atomicWrite: refus overwrite (wx) si la cible finale existe deja', () => {
  const dir = mkTmp();
  const p = path.join(dir, 'fixed.json');
  fs.writeFileSync(p, '{}');
  assert.throws(() => atomicWrite(p, { official_checkpoint: false }));
  assert.strictEqual(fs.readFileSync(p, 'utf8'), '{}');
  const left = fs.readdirSync(dir).filter((f) => f.endsWith('.staging'));
  assert.strictEqual(left.length, 0);
});

test('separation test/officiel: writeTestArtifact refuse official=true et tout chemin RAW', () => {
  const dir = mkTmp();
  assert.throws(() => writeTestArtifact(path.join(dir, 'x.json'), { official_checkpoint: true }), /official_checkpoint=false/);

  const rawAlias = path.join('K:', 'ProjetIA', 'WCORE', '_VAULT', 'raw', 'CM', 'checkpoints', 'x.json');
  assert.throws(() => assertNotRaw(rawAlias), /REFUSED/);

  const traversal = path.join('K:', 'ProjetIA', 'WCORE', '_vault', 'RAW', 'CM', '..', 'evil.json');
  assert.throws(() => assertNotRaw(traversal), /REFUSED/);

  const safe = path.join(dir, 'safe.json');
  assert.strictEqual(assertNotRaw(safe), path.resolve(safe));
});

test('collectionSucceeded: exige auth true, C2 rendered, incidents vides et statut de collecte', () => {
  const ok = { auth_authenticated_read: true, surfaces: { C2: { rendered: true } }, incidents: [], status: 'CHECKPOINT_COLLECTED' };
  assert.strictEqual(collectionSucceeded(ok), true);
  assert.strictEqual(collectionSucceeded({ ...ok, auth_authenticated_read: false }), false);
  assert.strictEqual(collectionSucceeded({ ...ok, surfaces: { C2: { rendered: false } } }), false);
  assert.strictEqual(collectionSucceeded({ ...ok, incidents: ['x'] }), false);
  assert.strictEqual(collectionSucceeded({ ...ok, status: 'CDP_OR_RUNTIME_ERROR' }), false);
});

test('garde: --now sans --guard-only est refuse (code 7), aucun ecriture', async () => {
  const r = await runMainCore(['--mode=checkpoint', '--now=2026-09-14T09:30:00Z']);
  assert.strictEqual(r.code, 7);
  assert.match(r.err, /--now exige --guard-only/);
});

test('garde: checkpoint trop tot -> EARLY_CHECKPOINT_REFUSED (code 4)', async () => {
  const r = await runMainCore(['--mode=checkpoint', '--guard-only', '--now=2026-09-13T00:00:00Z']);
  assert.strictEqual(r.code, 4);
  assert.match(r.out, /EARLY_CHECKPOINT_REFUSED/);
  assert.match(r.out, /"official_checkpoint": false/);
});

test('garde: checkpoint apres seuil -> GUARD_WOULD_PASS, sans collecte ni ecriture (code 0)', async () => {
  const countArtifacts = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('cm-checkpoint-c2-')).length;
  const before = countArtifacts();
  const r = await runMainCore(['--mode=checkpoint', '--guard-only', '--now=2026-09-14T09:30:00Z']);
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /GUARD_WOULD_PASS/);
  assert.match(r.out, /"official_checkpoint": false/);
  assert.strictEqual(countArtifacts(), before);
});

test('garde: --guard-only fonctionne aussi en dryrun (code 0, aucune ecriture)', async () => {
  const r = await runMainCore(['--mode=dryrun', '--guard-only', '--now=2026-09-13T00:00:00Z']);
  assert.strictEqual(r.code, 0);
  assert.match(r.out, /GUARD_WOULD_PASS/);
});

test('parseArgs: --out conserve, defaut dryrun', () => {
  const a = parseArgs(['node', 'x', '--out=C:/tmp/a.json']);
  assert.strictEqual(a.mode, 'dryrun');
  assert.strictEqual(a.out, 'C:/tmp/a.json');
  assert.strictEqual(a.guardOnly, false);
});
