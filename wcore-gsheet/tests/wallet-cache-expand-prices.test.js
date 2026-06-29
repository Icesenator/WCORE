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

function nearlyEqual(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

vm.createContext(context);
vm.runInContext(walletSource, context);
vm.runInContext(globalSource, context);

{
  const wallet = '0xscroll';
  const token = '0x0000000000000000000000000000000000000001';

  context.WalletCache.save(wallet, {
    version: 63,
    updatedAt: 2000,
    assets: [
      { contract: 'native', balance: 0.0125, symbol: 'ETH', name: 'Ether', decimals: 18 },
      { contract: token, balance: 2, symbol: 'SCR', name: 'Scroll', decimals: 18 },
    ],
    priceMap: { native: 1385.88, [token]: 0.5 },
    priceTsMap: { native: 2000, [token]: 2000 },
    usd_to_eur_rate: 0.8779,
    scanStats: { source: 'wcore-web', fullCycleComplete: true },
  }, {});

  const loaded = context.WalletCache.load(wallet, null, {});

  const native = loaded.assets.find((asset) => asset.contract === 'native');
  const scr = loaded.assets.find((asset) => asset.contract === token);
  const infoTotal = loaded.lastInfoMetaRows.find((row) => row[1] === 'INFO_TOTAL');

  assert.equal(native.price_eur, 1385.88, 'expanded native asset should restore price_eur from priceMap');
  nearlyEqual(native.value_eur, 17.3235, 'expanded native asset should restore value_eur from priceMap');
  assert.equal(scr.price_eur, 0.5, 'expanded token asset should restore price_eur from priceMap');
  assert.equal(scr.value_eur, 1, 'expanded token asset should restore value_eur from priceMap');
  nearlyEqual(infoTotal[6], 18.3235, 'reconstructed INFO_TOTAL should include restored values');
}

console.log('wallet cache expand prices OK');
