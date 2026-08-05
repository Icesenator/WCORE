const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '04B_CACHE_WALLET.gs'), 'utf8');

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
  CacheManager: {},
  GLOBAL_CACHE_KEYS: {
    GLOBAL_PRICES: 'GLOBAL_PRICES',
    GLOBAL_FX: 'GLOBAL_FX',
    GLOBAL_META: 'GLOBAL_META',
    CACHE_VERSIONS: 'CACHE_VERSIONS',
    LAST_CLEANUP: 'LAST_CLEANUP',
    GLOBAL_WALLET: 'GLOBAL_WALLET_CACHE_V1',
  },
  Obj: { forEach: () => {} },
  Logger: { log: () => {} },
};

vm.createContext(context);
vm.runInContext(source, context);

{
  const payload = {
    version: 64,
    updatedAt: Date.now(),
    assets: [
      { contract: 'native', balance: 1, symbol: 'ETH', name: 'Ether', decimals: 18 },
      { contract: '0x0000000000000000000000000000000000000001', balance: 10, symbol: 'MISS', name: 'Missing Price', decimals: 18 },
    ],
    priceMap: { native: 2100 },
    priceTsMap: { native: 12345 },
    scanStats: {
      source: 'wcore-web',
      fullCycleComplete: false,
      totalContracts: 1,
      scannedCount: 1,
      missingPrices: 1,
      missingMeta: 0,
    },
  };

  const compact = context.CacheManager._deflateWalletPayload_(payload);
  const inflated = context.CacheManager._inflateWalletPayload_(compact);

  assert.equal(inflated.version, 64, 'packed wallet cache must preserve logical cache version');
  assert.equal(inflated.priceTsMap.native, 12345, 'packed wallet cache must preserve price timestamps');
  assert.equal(inflated.scanStats.source, 'wcore-web', 'packed wallet cache must preserve web scan stats');
  assert.equal(inflated.scanStats.missingPrices, 1, 'packed wallet cache must preserve missing price count');
  assert.equal(inflated.scanStats.fullCycleComplete, false, 'packed wallet cache must preserve incomplete cycle status');
}

{
  const key = 'wallet:test';
  const oldTs = Math.floor(Date.now() / 1000) - 11 * 24 * 3600;
  const packed = {
    v: 1,
    m: {
      collision: [
        { k: 'wallet:neighbor', ts: oldTs, j: 1, v: { a: [['native', 2]] } },
        { k: key, ts: oldTs, j: 1, v: { a: [['native', 1.5]] } },
      ],
    },
  };

  context.CacheManager._VIRTUALIZE_CHAIN_CACHES = true;
  context.CacheManager._WALLET_TTL_SEC = 10 * 24 * 3600;
  context.CacheManager._isVirtualKey_ = () => true;
  context.CacheManager._hashKey_ = () => 'collision';
  context.CacheManager._inflateWalletPayload_ = (payload) => payload;
  context.CacheManager._cache = { get: () => JSON.stringify(packed), put: () => {} };
  context.CacheManager._loadPackedWalletCache_ = () => packed;

  assert.deepEqual(
    JSON.parse(context.CacheManager._packedGet_(key)).a,
    [['native', 1.5]],
    'an aged positive entry preserved by pruning must remain readable',
  );

  packed.m.collision[1].v.a[0][1] = 0;
  assert.equal(
    context.CacheManager._packedGet_(key),
    null,
    'an aged zero-balance entry must still expire',
  );

  packed.m.collision[1] = {
    k: key,
    ts: oldTs,
    s: JSON.stringify({ assets: [{ contract: 'native', balance: '3' }] }),
  };
  assert.deepEqual(
    JSON.parse(context.CacheManager._packedGet_(key)).assets[0].balance,
    '3',
    'the historical object format must follow the same preservation rule',
  );
}

console.log('packed wallet cache OK');
