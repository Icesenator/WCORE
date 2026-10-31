// Retrait de B3 Mainnet (chainId 8333) : plus aucun scan, rafraîchissement ni RPC actif.
// Le token B3 sur Base (0xb3b3…b3b3) est un actif distinct et reste suivi.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const B3_TOKEN_ON_BASE = '0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3';

function context(files) {
  const forbidden = () => { throw new Error('accès réseau/cache interdit'); };
  const ctx = vm.createContext({
    console,
    Logger: { log: () => {} },
    Utilities: { formatDate: () => '2026-10-31 12:00:00', sleep: () => {} },
    WCORE_STABLECOINS: {},
    EvmConfigBuilder: { generateKeys: () => ({}), build: (config) => config },
    RECAP_SHEET_NAME: 'Recap Chain',
    GSHEET_WEB_SCAN_QUEUE_TTL_SEC: 120,
    GSHEET_WEB_SCAN_QUEUE_MAX_ITEMS: 10,
    UrlFetchApp: { fetch: forbidden, fetchAll: forbidden },
    WalletCache: { load: forbidden, clear: forbidden, save: forbidden },
  });
  for (const file of files) vm.runInContext(read('src/' + file), ctx);
  return ctx;
}

test('B3 Mainnet ne possède plus de configuration, de projection ni de RPC actifs', () => {
  for (const file of ['src/B3.gs', 'dist/chains/B3.ts', '../wcore-web/packages/core/src/chains/B3.ts']) {
    assert.equal(fs.existsSync(path.join(root, file)), false, file);
  }
  assert.doesNotMatch(read('dist/chains/index.ts'), /\bB3\b/);
  // Le relais Cloudflare n'existait que pour B3 (slugs b3-1 / b3-2).
  assert.equal(fs.existsSync(path.join(root, 'railway-rpc-relay')), false, 'relais RPC B3 retiré du dépôt');
  for (const file of ['21_DASHBOARD.gs', '25_RPC_HEALTH_REPORT.gs', '27_ACTIVITY_REFRESH.gs', '33_DYNAMIC_RPC.gs']) {
    assert.doesNotMatch(read('src/' + file), /["']B3["']/, file);
  }
  for (const dir of ['src', 'dist', 'tools']) {
    for (const entry of fs.readdirSync(path.join(root, dir), { recursive: true })) {
      const file = path.join(dir, String(entry));
      if (!/\.(gs|[cm]?js|ts|json)$/i.test(file)) continue;
      assert.doesNotMatch(read(file), /wcore-rpc-relay[^"'\s]*\/b3-[12]|mainnet-rpc\.b3\.fun|8333\.rpc\.thirdweb\.com|b3\.rpc\.thirdweb\.com/i, file);
    }
  }
});

test('le tombstone reconnaît B3 Mainnet, 8333 et son onglet Ledger, rien d’autre', () => {
  const ctx = context(['19_CHAIN_FACTORY.gs']);
  for (const key of ['B3', 'b3', ' B3 ', '8333', 8333, '0x208d', '0X208D', 'Ledger - B3', 'Ledger - B3 Crypto']) {
    assert.equal(ctx._wcoreRemovedChain_(key), true, String(key));
  }
  for (const key of ['B2', 'B3_TEST', 'BASE', 'Ledger - Base', '18333', '83330', B3_TOKEN_ON_BASE, 'B3 (Base)']) {
    assert.equal(ctx._wcoreRemovedChain_(key), false, String(key));
  }
  assert.throws(() => ctx.ChainFactory.createEvmChain('B3', {}), /CHAIN_REMOVED: B3 \(8333\)/);
  assert.throws(() => ctx.ChainFactory.createEvmChain('OTHER', { CHAIN: { CHAIN_ID: 8333 } }), /CHAIN_REMOVED/);
  assert.equal(ctx.ChainFactory.registerChain('B3', { getConfig() { return {}; } }), null);
});

test('Superseed reste retiré avec son propre libellé', () => {
  const ctx = context(['19_CHAIN_FACTORY.gs']);
  assert.throws(() => ctx.ChainFactory.createEvmChain('SUPERSEED', {}), /CHAIN_REMOVED: SUPERSEED \(5330\)/);
  assert.equal(ctx._wcoreRemovedChainLabel_('5330'), 'SUPERSEED (5330)');
  assert.equal(ctx._wcoreRemovedChainLabel_('Ledger - B3'), 'B3 (8333)');
});

test('les formules du Ledger B3 n’appellent plus de scan : marqueur archivé, aucune valeur courante', () => {
  const ctx = context(['19_CHAIN_FACTORY.gs']);
  const status = ctx.B3_REFRESH_STATUS('0x00000000000000000000000000000000000000a1');
  assert.match(status, /^\[CHAIN_REMOVED\] B3 \(8333\)/);
  const assets = ctx.GET_WALLET_ASSETS_B3('0x00000000000000000000000000000000000000a1');
  assert.ok(Array.isArray(assets) && Array.isArray(assets[0]));
  assert.match(String(assets[0][0]), /CHAIN_REMOVED/);
  for (const row of assets) for (const cell of row) assert.ok(typeof cell !== 'number', 'aucun nombre : ni solde ni total');
  assert.match(String(ctx.CACHED_WALLET_ASSETS_B3('0x00000000000000000000000000000000000000a1')[0][0]), /CHAIN_REMOVED/);
  assert.match(String(ctx.B3_STATS('0x00000000000000000000000000000000000000a1')[0][0]), /CHAIN_REMOVED/);
});

test('le scan Web refuse B3 avant tout transport, avec le bon libellé', () => {
  const ctx = context(['19_CHAIN_FACTORY.gs', '41_GSHEET_WEB_SCAN.gs']);
  const res = ctx._webScanWallet_('0x00000000000000000000000000000000000000a1', undefined, true, { CHAIN: { KEY: 'B3', CHAIN_ID: 8333 } });
  assert.equal(res.error, 'CHAIN_REMOVED');
  assert.equal(res.status, '[CHAIN_REMOVED] B3 (8333)');
});

test('la purge d’urgence ne supprime jamais le cache B3 conservé comme preuve', () => {
  const store = {};
  const old = JSON.stringify({ u: Date.now() - 10 * 24 * 3600e3, a: [{ c: 'n', b: '1' }], pad: 'x'.repeat(20000) });
  store['B3_CACHE_WALLET_0x00000000000000000000000000000000000000a1'] = old;
  store['BASE_CACHE_WALLET_0x00000000000000000000000000000000000000a1'] = old;
  const props = {
    getProperties: () => ({ ...store }),
    deleteProperty: (k) => { delete store[k]; },
  };
  const ctx = context(['19_CHAIN_FACTORY.gs']);
  ctx.CacheService = { getScriptCache: () => ({ removeAll: () => {} }) };
  ctx.GLOBAL_CACHE_KEYS = { GLOBAL_WALLET: 'GLOBAL_WALLET', GLOBAL_PRICES: 'GLOBAL_PRICES' };
  ctx.CacheManager = { init() {}, _props: props };
  vm.runInContext(read('src/04A_CACHE_CORE.gs').split('\n').filter(() => true).join('\n').replace(/^[\s\S]*?(CacheManager\._emergencyPurge_ = CacheManager\._emergencyPurge_ \|\| function)/, '$1'), ctx);
  ctx.CacheManager._emergencyPurge_(600 * 1024);
  assert.ok(store['B3_CACHE_WALLET_0x00000000000000000000000000000000000000a1'], 'cache B3 conservé');
  assert.equal(store['BASE_CACHE_WALLET_0x00000000000000000000000000000000000000a1'], undefined, 'les autres chaînes restent purgeables');
});

test('le cache B3 reste lisible en diagnostic, sans réseau ni écriture', () => {
  const ctx = context(['19_CHAIN_FACTORY.gs']);
  let seen = null;
  ctx.Diagnostic = { cacheListAssets: (config, w) => { seen = { prefix: config.KEYS.PREFIX, id: config.CHAIN.CHAIN_ID, w }; return [['ok']]; } };
  assert.deepEqual(ctx.DIAG_B3_CACHE_ASSETS('0xabc'), [['ok']]);
  assert.deepEqual(seen, { prefix: 'B3_CACHE_', id: 8333, w: '0xabc' });
  for (const fn of ['DIAG_B3_RPC_HEALTH', 'DIAG_B3_CLEAR_CACHE', 'DIAG_B3_NATIVE_BALANCE']) assert.equal(typeof ctx[fn], 'undefined', fn);
});

test('le token B3 sur Base n’est pas touché', () => {
  for (const file of ['13A_DIAG_CACHE.gs', '13B_DIAG_RPC.gs', '13C_DIAG_TOKEN.gs']) {
    assert.match(read('src/' + file).toLowerCase(), new RegExp(B3_TOKEN_ON_BASE), file);
  }
});
