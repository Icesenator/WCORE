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

{
  // Bug 2026-08-21 (gel de cache depuis la bascule web-scan) :
  // _mergePackedWalletCache_ ecrasait l'entree fraiche (web scan, moins d'assets
  // car filtree scam/zero-balance) par l'entree stockee (cache direct-RPC riche en
  // tokens zombies) des que celle-ci avait plus d'assets. La regle doit privilegier
  // la fraicheur (ts), le nombre d'assets ne servant que de tie-breaker.
  const key = 'CELO_CACHE_WALLET_0x17d518736ee9341dcdc0a2498e013d33cfcdd080';
  const nowSec = Math.floor(Date.now() / 1000);
  const staleTs = nowSec - 55 * 24 * 3600;

  const freshEntry = {
    k: key,
    ts: nowSec,
    j: 1,
    v: { v: 5, cv: 11, u: nowSec * 1000, a: [['native', 1.72], ['0xa', 2], ['0xb', 3]], pm: {}, fx: null },
  };
  const staleEntry = {
    k: key,
    ts: staleTs,
    j: 1,
    v: { v: 5, cv: 11, u: staleTs * 1000, a: [['native', 1.72], ['0xa', 2], ['0xb', 3], ['0xzombie1', 0], ['0xzombie2', 0]], pm: {}, fx: null },
  };

  const hash = 'merge_hash';
  const storedBlob = JSON.stringify({ v: 2, m: { [hash]: staleEntry } });
  const written = [];

  context.CacheManager._VIRTUALIZE_CHAIN_CACHES = true;
  context.CacheManager._WALLET_TTL_SEC = 10 * 24 * 3600;
  context.CacheManager.init = () => {};
  context.CacheManager._isVirtualKey_ = () => true;
  context.CacheManager._hashKey_ = () => hash;
  context.CacheManager._getStorageUsagePct = () => 10;
  context.CacheManager._emergencyPurge_ = undefined;
  context.CacheManager._props = {
    getProperty: (k) => (k === 'GLOBAL_WALLET_CACHE_V1' ? storedBlob : null),
    setProperty: (k, v) => written.push(v),
    deleteProperty: () => {},
  };
  context.CacheManager._cache = { get: () => null, put: () => {} };
  context.Obj = {
    forEach: (obj, fn) => {
      for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) fn(k, obj[k]);
      }
    },
  };

  function savedEntryFor(blobJson) {
    const blob = JSON.parse(blobJson);
    return Array.isArray(blob.m[hash]) ? blob.m[hash].find((e) => e.k === key) : blob.m[hash];
  }

  // Cas 1 : l'entree fraiche (web scan, moins d'assets) doit gagner face a
  // l'entree stockee plus vieille mais plus riche en assets.
  const incomingFresh = { v: 2, m: {} };
  incomingFresh.m[hash] = freshEntry;
  assert.equal(context.CacheManager._savePackedWalletCache_(incomingFresh), true, 'la sauvegarde du blob packe doit reussir');
  assert.equal(
    savedEntryFor(written[written.length - 1]).ts,
    nowSec,
    "l'entree fraiche (web scan) doit gagner meme si l'entree stockee a plus d'assets",
  );

  // Cas 2 (repro PICKLE 2026-08-24) : un worker concurrent peut re-emballer
  // un payload STALE apres le web scan. Son enveloppe ts est plus recente, mais
  // son payload v.u est ancien : il ne doit jamais ecraser la donnee fraiche.
  const concurrentEntry = {
    k: key,
    ts: nowSec + 30,
    j: 1,
    v: { v: 5, cv: 11, u: staleTs, a: [['native', 9], ['0x9347e04ea939b15f5965dd1adb5e496423d21956', 1]], pm: {}, fx: null },
  };
  const newerStoredBlob = JSON.stringify({ v: 2, m: { [hash]: concurrentEntry } });
  context.CacheManager._props.getProperty = (k) => (k === 'GLOBAL_WALLET_CACHE_V1' ? newerStoredBlob : null);

  const incomingOlder = { v: 2, m: {} };
  incomingOlder.m[hash] = freshEntry;
  assert.equal(context.CacheManager._savePackedWalletCache_(incomingOlder), true, 'la seconde sauvegarde doit reussir');
  assert.equal(
    savedEntryFor(written[written.length - 1]).v.u,
    nowSec * 1000,
    "le payload frais doit gagner meme si un worker concurrent re-emballe un payload stale plus tard",
  );
}

console.log('packed wallet cache OK');
