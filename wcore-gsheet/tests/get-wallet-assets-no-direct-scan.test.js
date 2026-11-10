// v4.16.92 - GET_WALLET_ASSETS_* must not reach a direct scan.
//
// The only filtered collection path is getRefreshStatus -> queue -> API (anti-scam filter in
// sanitizeGsheetScanResult). The historical getWalletAssets entries scanned the chain directly
// and wrote the WalletCache with unfiltered tokens. They now return the cache, for every VM.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const read = (name) => fs.readFileSync(path.join(SRC, name), 'utf8');

function engine(name, calls) {
  return {
    getWalletAssets: (...args) => { calls.push([name, 'scan', args]); return 'scanned'; },
    getCachedWalletAssets: (address) => { calls.push([name, 'cached', address]); return 'cached:' + name; },
    getRefreshStatus: () => 'status',
    getStats: () => 'stats',
  };
}

function buildFactory(withDegradedMode) {
  const calls = [];
  const context = {
    console, Date, JSON, Math, Number, String, Array, Object, RegExp, isFinite, parseFloat, parseInt,
    Logger: { log: () => {} },
    ChainFactory: {},
    ConfigBuilder: { build: (cfg) => cfg || {}, generateKeys: () => ({}) },
    EvmConfigBuilder: { build: (cfg) => cfg || {}, generateKeys: () => ({}) },
    SvmConfigBuilder: { build: (cfg) => cfg || {}, generateKeys: () => ({}) },
    CosmosConfigBuilder: { build: (cfg) => cfg || {}, generateKeys: () => ({}) },
    WalletNames: {},
    EvmEngine: engine('EvmEngine', calls),
    SvmEngine: engine('SvmEngine', calls),
    CosmosEngine: engine('CosmosEngine', calls),
    Diagnostic: {},
    WCORE_STABLECOINS: {}, WCORE_CACHE_VERSIONS: {},
  };
  if (withDegradedMode) {
    context.DegradedMode = {
      wrap: (fn) => { calls.push(['DegradedMode', 'wrap']); return fn(); },
      getCachedWithDegradedInfo: (address, cfg, names, eng) => {
        calls.push(['DegradedMode', 'cached', address]);
        return eng.getCachedWalletAssets(address, cfg, names);
      },
    };
  }
  vm.createContext(context);
  vm.runInContext(read('19_CHAIN_FACTORY.gs'), context);
  if (typeof context.ChainFactory.getCacheVersion !== 'function') context.ChainFactory.getCacheVersion = () => 1;
  return { context, calls };
}

const makers = [
  ['createEvmChain', 'EvmEngine'],
  ['createSvmChain', 'SvmEngine'],
  ['createCosmosChain', 'CosmosEngine'],
];

for (const withDegradedMode of [true, false]) {
  for (const [maker, engineName] of makers) {
    const { context, calls } = buildFactory(withDegradedMode);
    let chain;
    try {
      chain = context.ChainFactory[maker]('TESTCHAIN', { CHAIN: { NAME: 'Test' } });
    } catch (e) {
      assert.fail(`${maker} could not be built in the test context: ${e.message}`);
    }
    calls.length = 0;
    // forceFull = true and a tokens range: the most insistent form a sheet or a tool can send.
    const out = chain.getWalletAssets('0xabc', 'https://rpc.example', [['0xdead']], true, 'pulse');
    const scans = calls.filter((c) => c[1] === 'scan');
    assert.strictEqual(scans.length, 0, `${maker} (DegradedMode=${withDegradedMode}) reached a direct scan`);
    assert.strictEqual(calls.some((c) => c[1] === 'wrap'), false, `${maker} must not use the scan wrapper`);
    assert.strictEqual(out, 'cached:' + engineName, `${maker} must return the cached assets`);
    assert.deepStrictEqual(
      chain.getWalletAssets('0xabc', '', '', false, false), chain.getCachedWalletAssets('0xabc'),
      `${maker}: GET and CACHED must render the same thing`,
    );
  }
}

// No factory entry may call an engine scanner any more.
assert.strictEqual(/Engine\.getWalletAssets\(/.test(read('19_CHAIN_FACTORY.gs')), false);

// TON has no factory: its sheet entry must read the cache, not refresh.
const ton = read('TON.gs');
const tonEntry = ton.split(/\r?\n/).find((line) => line.startsWith('function GET_WALLET_ASSETS_TON('));
assert.ok(tonEntry, 'GET_WALLET_ASSETS_TON must exist with its five parameters');
assert.ok(/^function GET_WALLET_ASSETS_TON\(a,r,t,f,g\)/.test(tonEntry), 'the public signature is kept');
assert.ok(tonEntry.includes('CACHED_WALLET_ASSETS_TON(a)'), 'the TON entry returns the cache');
assert.strictEqual(tonEntry.includes('_tonRefresh_'), false, 'the TON entry must not collect directly');

// REBUILD_WALLET_CACHE: collects through getRefreshStatus, never erases the cache first.
const cleanup = read('18_CLEANUP.gs');
const start = cleanup.indexOf('function REBUILD_WALLET_CACHE(wallet, chain) {');
const body = cleanup.slice(start, cleanup.indexOf('\nfunction ', start + 10));
assert.ok(body.includes('chainObj.getRefreshStatus(wallet, "", "", true, false)'), 'the rebuild asks for a forced refresh');
assert.ok(body.includes('chainObj.getCachedWalletAssets(wallet)'), 'the rebuild reads the cache');
assert.strictEqual(body.includes('deleteProperty'), false, 'the rebuild must not erase the cache before collecting');
assert.strictEqual(body.includes('chainObj.getWalletAssets('), false, 'the rebuild must not use the scan entry');

console.log('get-wallet-assets-no-direct-scan: OK');
