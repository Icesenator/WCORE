const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '14_SVM_ENGINE.gs'), 'utf8');

assert.match(source, /var\s+SVM_ENGINE_VERSION\s*=\s*["']4\.16\.64["']\s*;/,
  'SVM engine version must advance to 4.16.64');

function extractIife(sourceText, name) {
  const start = sourceText.indexOf(`var ${name} =`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = sourceText.indexOf('\n})();', start);
  assert.notEqual(end, -1, `${name} IIFE must be closed`);
  return sourceText.slice(start, end + '\n})();'.length);
}

function makeContext(mint, providerMeta = {}) {
  const cache = {};
  let dexCalls = 0;
  let cacheSaves = 0;
  const supplied = (key, fallback) => Object.prototype.hasOwnProperty.call(providerMeta, key)
    ? providerMeta[key]
    : fallback;
  const context = {
    Date,
    Math,
    Number,
    Object,
    String,
    _svmIsBase58: (value) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || '')),
    Num: { isValid: (value) => typeof value === 'number' && Number.isFinite(value) },
    MetaCache: {
      load: () => cache,
      save: () => { cacheSaves++; },
    },
    PriceSources: {
      getGeckoTerminalMeta: () => supplied('gt', null),
      getJupiterTokenMeta: () => supplied('jupiter', null),
      dexBulkTokens: () => {
        dexCalls++;
        return { [mint.toLowerCase()]: supplied('dex', { symbol: 'CWIF', name: 'catwifhat' }) };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(extractIife(source, 'SvmTokenMeta'), context);
  return { context, cache, cacheSaves: () => cacheSaves, dexCalls: () => dexCalls };
}

function runEngine(options = {}) {
  const mint = options.mint || '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const prefix = mint.slice(0, 8);
  const metaCache = {};
  const counters = { bulk: 0, singleton: 0 };
  let savedCache = null;
  const timer = { isLow: () => false, remaining: () => 10000 };
  const initialCache = options.cache || {
    assets: [],
    priceMap: {},
    priceTsMap: {},
    balanceTsMap: {},
    attemptTsMap: {},
    purgedTsMap: {},
  };
  const config = {
    VERSION: 'SVM_TEST',
    CACHE_VERSION: 1,
    TIMEOUTS: { SAFE_MARGIN_MS: 750, SAFE_SAVE_MARGIN_MS: 1500 },
    RPC: { ENDPOINTS: ['https://rpc.invalid'], COMMITMENT: 'confirmed' },
    CHAIN: {
      NAME: 'Solana',
      NATIVE_SYMBOL: 'SOL',
      NATIVE_NAME: 'Solana',
      NATIVE_DECIMALS: 9,
      NATIVE_LLAMA_ID: 'coingecko:solana',
    },
    KEYS: { NATIVE_PRICE: 'native@solana' },
    KNOWN_TOKENS: {},
  };
  const emptyCache = () => ({
    assets: [], priceMap: {}, priceTsMap: {}, balanceTsMap: {}, attemptTsMap: {}, purgedTsMap: {},
  });
  const context = {
    Date,
    JSON,
    Math,
    Number,
    Object,
    String,
    Array,
    isFinite,
    Bool: { parse: (value) => value === true || value === 'true' },
    Num: {
      isValid: (value) => typeof value === 'number' && Number.isFinite(value),
      isPositive: (value) => Number(value) > 0,
      isValidPositive: (value) => Number.isFinite(Number(value)) && Number(value) > 0,
      parse: (value) => Number(value),
    },
    Obj: { keyCount: (value) => Object.keys(value || {}).length },
    Format: { now: () => '2026-08-10 12:00:00', datetime: () => '2026-08-10 12:00:00' },
    FxRate: { get: () => 1 },
    MetaCache: { load: () => metaCache, save: () => {} },
    WalletCache: {
      load: () => initialCache,
      save: (key, value) => { savedCache = JSON.parse(JSON.stringify(value)); },
    },
    GlobalPriceCache: { load: () => null, save: () => {} },
    PriceRunCache: { reset: () => {} },
    PriceSources: {
      llamaPriceUsd: () => 100,
      getGeckoTerminalMeta: () => null,
      getJupiterTokenMeta: () => null,
      dexBulkTokens: () => { counters.singleton++; return {}; },
    },
    BulkPriceFetch: {
      fetch: () => { counters.bulk++; return options.bulkResult || {}; },
    },
    SvmRpcClient: {
      getBalanceWithConsensus: () => ({ result: { value: 1000000000 }, rpc: 'mock', attempts: 1 }),
      getTokenAccountsByOwnerWithFallback: () => ({
        result: {
          value: options.emptyScan ? [] : [{
            account: {
              data: {
                parsed: {
                  info: { mint, tokenAmount: { decimals: 6, amount: '1000000' } },
                },
              },
            },
          }],
        },
        rpc: 'mock',
      }),
    },
    RpcClient: {},
    BaseEngine: {
      initCaches: () => {},
      initExecution: () => ({
        timer,
        nowMs: 1000000,
        balanceTsMap: {},
        priceMap: {},
        priceTsMap: {},
        attemptTsMap: {},
        purgedTsMap: {},
        pricesFetched: 0,
        rrCursor: 0,
        autoForced: false,
        activityForced: false,
      }),
      testQuotaBlocked: () => false,
      createEmptyCache: emptyCache,
      checkCacheVersion: (cache) => cache,
      restoreFromCache: () => {},
      evictStalePrices: () => {},
      mergeGlobalPrices: () => {},
      checkAutoForce: () => ({ dueFullScan: false }),
      checkMinRefresh: () => true,
      checkTooOld: () => false,
      getFxRate: (state) => { state.fxRate = 1; },
      hasTimeLeft: () => true,
      applyPricingWorkerCache: (targets) => ({ remaining: options.remainingTargets || targets }),
      getPricingMode: () => 'test',
      fallbackToCache: (key, reason) => { throw new Error(reason); },
    },
    OutputBuilder: {
      full: () => [],
      error: (chain, message) => { throw new Error(message); },
    },
    _svmIsBase58: (value) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || '')),
    _svmIsValidAddress: () => true,
    _svmChainName: () => 'Solana',
    _svmWalletKey: () => 'wallet-key',
    _svmParseTokensRange: () => options.tokenDefs || [{ contract: mint, symbol: prefix, name: prefix }],
  };
  vm.createContext(context);
  vm.runInContext(extractIife(source, 'SvmTokenMeta'), context);
  const engineStart = source.indexOf('var SvmEngine = {');
  assert.notEqual(engineStart, -1, 'SvmEngine must exist');
  vm.runInContext(source.slice(engineStart), context);
  if (options.mutate) options.mutate(context);

  context.SvmEngine.getWalletAssets('wallet', 'https://rpc.invalid', null, false, false, config, null);
  assert.ok(savedCache, 'engine must save the wallet cache');
  return { savedCache, counters, mint, prefix };
}

function assertPrefixRemainsMissing(result) {
  const token = result.savedCache.assets.find((asset) => asset.contract === result.mint);
  assert.ok(token, 'positive-balance token must be saved');
  assert.equal(token.symbol, '', 'mint-prefix symbol must be sanitized');
  assert.equal(token.name, '', 'mint-prefix name must be sanitized');
  assert.ok(result.savedCache.scanStats.missingMeta > 0);
  assert.equal(result.savedCache.scanStats.fullCycleComplete, false);
}

function assertNoDuplicateDex(result) {
  assert.equal(result.counters.bulk, 1, 'bulk pricing must run once');
  assert.equal(result.counters.singleton, 0, 'metadata enrichment must not repeat Dex singleton');
}

test('resolve falls back to Dex metadata while preserving canonical overrides', () => {
  const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const { context, dexCalls } = makeContext(mint);

  const marketMeta = context.SvmTokenMeta.resolve(mint, {
    symbol: mint.slice(0, 8),
    name: mint.slice(0, 8),
  }, null, {}, false);
  assert.equal(marketMeta.symbol, 'CWIF');
  assert.equal(marketMeta.name, 'catwifhat');
  assert.equal(marketMeta.decimals, null);
  assert.equal(dexCalls(), 1);

  const canonical = context.SvmTokenMeta.resolve(mint, {
    symbol: 'CANON',
    name: 'Canonical Token',
  }, null, {}, false);
  assert.equal(canonical.symbol, 'CANON');
  assert.equal(canonical.name, 'Canonical Token');
  assert.equal(canonical.decimals, null);
  assert.equal(dexCalls(), 1, 'usable overrides must bypass market metadata calls');
});

test('malformed provider metadata is ignored and never learned', () => {
  const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const cases = [
    { gt: { symbol: { ticker: 'BAD' }, name: 404 }, jupiter: null, dex: null },
    { gt: null, jupiter: { symbol: ['BAD'], name: { title: 'BAD' } }, dex: null },
    { gt: null, jupiter: null, dex: { symbol: 404, name: ['BAD'] } },
    { gt: { symbol: '   ', name: '\t' }, jupiter: null, dex: null },
  ];

  for (const providerMeta of cases) {
    const { context, cache, cacheSaves } = makeContext(mint, providerMeta);
    const resolved = context.SvmTokenMeta.resolve(mint, null, null, {}, false);
    assert.equal(resolved.symbol, '');
    assert.equal(resolved.name, '');
    assert.equal(cacheSaves(), 0);
    assert.doesNotMatch(JSON.stringify(cache), /\[object Object\]|404|BAD/);
  }
});

test('skipDex suppresses only the final Dex fallback', () => {
  const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const { context, dexCalls } = makeContext(mint, { gt: null, jupiter: null });

  const resolved = context.SvmTokenMeta.resolve(mint, null, null, {}, false, true);
  assert.equal(resolved.symbol, '');
  assert.equal(resolved.name, '');
  assert.equal(dexCalls(), 0);
});

test('shared predicates identify mint-prefix and legacy placeholders', () => {
  const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const { context } = makeContext(mint);
  assert.equal(typeof context.SvmTokenMeta.isPlaceholderSymbol, 'function');
  assert.equal(typeof context.SvmTokenMeta.isPlaceholderName, 'function');

  for (const symbol of ['', 'SPL', 'SPLTOKEN', 'Unknown', mint.slice(0, 8)]) {
    assert.equal(context.SvmTokenMeta.isPlaceholderSymbol(symbol, mint), true);
  }
  for (const name of ['', 'SPL Token', 'Unknown Token', mint.slice(0, 8)]) {
    assert.equal(context.SvmTokenMeta.isPlaceholderName(name, mint), true);
  }
  assert.equal(context.SvmTokenMeta.isPlaceholderSymbol('CANON', mint), false);
  assert.equal(context.SvmTokenMeta.isPlaceholderName('Canonical Token', mint), false);
});

test('engine saves mint-prefix metadata as missing and incomplete', () => {
  assertPrefixRemainsMissing(runEngine());
});

test('engine does not repeat Dex singleton after Dex-enabled bulk pricing', () => {
  assertNoDuplicateDex(runEngine());
});

test('engine preserves canonical cached metadata in a complete saved cycle', () => {
  const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const result = runEngine({
    mint,
    cache: {
      assets: [
        { contract: 'native', symbol: 'SOL', name: 'Solana' },
        { contract: mint, symbol: 'CANON', name: 'Canonical Token', decimals: 6 },
      ],
      priceMap: {}, priceTsMap: {}, balanceTsMap: {}, attemptTsMap: {}, purgedTsMap: {},
    },
    bulkResult: { [mint.toLowerCase()]: { priceUsd: 2 } },
  });
  const token = result.savedCache.assets.find((asset) => asset.contract === mint);
  assert.equal(token.symbol, 'CANON');
  assert.equal(token.name, 'Canonical Token');
  assert.equal(result.savedCache.scanStats.missingMeta, 0);
  assert.equal(result.savedCache.scanStats.fullCycleComplete, true);
});

test('engine harness detects legacy-only placeholder handling', () => {
  const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const prefix = mint.slice(0, 8);
  const result = runEngine({
    mint,
    emptyScan: true,
    cache: {
      assets: [
        { contract: 'native', symbol: 'SOL', name: 'Solana', balance: 1, price_eur: 100 },
        { contract: mint, symbol: prefix, name: prefix, balance: 1, price_eur: 2 },
      ],
      priceMap: {}, priceTsMap: {}, balanceTsMap: {}, attemptTsMap: {}, purgedTsMap: {},
    },
    mutate: (context) => {
      context.SvmTokenMeta.isPlaceholderSymbol = (value) => !value || value === 'SPL';
      context.SvmTokenMeta.isPlaceholderName = (value) => !value || value === 'SPL Token';
    },
  });
  assert.throws(() => assertPrefixRemainsMissing(result), /mint-prefix symbol must be sanitized/);
});

test('engine harness detects removal of skipDex integration', () => {
  const result = runEngine({
    mutate: (context) => {
      const resolve = context.SvmTokenMeta.resolve;
      context.SvmTokenMeta.resolve = (mint, overrides, timer, config, skipApi) =>
        resolve(mint, overrides, timer, config, skipApi, false);
    },
  });
  assert.throws(() => assertNoDuplicateDex(result), /must not repeat Dex singleton/);
});
