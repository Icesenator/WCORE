// Guards the Cosmos argument contract.
//
// The sheet calls  =CHAIN_REFRESH_STATUS(addr;"";I2:I;C1;B1)  and 18_CLEANUP calls
// getWalletAssets(wallet,"","",true,false). The Cosmos factory used to declare only
// (address, forceFull), so forceFull was bound to the empty RPC slot: ticking C1 never
// forced a refresh on any Cosmos chain, and the B1 trigger never reached the engine.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const source = fs.readFileSync(path.join(SRC, '19_CHAIN_FACTORY.gs'), 'utf8');

function buildFactory() {
  const calls = { walletAssets: [], refreshStatus: [] };
  const context = {
    console, Date, JSON, Math, Number, String, Array, Object, RegExp,
    isFinite, parseFloat, parseInt,
    Logger: { log: () => {} },
    ChainFactory: {},
    CosmosConfigBuilder: {
      build: (cfg) => cfg || {},
      generateKeys: () => ({}),
    },
    WalletNames: {},
    CosmosEngine: {
      getWalletAssets: (...args) => { calls.walletAssets.push(args); return 'assets'; },
      getRefreshStatus: (...args) => { calls.refreshStatus.push(args); return 'status'; },
      getCachedWalletAssets: () => 'cached',
      getStats: () => 'stats',
    },
    EvmEngine: {}, SvmEngine: {}, Diagnostic: {},
    WCORE_STABLECOINS: {}, WCORE_CACHE_VERSIONS: {},
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  if (typeof context.ChainFactory.getCacheVersion !== 'function') {
    context.ChainFactory.getCacheVersion = () => 1;
  }
  context.ChainFactory.registerChain = context.ChainFactory.registerChain || ((n, api) => api);
  return { context, calls };
}

// The engine detects its signature on arg3: an object carrying CHAIN/CACHE/TIMEOUTS means
// the short form. These indexes are the long form the engine falls back to.
const ENGINE_FORCE_FULL_INDEX = 3;
const ENGINE_TRIGGER_INDEX = 4;

const { context, calls } = buildFactory();
const chain = context.ChainFactory.createCosmosChain('COSMOS_HUB', { CHAIN: { NAME: 'Cosmos Hub' } });

// --- getRefreshStatus ------------------------------------------------------
calls.refreshStatus.length = 0;
chain.getRefreshStatus('cosmos1abc', '', ['contractA'], true, 'pulse-42');
assert.strictEqual(calls.refreshStatus.length, 1, 'the engine must be called once');

const status = calls.refreshStatus[0];
assert.strictEqual(status[0], 'cosmos1abc', 'address is forwarded');
assert.strictEqual(
  status[ENGINE_FORCE_FULL_INDEX], true,
  'C1 must reach the engine as forceFull, not the empty RPC slot',
);
assert.strictEqual(
  status[ENGINE_TRIGGER_INDEX], 'pulse-42',
  'B1 must reach the engine so repeat-pulse guards can work',
);

// The empty second argument must never be mistaken for forceFull.
calls.refreshStatus.length = 0;
chain.getRefreshStatus('cosmos1abc', '', ['contractA'], false, 'pulse-43');
assert.strictEqual(
  calls.refreshStatus[0][ENGINE_FORCE_FULL_INDEX], false,
  'an unticked C1 must stay false',
);

// --- getWalletAssets -------------------------------------------------------
// 18_CLEANUP.gs calls getWalletAssets(wallet, "", "", true, false) to force a rescan.
calls.walletAssets.length = 0;
chain.getWalletAssets('cosmos1abc', '', '', true, false);
assert.strictEqual(calls.walletAssets.length, 1, 'the engine must be called once');
assert.strictEqual(
  calls.walletAssets[0][ENGINE_FORCE_FULL_INDEX], true,
  'the cleanup forced rescan must actually force',
);

// --- every Cosmos chain wrapper uses the same contract ---------------------
const cosmosChains = fs.readdirSync(SRC)
  .filter((f) => f.endsWith('.gs'))
  // Match chain files that *call* the factory, not 19_CHAIN_FACTORY.gs which defines it.
  .filter((f) => /=\s*ChainFactory\.createCosmosChain\s*\(/.test(fs.readFileSync(path.join(SRC, f), 'utf8')));

assert.ok(cosmosChains.length >= 10, `expected the Cosmos chain files, found ${cosmosChains.length}`);

for (const file of cosmosChains) {
  const text = fs.readFileSync(path.join(SRC, file), 'utf8');
  const key = path.basename(file, '.gs');

  const refresh = new RegExp(`function\\s+${key}_REFRESH_STATUS\\s*\\(([^)]*)\\)`);
  const assets = new RegExp(`function\\s+GET_WALLET_ASSETS_${key}\\s*\\(([^)]*)\\)`);

  for (const [label, re] of [['REFRESH_STATUS', refresh], ['GET_WALLET_ASSETS', assets]]) {
    const match = text.match(re);
    assert.ok(match, `${file}: ${label} wrapper not found`);
    const arity = match[1].split(',').filter((s) => s.trim()).length;
    assert.strictEqual(
      arity, 5,
      `${file}: ${label} takes ${arity} arguments but the sheet always passes 5 ` +
      `(addr, rpc, tokens, forceFull, trigger); a shorter signature silently binds forceFull to the RPC slot`,
    );
  }
}

console.log(`OK - Cosmos argument contract verified on ${cosmosChains.length} chains`);
