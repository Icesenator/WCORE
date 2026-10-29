'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/41_KRAKEN_SYNC.gs'), 'utf8');
const cex = fs.readFileSync(path.join(__dirname, '../src/35_BITPANDA_SYNC.gs'), 'utf8');
function harness(failure, initial = {}) {
  const props = new Map(Object.entries(initial)), calls = [], writes = [];
  const data = [['existing', 7]], store = { getProperty: k => props.get(k) ?? null, setProperty: (k,v) => props.set(k,String(v)), deleteProperty: k => props.delete(k) };
  const sheet = { getMaxColumns: () => 17, getLastRow: () => 3, getRange: (r,c,n,m) => ({ setValues: v => writes.push({r,c,n,m,v}), clearContent: () => { writes.push({r,c,clear:true}); if(c <= 7) data.length=0; } }) };
  const ctx = { Logger: { log() {} }, PropertiesService: { getScriptProperties: () => store }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) }, Utilities: { getUuid: () => 'fixture', sleep() {}, formatDate: () => 'stamp' }, SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet }) }, HttpCallCounter: { setTrigger() {}, clearTrigger() {} }, UrlFetchApp: { fetch(url) {
    calls.push(url);
    if (failure === 'transport') throw Error('private-response-not-for-logs');
    return { getResponseCode: () => 200, getContentText: () => failure === 'json' ? 'invalid-json' : JSON.stringify({ error: failure === 'auth' ? ['EAPI:Invalid key'] : [], result: { XXBT:'2', ZEUR:'10', 'AAPLx.T':'3' } }) };
  } } };
  vm.createContext(ctx);
  vm.runInContext(cex.slice(cex.indexOf('var _CEX_LOCK_TTL_MS'), cex.indexOf('function CEX_RELEASE_LOCK')) + cex.slice(cex.indexOf('function CEX_RELEASE_LOCK'), cex.indexOf('\nfunction ', cex.indexOf('function CEX_RELEASE_LOCK') + 10)) + cex.slice(cex.indexOf('var CEX_RELAY_MAX_RETRIES')), ctx);
  vm.runInContext(source, ctx);
  ctx._krakenGetCreds_ = () => ({ key:'fixture', secret:'fixture' }); ctx._krakenSign_ = () => 'fixture';
  ctx._krakenFetchXStockPricesUsd_ = () => ({});
  ctx._cexComputeAndAppendTotal_ = (ss,name,rows) => { data.splice(0,data.length,...rows); };
  return {ctx,props,calls,writes,data,store,sheet};
}
for (const sequence of [['UPDATE_KRAKEN_SPOT','UPDATE_KRAKEN_STOCKS_FIAT'], ['UPDATE_KRAKEN_STOCKS_FIAT','UPDATE_KRAKEN_SPOT']]) test('recovery réel : un privé et buckets partagés ' + sequence.join('→'), () => {
  const h=harness(); const captured=[]; const write=h.ctx._krakenWriteSheet_;
  h.ctx._krakenWriteSheet_=(...args)=>{ captured.push(args); return write(...args); };
  for(const handler of sequence) assert.equal(JSON.parse(h.ctx[handler]({triggerUid:'fixture'})).ok,true);
  assert.deepEqual(h.calls,['https://api.kraken.com/0/private/Balance']);
  assert.equal(captured.length,2);
  assert.equal(JSON.stringify(captured.find(x=>x[1]==='CEX - Kraken Crypto')[2]),'[["BTC",2]]');
  const stocks=captured.find(x=>x[1]==='CEX - Kraken Stocks');
  assert.equal(JSON.stringify(stocks[2]),'[["EUR",10],["AAPLx",3]]');
  assert.equal(stocks[3].balance.status,'UNKNOWN'); assert.equal(stocks[3].orders.status,'UNKNOWN');
  assert.equal(h.props.get('KRAKEN_PRIVATE_CALLS_24H').split(',').length,1);
  assert.ok(h.writes.some(w=>w.c===9 && w.v[0][0]==='UNKNOWN'));
  assert.ok(h.writes.every(w=>!(w.c===8 && w.v)), 'aucun hold zéro connu');
});
for(const handler of ['UPDATE_KRAKEN_SPOT','UPDATE_KRAKEN_STOCKS_FIAT']) for(const failure of ['auth','transport','json']) test('recovery panne sans rejeu, soldes préservés et I1 UNKNOWN : '+handler+'/'+failure,()=>{
  const h=harness(failure);
  assert.equal(JSON.parse(h.ctx[handler]()).ok,false);
  assert.deepEqual(h.calls,['https://api.kraken.com/0/private/Balance']);
  assert.deepEqual(h.data,[['existing',7]]);
  assert.ok(h.writes.some(w=>w.r===1 && w.c===9 && w.v[0][0]==='UNKNOWN'));
  assert.ok(h.writes.every(w=>w.c>7 && !w.clear),'aucun clear ni écriture A:G');
});
for(const kind of ['nonce-write','nonce-corrupt','counter-write','counter-read','counter-corrupt']) test('recovery '+kind+' refuse avant fetch via vrai wrapper',()=>{
  const h=harness();
  if(kind.endsWith('write')) { const original=h.store.setProperty; h.store.setProperty=(k,v)=>{ if(k===(kind==='nonce-write'?'KRAKEN_LAST_NONCE':'KRAKEN_PRIVATE_CALLS_24H')) throw Error('storage'); return original(k,v); }; }
  if(kind==='counter-read') { const original=h.store.getProperty; h.store.getProperty=k=>{ if(k==='KRAKEN_PRIVATE_CALLS_24H') throw Error('storage'); return original(k); }; }
  if(kind.endsWith('corrupt')) h.props.set(kind==='nonce-corrupt'?'KRAKEN_LAST_NONCE':'KRAKEN_PRIVATE_CALLS_24H','broken');
  assert.equal(JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT()).ok,false); assert.equal(h.calls.length,0);
  assert.deepEqual(h.data,[['existing',7]]);
});
test('recovery admission used+1 : dernier appel permis, suivant refusé',()=>{
  const h=harness(undefined,{ KRAKEN_PRIVATE_CALLS_24H:Array(219).fill(Date.now()).join(',') });
  assert.equal(JSON.parse(h.ctx.UPDATE_KRAKEN_SPOT()).ok,true); assert.equal(h.calls.length,1);
  assert.equal(JSON.parse(h.ctx.UPDATE_KRAKEN_STOCKS_FIAT()).ok,false); assert.equal(h.calls.length,1);
});
test('recovery télémétrie statique 1 appel/cycle, 24/jour, budget 220',()=>{
  const h=harness(), st=JSON.parse(h.ctx.KRAKEN_BUDGET_STATUS());
  assert.equal(st.version,'4.16.45'); assert.equal(st.projected_calls_per_day,24); assert.equal(st.private_budget_max,220); assert.match(st.cadence,/1 appel.*Balance/); assert.equal(h.calls.length,0);
});
