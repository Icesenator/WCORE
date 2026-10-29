const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function harness() {
  const props = new Map(), cache = new Map(), calls = [], writes = [];
  let held = false;
  const store = { getProperty: k => props.get(k) || null, setProperty: (k,v) => props.set(k,v), deleteProperty: k => props.delete(k) };
  const ctx = vm.createContext({ PropertiesService: { getScriptProperties: () => store, getUserProperties: () => store, getDocumentProperties: () => store }, CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k,v) => cache.set(k,v) }) }, Logger: { log() {} }, SpreadsheetApp: { openById: () => ({ getSheetByName: () => null }) }, CEX_ACQUIRE_LOCK: key => { assert.equal(key,'KRAKEN'); if (held) return false; held=true; return true; }, CEX_RELEASE_LOCK: key => { assert.equal(key,'KRAKEN'); held=false; }, _cexRelayFetchWithRetry_: fn => fn(), Utilities: { formatDate: () => 'fixture-date' } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/41_KRAKEN_SYNC.gs'), 'utf8'), ctx);
  ctx._krakenGetCreds_ = () => ({});
  ctx._krakenPrivatePost_ = (url, params) => { assert.equal(held, true); assert.deepEqual(Object.keys(params), []); calls.push(url); return { 'AAPLx.T':'3', ZEUR:'20' }; };
  ctx._krakenAssetPairIndex_ = () => ctx._krakenBuildAssetPairIndex_({ fixture: { base:'AAPLx',quote:'ZUSD',wsname:'AAPLx/USD',altname:'AAPLxUSD' } });
  ctx._krakenWriteSheet_ = (ss, name, rows, snapshot) => { writes.push({name,rows,snapshot}); return rows.length; };
  return {ctx,props,calls,writes};
}
for (const sequence of [['UPDATE_KRAKEN_SPOT','UPDATE_KRAKEN_STOCKS_FIAT'],['UPDATE_KRAKEN_STOCKS_FIAT','UPDATE_KRAKEN_SPOT']]) test('cycle partagé un appel privé ' + sequence.join('→'), () => {
  const h = harness();
  for(const name of sequence) h.ctx[name]({triggerUid:'synthetic'});
  assert.deepEqual(h.calls, ['/0/private/Balance']);
  assert.equal(h.writes.length,2);
  const stocks=h.writes.find(x=>x.name==='CEX - Kraken Stocks');
  assert.equal(stocks.snapshot.balance.status,'UNKNOWN');
  assert.equal(stocks.snapshot.orders.status,'UNKNOWN');
});
test('pause lockout et budget insuffisant bloquent avant tout nouveau fetch', () => {
  for (const kind of ['lockout','budget']) {
    const h=harness(); let metadata=0;
    h.ctx._krakenAssetPairIndex_=()=>{ metadata++; return {}; };
    h.props.set(kind==='lockout'?'KRAKEN_LOCKOUT_UNTIL_MS':'KRAKEN_PRIVATE_CALLS_24H',kind==='lockout'?String(Date.now()+60000):Array(220).fill(Date.now()).join(','));
    h.ctx.UPDATE_KRAKEN_SPOT();
    assert.equal(h.calls.length,0);
    assert.equal(metadata,0);
    assert.equal(h.writes.length,0);
  }
});
test('méta AssetPairs indisponible : totaux A:G écrits, projection UNKNOWN, toujours un privé', () => {
  const h=harness(); h.ctx._krakenAssetPairIndex_=()=>{ throw Error('synthetic-meta'); };
  h.ctx.UPDATE_KRAKEN_SPOT();
  assert.deepEqual(h.calls,['/0/private/Balance']);
  assert.equal(h.writes.length,2);
  assert.equal(h.writes.find(x=>x.name==='CEX - Kraken Stocks').snapshot.orders.status,'UNKNOWN');
});
test('race : second job pendant le lock partagé reste BUSY sans appel', () => {
  const h=harness(); const write=h.ctx._krakenWriteSheet_;
  h.ctx._krakenWriteSheet_=(...a)=>{ assert.equal(h.ctx.UPDATE_KRAKEN_STOCKS_FIAT(),'BUSY'); return write(...a); };
  h.ctx.UPDATE_KRAKEN_SPOT();
  assert.equal(h.calls.length,1);
});
test('nonce partagé croît strictement dans les deux ordres et échoue si persistance impossible', () => {
  const h=harness(); const a=Number(h.ctx._krakenNextNonce_()),b=Number(h.ctx._krakenNextNonce_());
  assert.ok(b>a);
  h.ctx.PropertiesService.getScriptProperties=()=>({getProperty:()=>null,setProperty:()=>{throw Error('storage');}});
  assert.throws(()=>h.ctx._krakenNextNonce_(),/storage/);
});
