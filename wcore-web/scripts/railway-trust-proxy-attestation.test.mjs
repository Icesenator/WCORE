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
    if (args[0] === 'status') stdout = JSON.stringify({ id: target.project, name: 'WCORE' }); // forme réelle de `railway status --json` (CLI 5.71)
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
const { checkTrustProxy, parseArgs, deploy, loadServicePlan } = await import('./railway-deploy.mjs');
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
// --- Politique V2 : confiance liée à la position du saut (wcore.trust-proxy.release/v2) ---
// Une déclaration V2 n'est recevable que si le commit déployé déclare le modèle positionnel
// dans son manifeste ET porte les marqueurs de ce code au SHA cible. Sur un commit de modèle
// uniforme (confiance à toutes les positions), elle doit être refusée.
const MANIFEST = 'wcore-web/railway/deploy-manifest.json';
const SERVER = 'wcore-web/apps/api/src/server.ts', LIB = 'wcore-web/apps/api/src/trust-proxy.ts';
const POSITIONAL = 'wcore.trust-proxy.positional/v1';
const WIRED = 'const trustProxyScope = positionalTrustProxy(apiConfig.server.trustProxy);\nconst trustProxy = trustProxyScope.trust;\n';
async function withCommit({ model = POSITIONAL, server = WIRED, lib = 'export function positionalTrustProxy(parsed) {}\n' }, fn) {
  const saved = { ...files };
  const manifest = JSON.parse(files[MANIFEST]);
  manifest.services.api.trustProxyModel = model;
  files[MANIFEST] = JSON.stringify(manifest);
  if (server !== null) files[SERVER] = server;
  if (lib !== null) files[LIB] = lib;
  try { return await fn(); } finally { for (const key of Object.keys(files)) delete files[key]; Object.assign(files, saved); }
}
const positionalPlan = { service: 'api', trustProxyPreflight: true, trustProxyModel: 'positional' };
function documentV2(overrides = {}) {
  return { ...document(), version: 2, classification: 'VALID_POSITIONAL_PROXY', validationRules: 'wcore.trust-proxy.release/v2',
    trustModel: 'wcore.trust-proxy.positional/v1', publicEntriesAreEdgesOnly: true, ...overrides };
}
const rejectedOn = (somePlan, opts) => {
  calls.length = 0;
  assert.throws(() => checkTrustProxy(somePlan, opts, root, NOW), e => e.code === 'E_TRUST_PROXY_ATTESTATION' && !e.message.includes('sentinel') && !e.message.includes(root));
  assert.deepEqual(calls, [], 'Validation purement locale, même lors du refus');
};
test('plan : un commit sans trustProxyModel reste de modèle uniform', () => {
  assert.equal(loadServicePlan(root, SHA, 'api').trustProxyModel, 'uniform');
});
test('plan : modèle positional reconnu quand le manifeste le déclare et que le code est câblé au SHA', () =>
  withCommit({}, () => assert.equal(loadServicePlan(root, SHA, 'api').trustProxyModel, 'positional')));
// Les marqueurs appartiennent au déployeur, pas au commit : un manifeste ne peut pas les affaiblir.
const badModels = {
  'appel positionnel absent du serveur': { server: 'const app = Fastify({ trustProxy: true });\n' },
  'résultat positionnel non passé à Fastify': { server: 'const trustProxyScope = positionalTrustProxy(apiConfig.server.trustProxy);\nconst trustProxy = true;\n' },
  'fonction absente du module': { lib: 'export function restrictTrustProxyToNonPublic(parsed) {}\n' },
  'fichier serveur absent au SHA': { server: null },
  'fichier module absent au SHA': { lib: null },
  'identifiant de modèle inconnu': { model: 'wcore.trust-proxy.positional/v0' },
  'modèle en objet': { model: { id: POSITIONAL, sourceMarkers: {} } },
  'modèle null': { model: null },
  'modèle vide': { model: '' },
  'modèle booléen': { model: true },
};
for (const [name, commit] of Object.entries(badModels)) test(`plan : refuse ${name}`, () =>
  withCommit(commit, () => assert.throws(() => loadServicePlan(root, SHA, 'api'), { code: 'E_TRUST_PROXY_MODEL' })));
test('V2 : acceptée sur un plan positional, avec un mode distinct', () => {
  assert.equal(checkTrustProxy(positionalPlan, options(documentV2()), root, NOW).mode, 'OPERATOR_DECLARATIVE_ATTESTATION_POSITIONAL');
});
test('V1 : toujours acceptée sur un plan positional (déclaration plus stricte)', () => {
  assert.equal(checkTrustProxy(positionalPlan, options(document()), root, NOW).mode, 'OPERATOR_DECLARATIVE_ATTESTATION');
});
test('V2 : refusée sur un plan uniform ou sans modèle', () => {
  rejectedOn(plan, options(documentV2()));
  rejectedOn({ ...plan, trustProxyModel: 'uniform' }, options(documentV2()));
  rejectedOn({ ...plan, trustProxyModel: 'other' }, options(documentV2()));
});
const badV2 = {
  'version 1 avec les clés V2': { version: 1 }, 'version 3': { version: 3 }, 'version en texte': { version: '2' },
  'classification V1': { classification: 'VALID_VERIFIED_PROXY' }, 'classification invalide': { classification: 'INVALID_FOR_CURRENT_RELEASE_GATE' },
  'règles V1': { validationRules: 'wcore.trust-proxy.release/v1' }, 'modèle de confiance inconnu': { trustModel: 'other' },
  'bords non confirmés': { publicEntriesAreEdgesOnly: false }, 'bords en texte': { publicEntriesAreEdgesOnly: 'true' },
  'topologie non vérifiée': { topologyVerified: false }, 'opérateur non confirmé': { operatorConfirmed: false },
  'autre SHA': { sha: 'b'.repeat(40) }, 'autre service': { service: 'web' }, 'périmée': { expiresAt: '2026-10-27T12:00:00.000Z' },
  'durée excessive': { expiresAt: '2026-10-27T12:25:00.001Z' }, 'clé en trop': { TRUST_PROXY: 'sentinel-secret' },
};
for (const [name, changes] of Object.entries(badV2)) test(`V2 : refuse ${name}`, () => rejectedOn(positionalPlan, options(documentV2(changes))));
for (const key of Object.keys(documentV2())) test(`V2 : refuse champ absent ${key}`, () => { const d = documentV2(); delete d[key]; rejectedOn(positionalPlan, options(d)); });
test('V1 : refuse les valeurs V2 glissées dans le schéma V1', () => {
  rejectedOn(positionalPlan, options(document({ classification: 'VALID_POSITIONAL_PROXY' })));
  rejectedOn(positionalPlan, options(document({ version: 2 })));
  rejectedOn(positionalPlan, options(document({ validationRules: 'wcore.trust-proxy.release/v2' })));
});
test('V2 : refuse clés JSON dupliquées, y compris échappées', () => {
  const text = JSON.stringify(documentV2());
  rejectedOn(positionalPlan, options(text.replace('{', '{"version":2,')));
  rejectedOn(positionalPlan, options(text.replace('{', '{"\\u0076ersion":2,')));
});
for (const dryRun of [true, false]) test(`V2 : intégration ${dryRun ? 'dry-run' : 'déploiement'} sur un commit positional, sans lecture de variables`, () => withCommit({}, async () => {
  calls.length = 0;
  const logs = [];
  const args = ['--service','api','--ref','origin/master','--environment','production','--project',target.project,'--trust-proxy-attestation',fixture(documentV2()), ...(dryRun ? ['--dry-run'] : [])];
  const result = await deploy(args, { repo: root, lockDir: join(root,'locks'), now: NOW, clock: () => NOW, log: text => logs.push(text) });
  assert.match(logs.join(''), /OPERATOR_DECLARATIVE_ATTESTATION_POSITIONAL/);
  assert.equal(result.published, !dryRun);
  assert.ok(!calls.some(c => c.args.some(a => ['variable','variables','env'].includes(a))));
  assert.equal(calls.filter(c => c.args[0] === 'up').length, dryRun ? 0 : 1);
}));
test('V2 : un commit de modèle uniform ne publie jamais avec une déclaration V2', async () => {
  calls.length = 0;
  const args = ['--service','api','--ref','origin/master','--environment','production','--project',target.project,'--trust-proxy-attestation',fixture(documentV2())];
  await assert.rejects(deploy(args, { repo: root, lockDir: join(root,'locks'), now: NOW, clock: () => NOW, log: () => {} }), { code: 'E_TRUST_PROXY_ATTESTATION' });
  assert.ok(!calls.some(c => c.args[0] === 'up'));
});
test('V2 : un manifeste positional sans le code au SHA arrête le déploiement avant tout upload', () => withCommit({ server: 'const app = Fastify({ trustProxy: true });\n' }, async () => {
  calls.length = 0;
  const args = ['--service','api','--ref','origin/master','--environment','production','--project',target.project,'--trust-proxy-attestation',fixture(documentV2())];
  await assert.rejects(deploy(args, { repo: root, lockDir: join(root,'locks'), now: NOW, clock: () => NOW, log: () => {} }), { code: 'E_TRUST_PROXY_MODEL' });
  assert.ok(!calls.some(c => c.args[0] === 'up'));
}));
test('wrapper PowerShell transmet chemin avec espaces et DryRun sans invoquer Node réel', () => {
  const script = fileURLToPath(new URL('./deploy.ps1', import.meta.url));
  const attestationPath = String.raw`C:\synthetic folder\declaration.json`;
  const command = `function node { $args | ConvertTo-Json -Compress; $global:LASTEXITCODE = 0 }; & '${script.replaceAll("'", "''")}' -Service api -Ref origin/master -Environment production -Project synthetic -DryRun -TrustProxyAttestation '${attestationPath}'`;
  const args = JSON.parse(cp.execFileSync('pwsh', ['-NoProfile','-NonInteractive','-Command',command], { encoding: 'utf8' }));
  assert.equal(args[args.indexOf('--trust-proxy-attestation') + 1], attestationPath);
  assert.ok(args.includes('--dry-run'));
});
test.after(() => { cp.spawnSync = originalSync; cp.spawn = originalSpawn; syncBuiltinESMExports(); rmSync(root, { recursive: true, force: true }); });
