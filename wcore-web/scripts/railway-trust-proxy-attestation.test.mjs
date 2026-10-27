// Tests exclusivement synthétiques : aucun Git, Railway, réseau ou credential réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = mkdtempSync(join(tmpdir(), 'wcore-attestation-synthetic-'));
const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const SHA = 'a'.repeat(40);
const target = { project: 'synthetic-project-id', environment: 'production', service: 'api', sha: SHA };
const plan = { service: 'api', trustProxyPreflight: true };
const calls = [];
const files = {
  'wcore-web/railway/deploy-manifest.json': JSON.stringify({ productionEnvironment: 'production', configSource: 'config-as-code', services: {
    api: { config: 'wcore-web/railway/api.json', trustProxyPreflight: true },
    web: { config: 'wcore-web/railway/api.json' },
  } }),
  'wcore-web/railway/api.json': JSON.stringify({ build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' } }),
  Dockerfile: 'FROM synthetic\n',
};
const originalSync = cp.spawnSync, originalSpawn = cp.spawn;
cp.spawnSync = (cmd, args = []) => {
  // Windows railway.cmd passe normalement par shell : décoder seulement ce format connu.
  if (cmd.startsWith('railway ')) { args = [...cmd.matchAll(/"([^"]*)"/g)].map(m => m[1]); cmd = 'railway'; }
  calls.push({ cmd, args });
  let stdout = '';
  if (cmd === 'git') {
    if (args[0] === 'rev-parse') stdout = SHA;
    else if (args[0] === 'branch') stdout = 'origin/master';
    else if (args[0] === 'show') stdout = files[args[1].slice(41)] ?? '';
    else if (args[0] === 'ls-tree') stdout = Object.entries(files).map(([p, s]) => `100644 blob ${createHash('sha1').update(`blob ${Buffer.byteLength(s)}\0`).update(s).digest('hex')}\t${p}\0`).join('');
    else assert.ok(['fetch', 'merge-base'].includes(args[0]), `Git inattendu : ${args[0]}`);
  } else {
    assert.equal(cmd, 'railway');
    if (args[0] === 'status') stdout = JSON.stringify({ project: target.project });
    else if (args[0] === 'deployment') stdout = '[]';
    else if (args[0] === 'variable') stdout = JSON.stringify({ TRUST_PROXY: '100.64.0.0/10', SYNTHETIC_SECRET: 'sentinel-never-output' });
    else assert.equal(args[0], 'up');
  }
  return { status: 0, stdout, stderr: '' };
};
cp.spawn = (cmd, args) => {
  calls.push({ cmd, args });
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stdin = new PassThrough();
  if (cmd === 'tar') {
    const dest = args.at(-1);
    for (const [p, content] of Object.entries(files)) { mkdirSync(dirname(join(dest, p)), { recursive: true }); writeFileSync(join(dest, p), content); }
  } else assert.equal(cmd, 'git');
  queueMicrotask(() => child.emit('exit', 0));
  return child;
};
syncBuiltinESMExports();
const { checkTrustProxy, parseArgs, deploy } = await import('./railway-deploy.mjs');
function document(overrides = {}) {
  return { schema: 'wcore.trust-proxy-attestation', version: 1, ...target,
    observedAt: '2026-10-27T11:53:00.000Z', issuedAt: '2026-10-27T11:55:00.000Z', reviewedAt: '2026-10-27T11:54:00.000Z',
    expiresAt: '2026-10-27T12:20:00.000Z', classification: 'VALID_VERIFIED_PROXY',
    topologyVerified: true, operatorConfirmed: true,
    validationRules: 'wcore.trust-proxy.release/v1', driftAcknowledgement: 'wcore.post-observation-drift/v1', ...overrides };
}
function fixture(value) { const path = join(root, 'declaration.json'); writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value)); return path; }
const options = (value) => ({ ...target, trustProxyAttestation: fixture(value) });
const rejected = (opts) => {
  calls.length = 0;
  assert.throws(() => checkTrustProxy(plan, opts, root, NOW), e => e.code === 'E_TRUST_PROXY_ATTESTATION' && !e.message.includes('sentinel') && !e.message.includes(root));
  assert.deepEqual(calls, [], 'Validation purement locale, même lors du refus');
};

test('RED régression : checkTrustProxy ne lit aucune variable, même dry-run', () => {
  calls.length = 0;
  checkTrustProxy(plan, { ...options(document()), dryRun: true }, root, NOW);
  assert.deepEqual(calls, [], 'Ancien comportement : railway variable list expose tout le bulk');
});
test('parse le paramètre explicite', () => {
  assert.equal(parseArgs(['--service','api','--ref','origin/master','--environment','production','--project',target.project,'--trust-proxy-attestation','local.json']).trustProxyAttestation, 'local.json');
});
test('accepte uniquement la déclaration exacte et valide', () => {
  assert.equal(checkTrustProxy(plan, options(document()), root, NOW).mode, 'OPERATOR_DECLARATIVE_ATTESTATION');
});
const bad = {
  schema: { schema: 'other' }, version: { version: 2 }, projet: { project: 'other' }, projet_prefixe: { project: 'synthetic-project' }, service: { service: 'web' },
  environnement: { environment: 'staging' }, SHA: { sha: 'b'.repeat(40) }, SHA_court: { sha: 'abc' },
  classe: { classification: 'LOOPBACK_ONLY' }, non_verifie: { topologyVerified: false }, operateur: { operatorConfirmed: false }, drift: { driftRiskAcknowledged: false },
  observation_apres_revue: { observedAt: '2026-10-27T11:54:01.000Z' }, observation_ancienne: { observedAt: '2026-10-27T11:00:00.000Z' }, policy: { validationRules: 'other' }, drift_policy: { driftAcknowledgement: 'other' },
  perime: { expiresAt: '2026-10-27T12:00:00.000Z' }, futur: { issuedAt: '2026-10-27T12:01:00.000Z' }, revue_future: { reviewedAt: '2026-10-27T12:01:00.000Z' },
  revue_apres_emission: { reviewedAt: '2026-10-27T11:56:00.000Z' }, revue_trop_ancienne: { reviewedAt: '2026-10-27T11:00:00.000Z' },
  duree: { expiresAt: '2026-10-27T12:25:00.001Z' }, date_sans_UTC: { issuedAt: '2026-10-27T11:55:00+00:00' }, date_inexistante: { reviewedAt: '2026-02-30T11:54:00.000Z' },
  secret: { TRUST_PROXY: 'sentinel-secret' }, token: { token: 'sentinel-secret' }, hash: { hash: 'sentinel-sensitive' }, loopback: { classification: 'loopback-only' },
};
for (const [name, changes] of Object.entries(bad)) test(`refuse ${name}`, () => rejected(options(document(changes))));
for (const key of Object.keys(document())) test(`refuse champ absent ${key}`, () => { const d = document(); delete d[key]; rejected(options(d)); });
for (const [name, value] of [['JSON invalide','sentinel-not-json'], ['null',null], ['tableau',[]]]) test(`refuse ${name}`, () => rejected(options(value)));
test('refuse fichier absent / illisible, SHA cible absent et bypass partagé', () => {
  rejected(target); rejected({ ...target, trustProxyAttestation: join(root, 'sentinel-missing') });
  rejected({ ...options(document()), sha: undefined });
  rejected({ ...options(document()), acceptSharedClientIp: true });
});
test('web sans preflight ne requiert aucun fichier', () => assert.equal(checkTrustProxy({ service: 'web', trustProxyPreflight: false }, {}, root, NOW), null));
for (const dryRun of [true, false]) test(`intégration synthétique ${dryRun ? 'dry-run' : 'déploiement'} sans lecture secrets`, async () => {
  calls.length = 0;
  const args = ['--service','api','--ref','origin/master','--environment','production','--project',target.project, ...(dryRun ? ['--dry-run'] : [])];
  await assert.rejects(deploy(args, { repo: root, lockDir: join(root,'locks'), now: NOW, clock: () => NOW, log: () => {} }), { code: 'E_TRUST_PROXY_ATTESTATION' });
  assert.ok(!calls.some(c => c.args.some(a => ['variable','variables','env','up'].includes(a))));
  calls.length = 0;
  const logs = [];
  const result = await deploy([...args,'--trust-proxy-attestation',fixture(document())], { repo: root, lockDir: join(root,'locks'), now: NOW, clock: () => NOW, log: text => logs.push(text) });
  assert.match(logs.join(''), /OPERATOR_DECLARATIVE_ATTESTATION/);
  assert.equal(result.sha, SHA);
  assert.equal(result.published, !dryRun);
  assert.ok(!calls.some(c => c.args.some(a => ['variable','variables','env'].includes(a))));
  assert.equal(calls.filter(c => c.args[0] === 'up').length, dryRun ? 0 : 1);
});
test('refuse fichier trop grand et répertoire sans divulgation', () => {
  rejected(options('x'.repeat(8193)));
  rejected({ ...target, trustProxyAttestation: root });
});
for (const dryRun of [true, false]) test(`revalide expiration avant ${dryRun ? 'résultat' : 'upload'}`, async () => {
  calls.length = 0;
  const args = ['--service','api','--ref','origin/master','--environment','production','--project',target.project,'--trust-proxy-attestation',fixture(document()), ...(dryRun ? ['--dry-run'] : [])];
  await assert.rejects(deploy(args, { repo: root, lockDir: join(root,'locks'), now: NOW, clock: () => NOW + 21 * 60000, log: () => {} }), { code: 'E_TRUST_PROXY_ATTESTATION' });
  assert.ok(!calls.some(c => c.args[0] === 'up'));
});
test('refuse clés JSON dupliquées, y compris échappées', () => {
  const text = JSON.stringify(document());
  rejected(options(text.replace('{', '{"version":1,')));
  rejected(options(text.replace('{', '{"\\u0076ersion":1,')));
});
test('refuse une jonction dans les parents', () => {
  const real = join(root, 'real-parent'); mkdirSync(real);
  writeFileSync(join(real, 'declaration.json'), JSON.stringify(document()));
  const link = join(root, 'linked-parent'); symlinkSync(real, link, 'junction');
  rejected({ ...target, trustProxyAttestation: join(link, 'declaration.json') });
});
test('lecture unique : changement du fichier après observation ne change pas la déclaration en mémoire', () => {
  const opts = options(document());
  const assessment = checkTrustProxy(plan, opts, root, NOW);
  writeFileSync(opts.trustProxyAttestation, 'sentinel-invalid');
  assert.doesNotThrow(() => assessment.revalidate(NOW));
  assert.throws(() => assessment.revalidate(NOW + 21 * 60000), { code: 'E_TRUST_PROXY_ATTESTATION' });
});
test('wrapper PowerShell transmet chemin avec espaces et DryRun sans invoquer Node réel', () => {
  const script = fileURLToPath(new URL('./deploy.ps1', import.meta.url));
  const command = `function node { $args | ConvertTo-Json -Compress; $global:LASTEXITCODE = 0 }; & '${script.replaceAll("'", "''")}' -Service api -Ref origin/master -Environment production -Project synthetic -DryRun -TrustProxyAttestation 'C:\synthetic folder\declaration.json'`;
  const args = JSON.parse(cp.execFileSync('pwsh', ['-NoProfile','-NonInteractive','-Command',command], { encoding: 'utf8' }));
  assert.equal(args[args.indexOf('--trust-proxy-attestation') + 1], 'C:\synthetic folder\declaration.json');
  assert.ok(args.includes('--dry-run'));
});
test.after(() => { cp.spawnSync = originalSync; cp.spawn = originalSpawn; syncBuiltinESMExports(); rmSync(root, { recursive: true, force: true }); });
