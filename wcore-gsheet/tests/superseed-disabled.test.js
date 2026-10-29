// Retrait actif Superseed : sauvegarde privée, tombstone sans purge ni réseau.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function context(files) {
  const forbidden = () => { throw new Error('accès réseau/cache interdit'); };
  const ctx = vm.createContext({
    console,
    Logger: { log: () => {} },
    Utilities: { formatDate: () => '2026-10-24 12:00:00', sleep: () => {} },
    WCORE_STABLECOINS: {},
    EvmConfigBuilder: { generateKeys: () => ({}), build: config => config },
    RECAP_SHEET_NAME: 'Recap Chain',
    GSHEET_WEB_SCAN_QUEUE_TTL_SEC: 120,
    GSHEET_WEB_SCAN_QUEUE_MAX_ITEMS: 10,
    UrlFetchApp: { fetch: forbidden, fetchAll: forbidden },
    WalletCache: { load: forbidden, clear: forbidden, save: forbidden },
  });
  for (const file of files) vm.runInContext(read('src/' + file), ctx);
  return ctx;
}
const factory = '19_CHAIN_FACTORY.gs';
test('Superseed ne possède plus de source, projection, export ni wrapper actif', () => {
  for (const file of ['src/SUPERSEED.gs', 'dist/chains/SUPERSEED.ts', '../wcore-web/packages/core/src/chains/SUPERSEED.ts']) assert.equal(fs.existsSync(path.join(root, file)), false, file);
  assert.doesNotMatch(read('dist/chains/index.ts'), /SUPERSEED/);
  for (const file of ['21_DASHBOARD.gs', '25_RPC_HEALTH_REPORT.gs', '27_ACTIVITY_REFRESH.gs', '33_DYNAMIC_RPC.gs']) assert.doesNotMatch(read('src/' + file), /["']SUPERSEED["']/);
});
test('inventaire complet : seules les références de refus restent dans les sources et générateurs', () => {
  const allowed = new Set(['src/19_CHAIN_FACTORY.gs', 'src/41_GSHEET_WEB_SCAN.gs', 'tools/extract-chains.mjs', 'tools/port-web-chains-to-gsheet.cjs']);
  function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(file);
      else if (/\.(gs|[cm]?js|ts|json)$/i.test(file)) {
        const text = read(file);
        assert.doesNotMatch(text, /(?:mainnet\.superseed\.xyz|superseed\.drpc\.org|GET_WALLET_ASSETS_SUPERSEED|SUPERSEED_REFRESH_STATUS)/i, file);
        if (!allowed.has(file)) assert.doesNotMatch(text, /superseed|\b5330\b|0x14d2|\bsseed\b/i, file);
      }
    }
  }
  for (const dir of ['src', 'dist', 'tools', 'scripts']) walk(dir);
});
test('le tombstone reconnaît uniquement la clé, les noms Ledger exacts et 5330', () => {
  const ctx = context([factory]);
  for (const key of ['SUPERSEED', 'superseed', ' Superseed ', '5330', 5330, 'Ledger - Superseed', 'Ledger - Superseed Crypto']) assert.equal(ctx._wcoreRemovedChain_(key), true, String(key));
  for (const key of ['SUPERSEED_TEST', 'SUPERPOSITION', 'SUPR', 'ETHEREUM', '15330', 'Ledger - Superseed Test', 'Superseed Crypto', 'Ledger-Superseed', 'Ledger - 5330']) assert.equal(ctx._wcoreRemovedChain_(key), false, key);
  assert.throws(() => ctx.ChainFactory.createEvmChain('SUPERSEED', {}), /CHAIN_REMOVED/);
  assert.throws(() => ctx.ChainFactory.createEvmChain('OTHER', { CHAIN: { CHAIN_ID: 5330 } }), /CHAIN_REMOVED/);
});
test('le registre reste absent et refuse aussi les identifiants hexadécimaux', () => {
  const ctx = context([factory]);
  for (const key of ['SUPERSEED', '5330', '0x14d2', '0X14D2']) {
    assert.equal(ctx._wcoreRemovedChain_(key), true, key);
    assert.equal(ctx.ChainFactory.registerChain(key, { getConfig() { return {}; } }), null);
    assert.equal(Object.hasOwn(ctx.ChainFactory.getRegistry(), key.toUpperCase()), false);
  }
  for (const key of ['ETHEREUM', 'SUPR']) {
    const api = ctx.ChainFactory.createEvmChain(key, { CHAIN: { CHAIN_ID: key === 'ETHEREUM' ? 1 : 55244 } });
    assert.equal(ctx.ChainFactory.getRegistry()[key], api);
    assert.equal(ctx._wcoreRemovedChain_(key), false);
  }
});
test('alias historique sseed : refus exact normalisé registre, création et scan', () => {
  const ctx = context([factory, '41_GSHEET_WEB_SCAN.gs', '41A_WEB_SCAN_QUEUE.gs']);
  ctx._webScanProp_ = () => 'ALL';
  for (const key of ['sseed', 'SSEED', ' SsEeD ']) {
    assert.equal(ctx._wcoreRemovedChain_(key), true, key);
    assert.equal(ctx.ChainFactory.registerChain(key, { getConfig() { return {}; } }), null);
    assert.equal(Object.hasOwn(ctx.ChainFactory.getRegistry(), key.toUpperCase()), false);
    assert.throws(() => ctx.ChainFactory.createEvmChain(key, {}), /CHAIN_REMOVED/);
    assert.equal(ctx._webScanAllowed_(key), false);
    assert.equal(ctx._webScanQueueResolveChain_(key), null);
    assert.equal(ctx._webScanWallet_('wallet', [], true, { CHAIN: { KEY: key } }, 'historique').error, 'CHAIN_REMOVED');
  }
  for (const key of ['SSEED_TEST', 'SUPR', 'ETHEREUM']) {
    assert.equal(ctx._wcoreRemovedChain_(key), false, key);
    assert.ok(ctx.ChainFactory.createEvmChain(key, { CHAIN: { CHAIN_ID: 1 } }));
    assert.ok(ctx.ChainFactory.getRegistry()[key]);
    assert.equal(ctx._webScanAllowed_(key), true);
  }
});
test('enregistrement direct : aucun alias de 5330, API légitimes et invalides préservées', () => {
  const ctx = context([factory]);
  for (const id of [5330, '5330', '0x14d2', '0X14D2']) {
    assert.equal(ctx.ChainFactory.registerChain('LEGACY_ALIAS', { getConfig() { return { CHAIN: { CHAIN_ID: id } }; } }), null);
    assert.equal(Object.hasOwn(ctx.ChainFactory.getRegistry(), 'LEGACY_ALIAS'), false);
  }
  for (const [key, id] of [['ETHEREUM', 1], ['SUPR', 55244]]) {
    const api = { getConfig() { return { CHAIN: { CHAIN_ID: id } }; } };
    assert.equal(ctx.ChainFactory.registerChain(key, api), api);
    assert.equal(ctx.ChainFactory.getRegistry()[key], api);
  }
  ctx.EvmConfigBuilder.build = () => { throw Error('construction prématurée'); };
  assert.ok(ctx.ChainFactory.createEvmChain('LAZY', { CHAIN: { CHAIN_ID: 1 } }));
  assert.ok(ctx.ChainFactory.getRegistry().LAZY);
  const withoutConfig = {};
  assert.equal(ctx.ChainFactory.registerChain('NO_CONFIG', withoutConfig), withoutConfig);
  assert.equal(Object.hasOwn(ctx.ChainFactory.getRegistry(), 'NO_CONFIG'), false);
  assert.equal(ctx.ChainFactory.registerChain('BROKEN', { getConfig() { throw Error('indisponible'); } }), null);
  assert.equal(Object.hasOwn(ctx.ChainFactory.getRegistry(), 'BROKEN'), false);
});
test('les générateurs ne réintroduisent pas une ancienne configuration retirée', () => {
  const extractor = read('tools/extract-chains.mjs').replace(/^import .*;$/gm, '').replace(/main\(\);\s*$/, '');
  let fixture = 'var _SUPERSEED = ChainFactory.createEvmChain("SUPERSEED", {CHAIN: {CHAIN_ID: 5330}});';
  const ctx = vm.createContext({ readFileSync: () => fixture, dirname: () => '.', fileURLToPath: () => '.', resolve: () => '.', join: (...parts) => parts.join('/') });
  vm.runInContext(extractor.replace(/import\.meta\.url/g, '"sandbox"'), ctx);
  assert.equal(ctx.extractFromFile('SUPERSEED.gs'), null);
  for (const [key, id] of [['OTHER', '0x14d2'], ['ETHEREUM', 1], ['SUPR', 55244]]) {
    fixture = `var _${key} = ChainFactory.createEvmChain("${key}", {CHAIN: {CHAIN_ID: "${id}"}});`;
    const result = ctx.extractFromFile(key + '.gs');
    if (key === 'OTHER') assert.equal(result, null);
    else assert.equal(result.key, key);
  }
  const port = read('tools/port-web-chains-to-gsheet.cjs').split('const webChainFiles =')[0];
  const portCtx = vm.createContext({ require, __dirname: path.join(root, 'tools') });
  vm.runInContext(port, portCtx);
  assert.throws(() => portCtx.emitGs('SUPERSEED', { vm: 'EVM', CHAIN: { CHAIN_ID: 5330 } }), /CHAIN_REMOVED/);
  assert.match(portCtx.emitGs('ETHEREUM', { vm: 'EVM', CHAIN: { CHAIN_ID: 1 } }), /createEvmChain/);
  assert.match(portCtx.emitGs('SUPR', { vm: 'EVM', CHAIN: { CHAIN_ID: 55244 } }), /createEvmChain/);
});
test('admission et queue refusent Superseed même si un ancien binding existe', () => {
  const ctx = context([factory, '41_GSHEET_WEB_SCAN.gs', '41A_WEB_SCAN_QUEUE.gs']);
  ctx._webScanQueueEnabled_ = () => true;
  ctx._webScanProp_ = () => 'ALL';
  ctx._webScanEnabled_ = () => true;
  ctx.ChainFactory._registry.SUPERSEED = { getRefreshStatus() { throw Error('binding interdit'); } };
  for (const key of ['SUPERSEED', '5330']) {
    assert.equal(ctx._webScanAllowed_(key), false);
    assert.equal(ctx._webScanQueueResolveChain_(key), null);
    const cfg = { CHAIN: { KEY: key, CHAIN_ID: 5330 } };
    assert.equal(ctx._webScanQueueEnqueue_('wallet', [], true, cfg).reason, 'CHAIN_REMOVED');
    assert.equal(ctx._webScanWallet_('wallet', [], true, cfg, 'historique').error, 'CHAIN_REMOVED');
  }
  assert.equal(ctx._webScanAllowed_('ETHEREUM'), true);
});
test('une queue historique est ignorée en mémoire sans suppression de son stockage', () => {
  const ctx = context([factory, '41A_WEB_SCAN_QUEUE.gs']);
  const raw = JSON.stringify([{ c: 'SUPERSEED', a: 'wallet', q: Date.now() }, { c: '5330', a: 'wallet', q: Date.now() }, { c: 'ETHEREUM', a: 'wallet', q: Date.now() }]);
  ctx._webScanQueueCache_ = () => ({ get: () => raw, put() { throw Error('aucune purge'); }, remove() { throw Error('aucune purge'); } });
  const entries = ctx._webScanQueueRead_();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].c, 'ETHEREUM');
});
test('le watchdog et la récupération ne pulsent plus les onglets Superseed', () => {
  const ctx = context([factory, '16_REFRESH.gs']);
  ctx._wd_loadWebBackoff_ = () => ({});
  ctx._wd_saveWebBackoff_ = () => {};
  ctx._wd_isSystemBlocked_ = () => ({ blocked: false });
  const result = ctx._wd_collectGlobalRefreshActions_([{ name: 'Ledger - Superseed Crypto', vA2: '#ERROR!', vI1: '' }], Date.now(), 1, '2026-10-24 12:00:00', {}, [{ sheetName: 'Ledger - Superseed Crypto', reason: 'partial' }]);
  assert.equal(JSON.stringify(result).includes('Superseed'), false);
  const recovery = ctx._recoverySelectPulseList_(['Ledger - Superseed', 'Ledger - Ethereum Crypto'], false);
  assert.deepEqual(Array.from(recovery.pulse), ['Ledger - Ethereum Crypto']);
});
