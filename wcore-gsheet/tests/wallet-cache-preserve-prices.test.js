const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const walletSource = fs.readFileSync(path.join(__dirname, '..', 'src', '04B_CACHE_WALLET.gs'), 'utf8');
const globalSource = fs.readFileSync(path.join(__dirname, '..', 'src', '04C_CACHE_GLOBAL.gs'), 'utf8');

const store = {};
const context = {
  console,
  Date,
  JSON,
  Math,
  Number,
  String,
  Array,
  Object,
  RegExp,
  isFinite,
  parseFloat,
  parseInt,
  CK_get: (name) => name === 'walletGlobal' ? 'GLOBAL_WALLET_CACHE_V1' : name,
  ModuleRegistry: { register: () => {} },
  Format: { datetime: (ts) => new Date(ts).toISOString() },
  Obj: { forEach: () => {} },
  Logger: { log: () => {} },
  WalletCache: {},
  MetaCache: {},
  CacheManager: {
    init: () => {},
    walletKey: (walletAddr) => `wallet:${walletAddr}`,
    safeGetJson: (key) => store[key] ? JSON.parse(store[key]) : null,
    safeSetJson: (key, obj) => { store[key] = JSON.stringify(obj); },
    safeGet: (key) => store[key] || null,
    safeSet: (key, value) => { store[key] = String(value); },
    delete: (key) => { delete store[key]; },
    _isVirtualKey_: () => false,
  },
};

vm.createContext(context);
vm.runInContext(walletSource, context);
vm.runInContext(globalSource, context);

{
  const wallet = '0xwallet';
  const tokenPriced = '0x0000000000000000000000000000000000000001';
  const tokenOnlyOld = '0x0000000000000000000000000000000000000002';

  context.WalletCache.save(wallet, {
    updatedAt: 1000,
    assets: [
      { contract: 'native', balance: 1, symbol: 'ETH', name: 'Ether', decimals: 18 },
      { contract: tokenPriced, balance: 10, symbol: 'NEWP', name: 'New Price', decimals: 18 },
      { contract: tokenOnlyOld, balance: 20, symbol: 'OLD', name: 'Old Only', decimals: 18 },
    ],
    priceMap: { native: 2000 },
    priceTsMap: { native: 1000 },
    scanStats: { fullCycleComplete: true },
  }, {});

  const result = context.WalletCache.save(wallet, {
    updatedAt: 2000,
    assets: [
      { contract: 'native', balance: 1, symbol: 'ETH', name: 'Ether', decimals: 18 },
      { contract: tokenPriced, balance: 10, symbol: 'NEWP', name: 'New Price', decimals: 18 },
    ],
    priceMap: { native: 2100, [tokenPriced]: 0.123456 },
    priceTsMap: { native: 2000, [tokenPriced]: 2000 },
    scanStats: { source: 'wcore-web', fullCycleComplete: false, missingPrices: 1 },
  }, {});

  const saved = context.WalletCache.load(wallet, null, {});

  assert.equal(result.preserved, true, 'partial scan should preserve the fuller existing cache');
  assert.equal(saved.assets.length, 3, 'preserved cache should keep the old complete asset list');
  assert.equal(saved.priceMap[tokenPriced], 0.123456, 'new positive prices from a preserved partial scan must be merged');
  assert.equal(saved.priceTsMap[tokenPriced], 2000, 'merged prices must keep their timestamps');
  assert.equal(saved.priceMap[tokenOnlyOld], undefined, 'unpriced old tokens should remain unpriced');
}

{
  const wallet = '0xwcoreweb';
  const staleNft = '0x00000000000000000000000000000000000000a1';

  context.WalletCache.save(wallet, {
    updatedAt: 1000,
    assets: [
      { contract: 'native', balance: 1, symbol: 'ETH', name: 'Ether', decimals: 18 },
      { contract: staleNft, balance: 1, symbol: 'STALE_NFT', name: 'Stale NFT', decimals: 0 },
    ],
    priceMap: { native: 2000 },
    priceTsMap: { native: 1000 },
    scanStats: { fullCycleComplete: true },
  }, {});

  const result = context.WalletCache.save(wallet, {
    updatedAt: 2000,
    assets: [
      { contract: 'native', balance: 1, symbol: 'ETH', name: 'Ether', decimals: 18 },
    ],
    priceMap: { native: 2100 },
    priceTsMap: { native: 2000 },
    scanStats: { source: 'wcore-web', fullCycleComplete: true },
  }, {});

  const saved = context.WalletCache.load(wallet, null, {});

  assert.equal(result.preserved, false, 'authoritative wcore-web complete scan should overwrite asset list');
  assert.equal(saved.assets.length, 1, 'stale NFTs must be dropped on authoritative web scan');
  assert.equal(saved.assets[0].contract, 'native', 'native asset should remain in cache');
  assert.equal(saved.priceMap.native, 2100, 'new positive prices from web scan must still be merged');
}

{
  const wallet = '0xwcorewebblocked';
  const staleToken = '0x00000000000000000000000000000000000000b1';

  context.WalletCache.save(wallet, {
    updatedAt: 1000,
    assets: [
      { contract: 'native', balance: 1, symbol: 'BNB', name: 'BNB', decimals: 18 },
      { contract: staleToken, balance: 1, symbol: 'STALE', name: 'Stale Token', decimals: 18 },
    ],
    priceMap: { native: 400 },
    priceTsMap: { native: 1000 },
    scanStats: { fullCycleComplete: true },
  }, {});

  context.QuotaCircuitBreaker = { isTripped: () => true };
  const result = context.WalletCache.save(wallet, {
    updatedAt: 2000,
    assets: [
      { contract: 'native', balance: 1, symbol: 'BNB', name: 'BNB', decimals: 18 },
    ],
    priceMap: { native: 410 },
    priceTsMap: { native: 2000 },
    scanStats: { source: 'wcore-web', fullCycleComplete: true },
  }, {});
  delete context.QuotaCircuitBreaker;

  const saved = context.WalletCache.load(wallet, null, {});

  assert.equal(result.preserved, false, 'authoritative wcore-web scan should save even when quota breaker is tripped');
  assert.equal(saved.assets.length, 1, 'quota-blocked authoritative web scan should replace stale assets');
  assert.equal(saved.updatedAt, 2000, 'quota-blocked authoritative web scan should persist the new timestamp');
  assert.equal(saved.scanStats.source, 'wcore-web', 'quota-blocked authoritative web scan should persist scan stats');
}

{
  const wallet = '0xwcorewebdebt';
  const debtToken = '0xe36a30d249f7761327fd973001a32010b521b6fd';

  context.WalletCache.save(wallet, {
    updatedAt: 3000,
    assets: [
      { contract: 'native', balance: 0.001, symbol: 'ETH', name: 'Ether', decimals: 18 },
      { contract: debtToken, balance: -0.006, symbol: 'Comp WETH Borrow', name: 'Compound V3 cWETHv3 Borrowed', decimals: 18 },
    ],
    priceMap: { native: 1400, [debtToken]: 1400 },
    priceTsMap: { native: 3000, [debtToken]: 3000 },
    scanStats: { source: 'wcore-web', fullCycleComplete: true, totalValueEur: -6.6 },
  }, {});

  const saved = context.WalletCache.load(wallet, null, {});
  const debt = saved.assets.find((asset) => asset.contract === debtToken);

  assert.ok(debt, 'wallet cache compaction must preserve debt tokens with negative balances');
  assert.equal(debt.balance, -0.006);
  assert.equal(debt.symbol, 'Comp WETH Borrow');
  assert.equal(debt.value_eur, -8.4);

  const totalRow = saved.lastInfoMetaRows.find((row) => row[1] === 'INFO_TOTAL');
  assert.equal(Math.round(totalRow[6] * 100) / 100, -7, 'reconstructed cache totals must include negative debt values');
}

{
  const wallet = '0xbscnative';

  context.WalletCache.save(wallet, {
    updatedAt: 1000,
    assets: [
      { contract: 'native', balance: 0.21370905634607845, symbol: 'BNB', name: 'BNB', decimals: 18 },
      { contract: '0x0000000000000000000000000000000000000001', balance: 1, symbol: 'TOK', name: 'Token', decimals: 18 },
    ],
    priceMap: { native: 500 },
    priceTsMap: { native: 1000 },
    scanStats: { fullCycleComplete: true },
  }, {});

  const result = context.WalletCache.save(wallet, {
    updatedAt: 2000,
    assets: [
      { contract: 'native', balance: 0, symbol: 'BNB', name: 'BNB', decimals: 18 },
      { contract: '0x0000000000000000000000000000000000000001', balance: 1, symbol: 'TOK', name: 'Token', decimals: 18 },
    ],
    priceMap: { native: 501 },
    priceTsMap: { native: 2000 },
    scanStats: { fullCycleComplete: true },
  }, {});

  const saved = context.WalletCache.load(wallet, null, {});
  const native = saved.assets.find((asset) => asset.contract === 'native');

  assert.equal(result.preserved, false, 'non-authoritative native repair should still save the updated cache');
  assert.equal(native.balance, 0.21370905634607845, 'native positive cache must not be overwritten by an unconfirmed zero');
  assert.equal(saved.scanStats.preservedFromCache, 1, 'native preservation must be visible in scan stats');
}

{
  const wallet = '0xbscstrictzero';
  const staleToken = '0x00000000000000000000000000000000000000c1';
  const liveToken = '0x00000000000000000000000000000000000000c2';

  context.WalletCache.save(wallet, {
    updatedAt: 1000,
    assets: [
      { contract: 'native', balance: 0, symbol: 'BNB', name: 'BNB', decimals: 18 },
      { contract: staleToken, balance: 1, symbol: 'STALE', name: 'Stale Token', decimals: 18 },
      { contract: liveToken, balance: 2, symbol: 'LIVE', name: 'Live Token', decimals: 18 },
    ],
    scanStats: { fullCycleComplete: true },
  }, {});

  context.WalletCache.save(wallet, {
    updatedAt: 2000,
    assets: [
      { contract: 'native', balance: 0, symbol: 'BNB', name: 'BNB', decimals: 18 },
      { contract: liveToken, balance: 2, symbol: 'LIVE', name: 'Live Token', decimals: 18 },
    ],
    balanceTsMap: { [staleToken]: 0, [liveToken]: 2000 },
    strictTokenSet: { [staleToken]: true, [liveToken]: true },
    scanStats: { fullCycleComplete: true },
  }, { FLAGS: { STRICT_TOKEN_RANGE: true } });

  const saved = context.WalletCache.load(wallet, null, {});

  assert.ok(!saved.assets.find((asset) => asset.contract === staleToken), 'strict scanned zero token must not be preserved from stale cache');
  assert.ok(saved.assets.find((asset) => asset.contract === liveToken), 'strict live token should remain');
}

console.log('wallet cache preserve prices OK');
