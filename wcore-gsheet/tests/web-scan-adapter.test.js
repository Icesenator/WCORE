const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.join(__dirname, '..', 'src', '41_GSHEET_WEB_SCAN.gs');
const source = fs.readFileSync(sourcePath, 'utf8');
const refreshSource = fs.readFileSync(path.join(__dirname, '..', 'src', '16_REFRESH.gs'), 'utf8');
const outputSource = fs.readFileSync(path.join(__dirname, '..', 'src', '10_OUTPUT.gs'), 'utf8');
const evmEngineSource = fs.readFileSync(path.join(__dirname, '..', 'src', '11_EVM_ENGINE.gs'), 'utf8');

function readSrc(file) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
}

function makeRefreshContext() {
  const context = { console, Date, Math, String, Number, RegExp, isFinite, parseInt };
  vm.createContext(context);
  vm.runInContext(refreshSource, context);
  return context;
}

function makeOutputContext() {
  const context = {
    console,
    Date,
    Math,
    String,
    Number,
    Array,
    Object,
    isFinite,
    Num: {
      parse: (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      },
      parseOr: (v, fallback) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      },
      isValid: (v) => Number.isFinite(Number(v)),
      isPositive: (v) => Number(v) > 0,
      isValidPositive: (v) => Number.isFinite(Number(v)) && Number(v) > 0,
    },
    Addr: { normalize: (v) => String(v || '').toLowerCase() },
    AssetManager: { normalizeMetadata: () => {} },
    Format: { now: () => '2026-06-29 08:00:00' },
    WalletCache: { getLastUpdateStr: () => '2026-06-29 08:00:00' },
    RpcClient: { getStats: () => ({ saved: 0, total: 0 }) },
    FxRate: { getUsdToEur: () => 0.878 },
    PriceSources: { getLlamaIdForSymbol: () => null, getLlamaPrice: () => null },
  };
  vm.createContext(context);
  vm.runInContext(outputSource, context);
  return context;
}

function makeContext(props, fetchBody) {
  const saved = [];
  const fetchFn = typeof fetchBody === 'function'
    ? fetchBody
    : () => ({ getResponseCode: () => fetchBody ? 200 : 500, getContentText: () => fetchBody || '{"ok":false}' });
  const context = {
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    encodeURIComponent,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null,
        setProperty: (key, value) => { props[key] = String(value); },
      }),
    },
    Utilities: {
      formatDate: () => '2026-06-26 19:00:00',
      sleep: () => {},
    },
    Session: { getScriptTimeZone: () => 'Europe/Paris' },
    CacheManager: { init: () => {} },
    WalletCache: {
      save: (address, cache, config) => saved.push({ address, cache, config }),
      load: () => null,
      getLastUpdateStr: (cache) => cache && cache.updatedAt ? '2026-06-26 19:00:00' : '',
      getLastRunUpdateStr: (cache) => cache && cache.last_run_update_ms ? '2026-06-26 19:00:00' : '',
    },
    UrlFetchApp: {
      fetch: fetchFn,
    },
    Logger: { log: () => {} },
    Format: {
      now: () => '2026-06-26 19:00:00',
      datetime: () => '2026-06-26 19:00:00',
    },
    BaseEngine: { isSystemBlocked: () => false },
    __saved: saved,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

const samplePayload = JSON.stringify({
  ok: true,
  chain: 'SOLANA',
  chainName: 'Solana',
  vm: 'SVM',
  timestamp: '2026-06-26T17:00:00.000Z',
  native: { symbol: 'SOL', balance: 1, priceEur: 100, valueEur: 100 },
  tokens: [],
  totalValueEur: 100,
  errors: [],
  degraded: false,
  fxRate: 0.86,
  scanMs: 100,
});

{
  const ctx = makeContext({});
  assert.equal(ctx._webScanEnabled_(), false, 'web scan disabled when config is missing');
}

{
  const ctx = makeContext({
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  });
  assert.equal(ctx._webScanEnabled_(), true, 'web scan enabled by default when required config exists');
  assert.equal(ctx._webScanAllowed_('BASE'), true, 'ALL allowlist permits BASE');
  assert.equal(ctx._webScanAllowed_('SOLANA'), true, 'ALL allowlist permits SOLANA');
}

{
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'false',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  });
  assert.equal(ctx._webScanEnabled_(), false, 'web scan can be disabled explicitly');
}

{
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'BASE,SOLANA',
  });
  assert.equal(ctx._webScanAllowed_('base'), true, 'allowlist is case-insensitive');
  assert.equal(ctx._webScanAllowed_('COSMOS_HUB'), false, 'non-allowlisted chain is blocked');
}

{
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    GSHEET_WEB_SCAN_REQUIRE: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'BASE,SOLANA',
  });
  assert.equal(ctx._webScanRequiredFor_({ CHAIN: { KEY: 'BASE', NAME: 'Base' } }), true, 'require flag makes allowlisted Web chains Web-only');
  assert.equal(ctx._webScanRequiredFor_({ CHAIN: { KEY: 'COSMOS_HUB', NAME: 'Cosmos Hub' } }), false, 'require flag does not affect non-allowlisted chains');
}

{
  const ctx = makeContext({});
  const config = { CHAIN: { NAME: 'Base', NATIVE_SYMBOL: 'ETH' }, CACHE_VERSION: 7 };
  const payload = {
    ok: true,
    chain: 'BASE',
    chainName: 'Base',
    vm: 'EVM',
    timestamp: '2026-06-26T17:00:00.000Z',
    native: { symbol: 'ETH', balance: 0.01, priceEur: 2100, valueEur: 21 },
    tokens: [{ symbol: 'USDC', name: 'USD Coin', contract: '0x0000000000000000000000000000000000000001', balance: 10, decimals: 6, priceEur: 0.86, valueEur: 8.6 }],
    totalValueEur: 29.6,
    errors: [],
    degraded: false,
    fxRate: 0.86,
    scanMs: 123,
  };
  const cache = ctx._webScanConvertToWalletCache_(payload, config);
  assert.equal(cache.version, 7);
  assert.equal(cache.assets.length, 2);
  assert.equal(cache.assets[0].contract, 'native');
  assert.equal(cache.assets[1].contract, '0x0000000000000000000000000000000000000001');
  assert.equal(cache.priceMap.native, 2100);
  assert.equal(cache.priceMap['0x0000000000000000000000000000000000000001'], 0.86);
  assert.equal(cache.scanStats.source, 'wcore-web');
  assert.equal(cache.scanStats.httpCalls, 1);
  const meta = Object.fromEntries(cache.lastInfoMetaRows.filter((row) => row[0] === 'META').map((row) => [row[1], row[2]]));
  const info = Object.fromEntries(cache.lastInfoMetaRows.filter((row) => row[1] && String(row[1]).startsWith('INFO_')).map((row) => [row[1], row[2]]));
  assert.equal(meta.exec_ms, 123, 'web scan visible output must expose META exec_ms for Recap Portfolio');
  assert.equal(meta.last_cache_update, '2026-06-26 19:00:00', 'web scan visible output must expose META last_cache_update for Recap Portfolio');
  assert.match(info.INFO_NATIVE, /native=ETH/, 'web scan visible output must expose INFO_NATIVE for Recap Portfolio');
  assert.match(info.INFO_TIMING, /scan=123ms/, 'web scan visible output must expose INFO_TIMING for Recap Portfolio');
  assert.match(info.INFO_RPC, /web_api/, 'web scan visible output must expose INFO_RPC for Recap Portfolio');
}

{
  const ctx = makeContext({});
  const config = { CHAIN: { NAME: 'Base', NATIVE_SYMBOL: 'ETH' }, CACHE_VERSION: 7 };
  const payload = {
    ok: true,
    chain: 'BASE',
    chainName: 'Base',
    vm: 'EVM',
    native: { symbol: 'ETH', balance: 0.01, priceEur: 2100, valueEur: 21 },
    tokens: [
      { symbol: 'KEEP', name: 'Keep Token', contract: '0x0000000000000000000000000000000000000001', balance: 10, decimals: 6, priceEur: 1, valueEur: 10 },
      { symbol: 'EXTRA', name: 'Extra Token', contract: '0x0000000000000000000000000000000000000002', balance: 10, decimals: 18, priceEur: 1, valueEur: 10 },
      { symbol: 'SCAM', name: 'Scam Token', contract: '0x0000000000000000000000000000000000000003', balance: 10, decimals: 18, priceEur: 999, valueEur: 9990, scam: true },
    ],
    totalValueEur: 10021,
    errors: [],
    degraded: false,
    fxRate: 0.86,
    scanMs: 123,
  };
  const cache = ctx._webScanConvertToWalletCache_(payload, config, [['0x0000000000000000000000000000000000000001'], ['0x0000000000000000000000000000000000000003']]);
  assert.deepEqual(cache.assets.map((a) => a.contract), ['native', '0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002'], 'web scan cache must prioritize I2:I and exclude scam tokens without hiding discovered tokens');
  assert.equal(cache.scanStats.priorityTokens, 2);
  assert.equal(cache.scanStats.extraTokens, 1);
  assert.equal(cache.scanStats.filteredOut, 0);
  assert.equal(cache.scanStats.scamFiltered, 1);
  assert.equal(cache.scanStats.totalValueEur, 41);
}

{
  const ctx = makeContext({});
  const config = { CHAIN: { NAME: 'Base', NATIVE_SYMBOL: 'ETH' }, CACHE_VERSION: 7 };
  const payload = {
    ok: true,
    chain: 'BASE',
    chainName: 'Base',
    vm: 'EVM',
    native: { symbol: 'ETH', balance: 0.01, priceEur: 2100, valueEur: 21 },
    tokens: [
      { symbol: 'PRICED', name: 'Priced Token', contract: '0x0000000000000000000000000000000000000001', balance: 10, decimals: 18, priceEur: 1, valueEur: 10 },
      { symbol: 'MISSING', name: 'Missing Price', contract: '0x0000000000000000000000000000000000000002', balance: 10, decimals: 18, priceEur: null, valueEur: null },
    ],
    totalValueEur: 31,
    errors: ['MISSING price: NO_PRICE'],
    degraded: true,
    fxRate: 0.86,
    scanMs: 123,
  };
  const cache = ctx._webScanConvertToWalletCache_(payload, config, []);
  assert.equal(cache.scanStats.missingPrices, 1, 'web scan stats must report visible tokens with balances but no price');
  assert.equal(cache.scanStats.fullCycleComplete, true, 'web scan with missing prices can still replace stale asset lists');
  assert.equal(cache.scanStats.priceComplete, false, 'web scan with missing prices must still report incomplete pricing');
}

{
  const ctx = makeContext({});
  const config = { CHAIN: { NAME: 'Optimism', NATIVE_SYMBOL: 'ETH' }, CACHE_VERSION: 7 };
  const payload = {
    ok: true,
    chain: 'OPTIMISM',
    chainName: 'Optimism',
    vm: 'EVM',
    native: { symbol: 'ETH', balance: 0, priceEur: 1400, valueEur: 0 },
    tokens: [
      { symbol: 'Comp WETH Borrow', name: 'Compound V3 cWETHv3 Borrowed', contract: '0xe36a30d249f7761327fd973001a32010b521b6fd', balance: -0.006, decimals: 18, priceEur: 1400, valueEur: -8.4 },
    ],
    totalValueEur: -8.4,
    errors: [],
    degraded: false,
    fxRate: 0.86,
    scanMs: 123,
  };
  const cache = ctx._webScanConvertToWalletCache_(payload, config, [['0xe36a30d249f7761327fd973001a32010b521b6fd']]);
  assert.equal(cache.assets.length, 2, 'web scan cache must preserve debt tokens with negative balances');
  assert.equal(cache.assets[1].balance, -0.006);
  assert.equal(cache.scanStats.totalValueEur, -8.4);
  assert.equal(cache.scanStats.priorityTokens, 1);
}

{
  const ctx = makeContext({});
  const config = { CHAIN: { NAME: 'Optimism', NATIVE_SYMBOL: 'ETH' }, CACHE_VERSION: 7 };
  const payload = {
    ok: true,
    chain: 'OPTIMISM',
    chainName: 'Optimism',
    vm: 'EVM',
    native: { symbol: 'ETH', balance: 0, priceEur: 1400, valueEur: 0 },
    tokens: [
      { symbol: 'WCT Stake', name: 'WCT Stake Weight [Lock]', contract: '0x521b4c065bbdbe3e20b3727340730936912dfa46', balance: 71.2, decimals: 18, priceEur: 0.037, valueEur: 2.6344 },
      { symbol: 'WCT Claimable', name: 'WCT Staking Reward Distributor [Flex]', contract: '0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf', balance: 12.8, decimals: 18, priceEur: 0.037, valueEur: 0.4736 },
    ],
    totalValueEur: 3.108,
    errors: [],
    degraded: false,
    fxRate: 0.878,
    scanMs: 123,
  };
  const cache = ctx._webScanConvertToWalletCache_(payload, config, []);
  assert.equal(cache.assets[1].name, 'WCT Stake Weight [Lock]');
  assert.equal(cache.assets[2].name, 'WCT Staking Reward Distributor [Flex]');
}

{
  const ctx = makeContext({});
  const config = { CHAIN: { NAME: 'Optimism', NATIVE_SYMBOL: 'ETH' }, CACHE_VERSION: 7 };
  const payload = {
    ok: true,
    chain: 'OPTIMISM',
    chainName: 'Optimism',
    vm: 'EVM',
    native: { symbol: 'ETH', balance: 0.001, priceEur: 1400, valueEur: 1.4 },
    tokens: [
      { symbol: 'Comp WETH Borrow', name: 'Compound V3 cWETHv3 Borrowed', contract: '0xe36a30d249f7761327fd973001a32010b521b6fd', balance: -0.006, decimals: 18, priceEur: 1400 },
    ],
    totalValueEur: 1.4,
    errors: [],
    degraded: false,
    fxRate: 0.86,
    scanMs: 123,
  };
  const cache = ctx._webScanConvertToWalletCache_(payload, config, [['0xe36a30d249f7761327fd973001a32010b521b6fd']]);
  assert.equal(cache.assets[1].value_eur, -8.4, 'web scan adapter must derive missing debt value from balance and price');
  assert.equal(cache.scanStats.totalValueEur, -7, 'web scan total must include derived negative debt values');
}

{
  const ctx = makeRefreshContext();
  assert.equal(ctx._wd_extractTimestamp_('WEB_SCAN_OK 2026-06-26 20:00:00'), '2026-06-26 20:00:00');
  assert.equal(ctx._wd_extractTimestamp_('[WEB_SCAN_DEGRADED] 2026-06-26 20:00:00'), '2026-06-26 20:00:00');
  assert.equal(ctx._wd_shouldSyncJ1_('WEB_SCAN_OK 2026-06-26 20:00:00', '2026-06-26 19:00:00'), true);
}

{
  const ctx = makeOutputContext();
  const out = ctx.OutputBuilder.fromCacheOnly('Ledger - Optimism', {
    assets: [
      { contract: 'native', symbol: 'ETH', name: 'Ether', balance: 0 },
      { contract: '0xe36a30d249f7761327fd973001a32010b521b6fd', symbol: 'Comp WETH Borrow', name: 'Compound V3 cWETHv3 Borrowed', balance: -0.006, price_eur: 1378.71 },
    ],
    priceMap: { '0xe36a30d249f7761327fd973001a32010b521b6fd': 1378.71 },
  }, { CHAIN: { NATIVE_SYMBOL: 'ETH', NATIVE_NAME: 'Ether' } });
  const debt = out.find((row) => row[1] === 'Comp WETH Borrow');
  assert.ok(debt, 'cache output must include debt tokens with negative balances');
  assert.equal(debt[4], -0.006);
  assert.equal(Math.round(debt[6] * 100) / 100, -8.27);
}

{
  assert.ok(!evmEngineSource.includes('if (Num.isValidPositive(val)) recalcTotal += val;'), 'EVM cached output total must not filter out negative debt values');
}

{
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  }, samplePayload);
  const res = ctx._webScanWallet_('SolanaRawAddress111111111111111111111111111', [], false, { CHAIN: { NAME: 'Solana' } }, 'svm_cache_key');
  assert.equal(res.ok, true);
  assert.equal(ctx.__saved.length, 1);
  assert.equal(ctx.__saved[0].address, 'svm_cache_key', 'adapter saves under local cache key while sending raw address to web');
}

{
  const degradedNativeZeroPayload = JSON.stringify({
    ok: true,
    chain: 'MANTLE',
    chainName: 'Mantle',
    vm: 'EVM',
    timestamp: '2026-06-29T12:34:23.000Z',
    native: { symbol: 'MNT', balance: 0, priceEur: 0.37, valueEur: 0 },
    tokens: [],
    totalValueEur: 0,
    errors: ['native balance: no consensus'],
    degraded: true,
    fxRate: 0.877,
    scanMs: 2805,
  });
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  }, degradedNativeZeroPayload);
  const res = ctx._webScanWallet_('0x0000000000000000000000000000000000000001', [], false, { CHAIN: { KEY: 'MANTLE', NAME: 'Mantle', NATIVE_SYMBOL: 'MNT' } }, 'mantle_cache_key');
  assert.equal(res.ok, true);
  assert.match(res.status, /WEB_SCAN_PRESERVED/, 'unsafe degraded native-zero web scan should be reported as preserved');
  assert.equal(ctx.__saved.length, 0, 'unsafe degraded native-zero web scan must not overwrite an existing wallet cache');
}

{
  let attempts = 0;
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  }, () => {
    attempts++;
    if (attempts === 1) throw new Error('Address unavailable: https://api.example.test/api/gsheet/scan');
    return { getResponseCode: () => 200, getContentText: () => samplePayload };
  });
  const res = ctx._webScanWallet_('0x0000000000000000000000000000000000000001', [], false, { CHAIN: { KEY: 'ARBITRUM_ONE', NAME: 'Arbitrum One' } });
  assert.equal(res.ok, true, 'web scan should retry transient UrlFetch failures before falling back native');
  assert.equal(attempts, 2);
}

{
  const props = {
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  };
  const ctx = makeContext(props, () => ({
    getResponseCode: () => 503,
    getContentText: () => '{"error":"scan_failed"}',
  }));
  const res = ctx.DIAG_WEB_SCAN_CHAIN('CAMP', '0x0000000000000000000000000000000000000001');
  assert.deepEqual(res, [['status', 'HTTP_503'], ['error', 'scan_failed']]);
  assert.equal(props.GSHEET_WEB_SCAN_LAST_ERROR, 'HTTP_503 scan_failed', 'diagnostic should persist the web API failure reason');
}

{
  const ctx = makeContext({});
  assert.equal(ctx._webScanChainKey_({ CHAIN: { NAME: 'BNB Chain' }, KEYS: { PREFIX: 'BSC_CACHE_' } }), 'BSC', 'web scan must use canonical factory key for BNB Chain');
  assert.equal(ctx._webScanChainKey_({ CHAIN: { NAME: 'zkLink Nova' }, KEYS: { PREFIX: 'ZKLINKNOVA_CACHE_' } }), 'ZKLINKNOVA', 'web scan must preserve canonical factory key spelling');
  assert.equal(ctx._webScanChainKey_({ CHAIN: { NAME: 'Injective' }, KEYS: { PREFIX: 'INJECTIVE_COSMOS_CACHE_' } }), 'INJECTIVE', 'web scan must remove Cosmos cache suffix from canonical key');
  assert.equal(ctx._webScanChainKey_({ CHAIN: { NAME: 'Cosmos Hub' }, KEYS: { PREFIX: 'COSMOS_HUB_COSMOS_CACHE_' } }), 'COSMOS_HUB', 'web scan must remove Cosmos suffix without damaging chain names containing underscores');
  assert.equal(ctx._webScanChainKey_({ CHAIN: { KEY: 'WORLDCHAIN', NAME: 'World Chain' } }), 'WORLDCHAIN', 'explicit chain key takes priority');
}

console.log('web scan adapter OK');

for (const file of ['11_EVM_ENGINE.gs', '14_SVM_ENGINE.gs', '15_COSMOS_ENGINE.gs', 'TON.gs']) {
  const s = readSrc(file);
  assert(
    s.includes('_webScanWallet_('),
    `${file} refresh path must attempt _webScanWallet_ before native HTTP scan`
  );
  assert(
    s.includes('_webScanRequiredFor_(') && s.includes('_webScanErrorStatus_('),
    `${file} refresh path must stop before native fallback when Web scan is required`
  );
}

console.log('web scan engine integration OK');
