const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.join(__dirname, '..', 'src', '41_GSHEET_WEB_SCAN.gs');
const source = fs.readFileSync(sourcePath, 'utf8');
const refreshSource = fs.readFileSync(path.join(__dirname, '..', 'src', '16_REFRESH.gs'), 'utf8');
const outputSource = fs.readFileSync(path.join(__dirname, '..', 'src', '10_OUTPUT.gs'), 'utf8');
const evmEngineSource = fs.readFileSync(path.join(__dirname, '..', 'src', '11_EVM_ENGINE.gs'), 'utf8');
const walletNamesSource = fs.readFileSync(path.join(__dirname, '..', 'src', '12_WALLET_NAMES.gs'), 'utf8');
const baseEngineSource = fs.readFileSync(path.join(__dirname, '..', 'src', '10A_BASE_ENGINE.gs'), 'utf8');

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

function makeBaseEngineContext(saved) {
  const context = {
    console,
    Date,
    Math,
    String,
    Number,
    Boolean,
    Array,
    Object,
    RegExp,
    isFinite,
    parseInt,
    CacheManager: { init: () => {} },
    WalletCache: {
      save: (walletKey, cache, config) => saved.push({ walletKey, cache, config }),
    },
  };
  vm.createContext(context);
  vm.runInContext(baseEngineSource, context);
  return context;
}

function makeWalletNamesContext() {
  const context = {
    console,
    Object,
    String,
    Addr: { normalize: (v) => String(v || '').toLowerCase() },
  };
  vm.createContext(context);
  vm.runInContext(walletNamesSource, context);
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
      load: (_address, _timer, config) => config ? (props.__walletCache || null) : null,
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
    QuotaCircuitBreaker: props.__quotaCircuitBreaker,
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
  const ctx = makeWalletNamesContext();
  assert.equal(
    ctx.WalletNames.get('0x9eb34B670F79491329F71080717EdF071fF5353f', 'Base'),
    'UniSwap - Base',
    'wallet registry labels checksum/mixed-case addresses with Wallet - Chain'
  );
  assert.equal(
    ctx.WalletNames.get('0x18BBEC24e4ff9C43D538121528C08a88Cacd4e4c', 'Base'),
    'Warpcast - Base',
    'wallet registry labels Warpcast checksum address with Wallet - Chain'
  );
}

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
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
    __quotaCircuitBreaker: { isTripped: () => false },
  }, samplePayload);
  ctx.BaseEngine.isSystemBlocked = () => true;

  assert.equal(ctx._webScanQuotaTripped_(), false, 'web scan quota precheck must not treat generic system blocked as quota');
  const result = ctx._webScanWallet_('0xabc', [], false, { CHAIN: { KEY: 'SOLANA', NAME: 'Solana', NATIVE_SYMBOL: 'SOL' }, CACHE_VERSION: 1 });

  assert.ok(result && result.ok, 'web scan should still attempt the API when only generic system-blocked is true');
  assert.ok(!String(result.status || '').includes('[BLOCKED:QUOTA]'), 'generic system-blocked must not produce a false quota label');
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
  const config = { CHAIN: { NAME: 'Solana', NATIVE_SYMBOL: 'SOL' }, CACHE_VERSION: 7 };
  const payload = {
    ok: true,
    chain: 'SOLANA',
    chainName: 'Solana',
    vm: 'SVM',
    timestamp: '2026-07-01T07:48:31.000Z',
    native: { symbol: 'SOL', balance: 0.029835803, priceEur: 66.2, valueEur: 1.975130159 },
    tokens: [{ symbol: 'DBR', name: 'deBridge', contract: 'DBRiDgJAMsM95moTzJs7M9LnkGErpbv9v6CUR1DXnUu5', balance: 131.77599, decimals: 6, priceEur: 0.01, value_eur: 1.76 }],
    totalValueEur: 3.73,
    errors: [],
    degraded: false,
    fxRate: 0.8767,
    scanMs: 123,
  };
  const cache = ctx._webScanConvertToWalletCache_(payload, config);
  const dbr = cache.assets.find((asset) => asset.symbol === 'DBR');
  assert.equal(dbr.value_eur, 1.76, 'web scan adapter must accept snake_case value_eur from Web payloads');
  assert.ok(Math.abs(dbr.price_eur - (1.76 / 131.77599)) < 1e-12, 'web scan adapter must derive precise price from precise value when priceEur is rounded');
  assert.ok(Math.abs(cache.priceMap['DBRiDgJAMsM95moTzJs7M9LnkGErpbv9v6CUR1DXnUu5'] - dbr.price_eur) < 1e-12);
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
  assert.equal(ctx._wd_extractTimestamp_('[WEB_SCAN_PRESERVED] 2026-06-26 20:00:00'), '2026-06-26 20:00:00');
  assert.deepEqual(
    ctx._wd_needsRefresh_('', '[WEB_SCAN_PRESERVED] 2026-06-26 20:00:00', new Date(2026, 5, 26, 20, 5, 0).getTime(), 5 * 3600000),
    { needsPulse: true, reason: 'error', blockedReason: null, useBlockedCooldown: false },
    'preserved web scans must be retried after normal B1 cooldown even when their status timestamp is fresh'
  );
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
  const ctx = makeContext({});
  const payload = ctx._webScanRequestPayload_(
    'SolanaRawAddress111111111111111111111111111',
    [['TokenMint11111111111111111111111111111111'], [''], ['TokenMint22222222222222222222222222222222']],
    false,
    { CHAIN: { KEY: 'SOLANA', NAME: 'Solana' } }
  );
  assert.equal(payload.strictTokens, true, 'web scan requests must use strict token mode when I2:I is provided');
  assert.deepEqual(payload.customTokens, ['TokenMint11111111111111111111111111111111', 'TokenMint22222222222222222222222222222222']);
}

{
  const degradedWithAssetsPayload = JSON.stringify({
    ok: true,
    chain: 'BASE',
    chainName: 'Base',
    vm: 'EVM',
    timestamp: '2026-06-30T04:22:36.000Z',
    native: { symbol: 'ETH', balance: 0.006, priceEur: 1394, valueEur: 8.36 },
    tokens: [
      { symbol: 'CYBER', name: 'CyberConnect', contract: '0x14778860e937f509e651192a90589de711fb88a9', balance: 1, decimals: 18, priceEur: 2.61712e18, valueEur: 2.61712e18 },
      { symbol: 'BONSAI', name: 'Bonsai Token', contract: '0x474f4cb764df9da079d94052fed39625c147c12c', balance: 1491, decimals: 18, priceEur: 0.000073, valueEur: 0.108843 },
    ],
    totalValueEur: 2.61712e18,
    errors: ['balances fetch: RPC_TIMEOUT'],
    degraded: true,
    fxRate: 0.877,
    scanMs: 11262,
  });
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  }, degradedWithAssetsPayload);
  const res = ctx._webScanWallet_('0x0000000000000000000000000000000000000001', [], false, { CHAIN: { KEY: 'BASE', NAME: 'Base', NATIVE_SYMBOL: 'ETH' } }, 'base_cache_key');
  assert.equal(res.ok, true);
  assert.match(res.status, /WEB_SCAN_PRESERVED/, 'any degraded web scan with errors must preserve existing cache');
  assert.equal(ctx.__saved.length, 0, 'degraded web scan with errors must not overwrite a valid wallet cache');
}

{
  const correctedAbsurdPricePayload = JSON.stringify({
    ok: true,
    chain: 'BASE',
    chainName: 'Base',
    vm: 'EVM',
    timestamp: '2026-06-30T05:22:36.000Z',
    native: { symbol: 'ETH', balance: 0.006, priceEur: 1394, valueEur: 8.36 },
    tokens: [
      { symbol: 'CYBER', name: 'CyberConnect', contract: '0x14778860e937f509e651192a90589de711fb88a9', balance: 1, decimals: 18, priceEur: null, valueEur: null },
      { symbol: 'BONSAI', name: 'Bonsai Token', contract: '0x474f4cb764df9da079d94052fed39625c147c12c', balance: 1491, decimals: 18, priceEur: null, valueEur: null },
    ],
    totalValueEur: 8.36,
    errors: ['CYBER price: ABSURD_PRICE', 'BONSAI price: ABSURD_PRICE'],
    degraded: true,
    fxRate: 0.877,
    scanMs: 11262,
  });
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  }, correctedAbsurdPricePayload);
  const res = ctx._webScanWallet_('0x0000000000000000000000000000000000000001', [], false, { CHAIN: { KEY: 'BASE', NAME: 'Base', NATIVE_SYMBOL: 'ETH' } }, 'base_cache_key');
  assert.equal(res.ok, true);
  assert.match(res.status, /WEB_SCAN_DEGRADED/, 'absurd-price-only degraded scan is safe to save after API neutralizes values');
  assert.equal(ctx.__saved.length, 1, 'sanitized absurd-price payload must overwrite stale corrupted wallet cache');
  assert.equal(ctx.__saved[0].cache.priceMap['0x14778860e937f509e651192a90589de711fb88a9'], undefined);
  assert.equal(ctx.__saved[0].cache.priceMap['0x474f4cb764df9da079d94052fed39625c147c12c'], undefined);
}

{
  const priceGapPayload = JSON.stringify({
    ok: true,
    chain: 'BASE',
    chainName: 'Ledger - Base',
    vm: 'EVM',
    timestamp: '2026-06-30T06:22:36.000Z',
    native: { symbol: 'ETH', balance: 0.006, priceEur: 1394, valueEur: 8.36 },
    tokens: [
      { symbol: 'CYBER', name: 'CyberConnect', contract: '0x14778860e937f509e651192a90589de711fb88a9', balance: 1, decimals: 18, priceEur: 0.294, valueEur: 0.294 },
      { symbol: 'DRINK', name: 'Drinking To Get Drunk', contract: '0xc2a5afd72f62b4ccac9d47f33c93974da570fa34', balance: 135000, decimals: 18, priceEur: 0.000015, valueEur: 2.025 },
      { symbol: 'MISSING', name: 'Missing Price', contract: '0x0000000000000000000000000000000000000002', balance: 1, decimals: 18, priceEur: null, valueEur: null },
    ],
    totalValueEur: 10.679,
    errors: ['explorer cooldown active for BASE', 'MISSING price: NO_PRICE'],
    degraded: true,
    fxRate: 0.877,
    scanMs: 11262,
  });
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  }, priceGapPayload);
  const res = ctx._webScanWallet_('0x0000000000000000000000000000000000000001', [], false, { CHAIN: { KEY: 'BASE', NAME: 'Base', NATIVE_SYMBOL: 'ETH' } }, 'base_cache_key');
  assert.equal(res.ok, true);
  assert.match(res.status, /WEB_SCAN_DEGRADED/, 'price-gap-only degraded scan is safe to save and can repair corrupted prices');
  assert.equal(ctx.__saved.length, 1, 'price-gap-only degraded scan must overwrite stale corrupted wallet cache');
  assert.equal(ctx.__saved[0].cache.priceMap['0x14778860e937f509e651192a90589de711fb88a9'], 0.294);
}

{
  const baseUsefulDegradedPayload = JSON.stringify({
    ok: true,
    chain: 'BASE',
    chainName: 'Ledger - Base',
    vm: 'EVM',
    timestamp: '2026-06-30T10:09:23.000Z',
    native: { symbol: 'ETH', balance: 0.006, priceEur: 1387, valueEur: 8.3 },
    tokens: [
      { symbol: 'C-Locked', name: 'Chainbase Staking [Lock]', contract: '0x0297E997b56017164110f75F71ecd58dA823085B', balance: 58.58143972, decimals: 18, priceEur: 0.067, valueEur: 3.94 },
      { symbol: 'C-Airdrop', name: 'Chainbase Airdrop [Flex]', contract: '0x3F2061547174d206613Bc70869A454c25F84A0dF', balance: 15.357840691300828, decimals: 18, priceEur: 0.067, valueEur: 1.03 },
      { symbol: 'CUSTOM', name: 'Custom No Price', contract: '0x0000000000000000000000000000000000000002', balance: 1, decimals: 18, priceEur: null, valueEur: null },
    ],
    totalValueEur: 13.27,
    errors: [
      'explorer error BASE: This operation was aborted',
      '[DEGRADED] SOLVBTC balance: cache_fallback_live_failed, using cache fallback',
      'CUSTOM price: NO_PRICE',
    ],
    degraded: true,
    fxRate: 0.86,
    scanMs: 3000,
  });
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  }, baseUsefulDegradedPayload);
  const res = ctx._webScanWallet_('0x17d518736Ee9341dcDc0A2498e013D33CFCDD080', [], false, { CHAIN: { KEY: 'BASE', NAME: 'Base', NATIVE_SYMBOL: 'ETH' } }, 'base_cache_key');
  assert.equal(res.ok, true);
  assert.match(res.status, /WEB_SCAN_DEGRADED/, 'useful Base degraded scans with cache-backed balances must save refreshed DeFi labels');
  assert.equal(ctx.__saved.length, 1, 'useful Base degraded scan must overwrite stale DeFi labels in wallet cache');
  const savedNames = (ctx.__saved[0].cache.assets || []).map((t) => t.name);
  assert.ok(savedNames.includes('Chainbase Staking [Lock]'));
  assert.ok(savedNames.includes('Chainbase Airdrop [Flex]'));
}

{
  const partialPayload = JSON.stringify({
    ok: true,
    chain: 'BASE',
    chainName: 'Ledger - Base',
    vm: 'EVM',
    timestamp: '2026-06-30T10:20:00.000Z',
    native: { symbol: 'ETH', balance: 0.006, priceEur: 1387, valueEur: 8.3 },
    tokens: [
      { symbol: 'C-Locked', name: 'Chainbase Staking [Lock]', contract: '0x0297E997b56017164110f75F71ecd58dA823085B', balance: 58.58143972, decimals: 18, priceEur: 0.067, valueEur: 3.94 },
    ],
    totalValueEur: 12.24,
    errors: ['balances fetch: RPC_TIMEOUT'],
    degraded: true,
    fxRate: 0.86,
    scanMs: 3000,
  });
  const oldCache = {
    updatedAt: 111,
    last_run_update_ms: 111,
    assets: [
      { contract: 'native', symbol: 'ETH', name: 'Ether', balance: 0.006, decimals: 18, price_eur: 1300, value_eur: 7.8 },
      { contract: '0xold0000000000000000000000000000000000001', symbol: 'OLD', name: 'Old Token', balance: 2, decimals: 18, price_eur: 5, value_eur: 10 },
      { contract: '0x30eba82795fe0f7e5b1fc51a1109ffe47c941ba3', symbol: 'AGI', name: 'AGI Holdings', balance: 5099, decimals: 18, price_eur: 0.000011, value_eur: 0.056 },
      { contract: '0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2', symbol: 'DRB', name: 'DebtReliefBot', balance: 888, decimals: 18, price_eur: 0.000032, value_eur: 0.028 },
      { contract: '0x0297E997b56017164110f75F71ecd58dA823085B', symbol: 'C-Locked', name: 'Chainbase Staking (locked)', balance: 58.58143972, decimals: 18, price_eur: 0.06, value_eur: 3.51 },
    ],
    priceMap: { native: 1300, '0xold0000000000000000000000000000000000001': 5, '0x0297E997b56017164110f75F71ecd58dA823085B': 0.06 },
    priceTsMap: {},
    balanceTsMap: {},
    scanStats: { source: 'old-cache' },
  };
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
    __walletCache: oldCache,
  }, partialPayload);
  const res = ctx._webScanWallet_('0x17d518736Ee9341dcDc0A2498e013D33CFCDD080', [], false, { CHAIN: { KEY: 'BASE', NAME: 'Base', NATIVE_SYMBOL: 'ETH' } }, 'base_cache_key');
  assert.equal(res.ok, true);
  assert.match(res.status, /WEB_SCAN_DEGRADED/, 'useful but unsafe degraded scan should save a conservative merged cache');
  assert.equal(ctx.__saved.length, 1, 'merged degraded scan must write one cache update');
  const merged = ctx.__saved[0].cache.assets;
  assert.ok(merged.find((t) => t.symbol === 'OLD'), 'old cache-only token must be preserved');
  const preservedOld = merged.find((t) => t.symbol === 'OLD');
  assert.equal(preservedOld.price_eur, 5, 'degraded partial scans must keep stable cached prices for preserved cache-only tokens');
  assert.equal(preservedOld.value_eur, 10, 'degraded partial scans must keep stable cached values for preserved cache-only tokens');
  assert.equal(ctx.__saved[0].cache.priceMap['0xold0000000000000000000000000000000000001'], 5, 'degraded partial scans must keep priceMap entries for preserved cache-only tokens');
  assert.ok(!merged.find((t) => t.symbol === 'AGI'), 'old scam cache-only token must be purged during degraded merge');
  assert.ok(!merged.find((t) => t.symbol === 'DRB'), 'old scam cache-only token must be purged during degraded merge');
  assert.ok(merged.find((t) => t.symbol === 'C-Locked' && t.name === 'Chainbase Staking [Lock]'), 'new useful metadata must update the cached token');
  assert.equal(ctx.__saved[0].cache.scanStats.webMergePreservedAssets, 1);
}

{
  const bscPartialPayload = JSON.stringify({
    ok: true,
    chain: 'BSC',
    chainName: 'BNB Chain',
    vm: 'EVM',
    timestamp: '2026-06-30T18:10:00.000Z',
    native: { symbol: 'BNB', balance: 0.01, priceEur: 560, valueEur: 5.6 },
    tokens: [
      { symbol: 'HLG', name: 'Holograph', contract: '0x740df024ce73f589acd5e8756b377ef8c6558bab', balance: 205, decimals: 18, priceEur: 0.0000018, valueEur: 0 },
      { symbol: 'FROG', name: 'Frog', contract: '0x4ad663403df2f0e7987bc9c74561687472e1611c', balance: 2886, decimals: 18, priceEur: 0.00007, valueEur: 0.2 },
    ],
    totalValueEur: 5.8,
    errors: ['balances fetch: RPC_TIMEOUT'],
    degraded: true,
    fxRate: 0.86,
    scanMs: 3000,
  });
  const btcb = '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c';
  const sol = '0x570a5d26f7765ecb712c0924e4de545b89fd43df';
  const oldCache = {
    updatedAt: 111,
    last_run_update_ms: 111,
    assets: [
      { contract: 'native', symbol: 'BNB', name: 'BNB', balance: 0.01, decimals: 18, price_eur: 560, value_eur: 5.6 },
      { contract: btcb, symbol: 'BTCB', name: 'BTCB Token', balance: 0.002034716466, decimals: 18, price_eur: 147636.5681, value_eur: 300.3985561 },
      { contract: sol, symbol: 'SOL', name: 'Solana Token', balance: 0.040815, decimals: 18, price_eur: 188.4314602, value_eur: 7.690329 },
    ],
    priceMap: { native: 560, [btcb]: 147636.5681, [sol]: 188.4314602 },
    priceTsMap: { [btcb]: 111, [sol]: 111 },
    balanceTsMap: { [btcb]: 111, [sol]: 111 },
    scanStats: { source: 'old-cache' },
  };
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
    __walletCache: oldCache,
  }, bscPartialPayload);
  const res = ctx._webScanWallet_('0xd5b0dbd75056a30411be789775e40664ec858e51', [[btcb], [sol]], false, { CHAIN: { KEY: 'BSC', NAME: 'BNB Chain', NATIVE_SYMBOL: 'BNB' } }, 'bsc_cache_key');
  assert.equal(res.ok, true);
  assert.match(res.status, /WEB_SCAN_DEGRADED/, 'partial BSC scan should merge with cache instead of deleting legitimate cached tokens');
  assert.equal(ctx.__saved.length, 1);
  const saved = ctx.__saved[0].cache;
  const savedBtcb = saved.assets.find((t) => t.contract === btcb);
  const savedSol = saved.assets.find((t) => t.contract === sol);
  assert.equal(savedBtcb, undefined, 'explicitly requested BTCB must not be resurrected from stale cache when absent from Web payload');
  assert.equal(savedSol, undefined, 'explicitly requested SOL must not be resurrected from stale cache when absent from Web payload');
  assert.equal(saved.balanceTsMap[btcb], 0, 'strict requested BTCB absent from Web payload must be saved as confirmed zero');
  assert.equal(saved.balanceTsMap[sol], 0, 'strict requested SOL absent from Web payload must be saved as confirmed zero');
  assert.equal(saved.priceMap[btcb], undefined, 'absurd cached BTCB priceMap entry must be purged');
  assert.equal(saved.priceMap[sol], undefined, 'absurd cached SOL priceMap entry must be purged');
}

{
  const degradedUsefulNativeZeroPayload = JSON.stringify({
    ok: true,
    chain: 'BSC',
    chainName: 'BNB Chain',
    vm: 'EVM',
    timestamp: '2026-07-14T03:09:03.000Z',
    native: { symbol: 'BNB', balance: 0, priceEur: 498.7, valueEur: 0 },
    tokens: [
      { symbol: 'USDT', name: 'Tether USD', contract: '0x55d398326f99059ff775485246999027b3197955', balance: 0.0214917276, decimals: 18, priceEur: 0.8777621565, valueEur: 0.01886462517 },
    ],
    totalValueEur: 0.01886462517,
    errors: ['blockNumber consensus failed; token log discovery limited to latest block'],
    degraded: true,
    fxRate: 0.8778,
    scanMs: 6096,
  });
  const oldCache = {
    updatedAt: 111,
    last_run_update_ms: 111,
    assets: [
      { contract: 'native', symbol: 'BNB', name: 'BNB', balance: 0.21350178363746847, decimals: 18, price_eur: 498.7, value_eur: 106.44 },
      { contract: '0x55d398326f99059ff775485246999027b3197955', symbol: 'USDT', name: 'Tether USD', balance: 0.0214917276, decimals: 18, price_eur: 0.8777621565, value_eur: 0.01886462517 },
    ],
    priceMap: { native: 498.7, '0x55d398326f99059ff775485246999027b3197955': 0.8777621565 },
    priceTsMap: { native: 111, '0x55d398326f99059ff775485246999027b3197955': 111 },
    balanceTsMap: { native: 111, '0x55d398326f99059ff775485246999027b3197955': 111 },
    scanStats: { source: 'old-cache' },
  };
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
    __walletCache: oldCache,
  }, degradedUsefulNativeZeroPayload);
  const res = ctx._webScanWallet_('0x17d518736ee9341dcdc0a2498e013d33cfcdd080', [], false, { CHAIN: { KEY: 'BSC', NAME: 'BNB Chain', NATIVE_SYMBOL: 'BNB' } }, 'bsc_cache_key');
  assert.equal(res.ok, true);
  assert.match(res.status, /WEB_SCAN_DEGRADED/, 'degraded BSC scan should merge instead of overwriting native with zero');
  assert.equal(ctx.__saved.length, 1);
  const savedNative = ctx.__saved[0].cache.assets.find((t) => t.contract === 'native');
  assert.equal(savedNative.balance, 0.21350178363746847, 'degraded Web native zero must not overwrite cached positive native BNB');
  assert.equal(ctx.__saved[0].cache.scanStats.webNativePreservedFromCache, 1, 'native preservation must be visible in Web scan stats');
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
  const tokens = [
    { symbol: 'WCT', name: 'WalletConnect Token', contract: '0xef4461891dfb3ac8572ccf7c794664a8dd927945', balance: 45.38886228, decimals: 18, priceEur: 0.03646375792, valueEur: 1.655048487 },
    { symbol: 'WCT Claimable', name: 'WCT Staking Reward Distributor', contract: '0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf', balance: 1.5, decimals: 18, priceEur: 0.03646375792, valueEur: 0.054695636 },
    { symbol: 'WCT Stake', name: 'WCT Stake Weight', contract: '0x521b4c065bbdbe3e20b3727340730936912dfa46', balance: 10, decimals: 18, priceEur: 0.03646375792, valueEur: 0.364637579 },
    { symbol: 'Comp WETH Borrow', name: 'Compound V3 cWETHv3 Borrowed', contract: '0xe36a30d249f7761327fd973001a32010b521b6fd', balance: -0.006, decimals: 18, priceEur: 1387.02, valueEur: -8.32212 },
    { symbol: 'Comp wrsETH', name: 'Compound V3 cWETHv3 Collateral', contract: '0xe36a30d249f7761327fd973001a32010b521b6fd', balance: 0.5, decimals: 18, priceEur: 1700, valueEur: 850 },
  ];
  const payloadWithBlockNumberConsensusError = JSON.stringify({
    ok: true,
    chain: 'OPTIMISM',
    chainName: 'Optimism',
    vm: 'EVM',
    timestamp: '2026-06-30T09:58:33.000Z',
    native: { symbol: 'ETH', balance: 0.001390156746, priceEur: 1387.02, valueEur: 1.92817521 },
    tokens: tokens,
    totalValueEur: 847.68,
    errors: ['blockNumber consensus failed; token log discovery limited to latest block'],
    degraded: true,
    fxRate: 0.86,
    scanMs: 3000,
  });
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
  }, payloadWithBlockNumberConsensusError);
  const res = ctx._webScanWallet_('0x6a3530ad9e5b1779de37f5e6af82999c325ea3f7', [], false, { CHAIN: { KEY: 'OPTIMISM', NAME: 'Optimism', NATIVE_SYMBOL: 'ETH' } }, 'optimism_cache_key');
  assert.equal(res.ok, true, 'web scan must succeed even with blockNumber consensus error if payload has real data');
  assert.match(res.status, /WEB_SCAN_OK|WEB_SCAN_DEGRADED/, 'web scan with non-empty tokens + discovery-only errors must save');
  assert.equal(ctx.__saved.length, 1, 'web scan with non-empty tokens + discovery-only errors must overwrite the cache');
  const savedTokens = (ctx.__saved[0].cache.assets || []).map((t) => t.symbol);
  assert.ok(savedTokens.includes('WCT Claimable'), 'WCT Claimable must be persisted');
  assert.ok(savedTokens.includes('WCT Stake'), 'WCT Stake must be persisted');
  assert.ok(savedTokens.includes('Comp WETH Borrow'), 'Comp WETH Borrow must be persisted');
  assert.ok(savedTokens.includes('Comp wrsETH'), 'Comp wrsETH must be persisted');
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
  let handled = 0;
  const ctx = makeContext({
    GSHEET_WEB_SCAN_ENABLED: 'true',
    WCORE_WEB_API_URL: 'https://api.example.test',
    GSHEET_API_TOKEN: 'secret',
    GSHEET_WEB_SCAN_ALLOWLIST: 'ALL',
    __quotaCircuitBreaker: {
      isTripped: () => false,
      handleError: (err) => {
        handled++;
        return String(err && err.message || err).includes('Service invoked too many times');
      },
    },
  }, () => {
    throw new Error('Service invoked too many times for one day: urlfetch.');
  });
  const res = ctx._webScanWallet_('0x0000000000000000000000000000000000000001', [], false, { CHAIN: { KEY: 'ARBITRUM_ONE', NAME: 'Arbitrum One' } });
  assert.equal(res.ok, true, 'quota UrlFetch failures should return a visible blocked status');
  assert.match(res.status, /\[BLOCKED:QUOTA\]/);
  assert.equal(handled, 1, 'quota UrlFetch failures should trip the quota breaker once');
  assert.equal(ctx.DIAG_WEB_SCAN_LAST_ERROR('ARBITRUM_ONE')[2][1], 'BLOCKED_QUOTA ARBITRUM_ONE');
}

{
  const saved = [];
  const ctx = makeBaseEngineContext(saved);
  const cache = { updatedAt: new Date('2026-07-08T17:00:00Z').getTime(), assets: [] };
  const trigger = '2026-07-08 19:20:00';
  const remembered = ctx.BaseEngine.rememberRefreshTriggerAttempt('wallet-cache-key', { CHAIN: { KEY: 'ARBITRUM_ONE' } }, cache, trigger);
  assert.equal(remembered, true, 'quota-blocked scans should persist the attempted B1 trigger');
  assert.equal(cache.last_refresh_trigger, trigger);
  assert.equal(saved.length, 1, 'remembering the trigger should save the existing cache once');
  assert.equal(
    ctx.BaseEngine.shouldSkipRefreshForSameTrigger('wallet-cache-key', {}, cache, false, trigger),
    true,
    'the next recalculation with unchanged B1 should skip Web scan even when cache.updatedAt is older than B1'
  );
}

{
  const saved = [];
  const ctx = makeBaseEngineContext(saved);
  const staleTrigger = '2000-01-01 00:10:00';
  const oldCache = { updatedAt: new Date('1999-12-30T00:00:00Z').getTime(), assets: [] };
  assert.equal(
    ctx.BaseEngine.shouldSkipNoTriggerRecentScan('wallet-cache-key', {}, oldCache, false, staleTrigger),
    true,
    'a stale B1 timestamp must not trigger a scan just because cache.updatedAt is older than B1'
  );
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
  assert.equal(source.includes('GSHEET_WEB_SCAN_DENYLIST'), false, 'web scan must not use per-address denylist; WCORE WEB is the wallet label source');
  assert.equal(source.includes('_webScanAddressDenied_'), false, 'web scan must not fallback to native GAS for registered wallet labels');
  assert.equal(evmEngineSource.includes('webScanDenied'), false, 'EVM refresh must not bypass Web-required behavior for label-known wallets');
}

{
  const ctx = makeContext({});
  assert.equal(ctx._webScanChainKey_({ CHAIN: { NAME: 'BNB Chain' }, KEYS: { PREFIX: 'BSC_CACHE_' } }), 'BSC', 'web scan must use canonical factory key for BNB Chain');
  assert.equal(ctx._webScanChainKey_({ CHAIN: { NAME: 'zkLink Nova' }, KEYS: { PREFIX: 'ZKLINKNOVA_CACHE_' } }), 'ZKLINKNOVA', 'web scan must preserve canonical factory key spelling');
  assert.equal(ctx._webScanChainKey_({ CHAIN: { NAME: 'Injective' }, KEYS: { PREFIX: 'INJECTIVE_COSMOS_CACHE_' } }), 'INJECTIVE', 'web scan must remove Cosmos cache suffix from canonical key');
  assert.equal(ctx._webScanChainKey_({ CHAIN: { NAME: 'Cosmos Hub' }, KEYS: { PREFIX: 'COSMOS_HUB_COSMOS_CACHE_' } }), 'COSMOS_HUB', 'web scan must remove Cosmos suffix without damaging chain names containing underscores');
  assert.equal(ctx._webScanChainKey_({ CHAIN: { KEY: 'WORLDCHAIN', NAME: 'World Chain' } }), 'WORLDCHAIN', 'explicit chain key takes priority');
}

{
  const props = {};
  const ctx = makeContext(props, () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, chain: 'OPTIMISM', chainName: 'Optimism', vm: 'EVM', native: { symbol: 'ETH', balance: 0, priceEur: 1400, valueEur: 0 }, tokens: [], totalValueEur: 0, errors: ['Compound V3 invalid 32-byte extra arg chain=OPTIMISM', 'WCT discovery failed: TIMEOUT'], degraded: true, fxRate: 0.86 }) }));
  ctx._webScanSetLastError_('errors=2 first=Compound V3 invalid 32-byte extra arg chain=OPTIMISM', 'OPTIMISM');
  assert.equal(props['GSHEET_WEB_SCAN_LAST_ERROR'], 'errors=2 first=Compound V3 invalid 32-byte extra arg chain=OPTIMISM');
  assert.equal(props['GSHEET_WEB_SCAN_LAST_ERROR_OPTIMISM'], 'errors=2 first=Compound V3 invalid 32-byte extra arg chain=OPTIMISM');
  const diag = ctx.DIAG_WEB_SCAN_LAST_ERROR('OPTIMISM');
  assert.equal(diag.length, 3, 'DIAG returns header + global + per-chain');
  assert.equal(diag[2][0], 'OPTIMISM', 'DIAG row labels per-chain key');
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
