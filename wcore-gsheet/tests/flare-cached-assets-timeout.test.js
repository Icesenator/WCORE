const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = path.join(__dirname, '../src');
const NOW = 1800000000000;
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
function fixture() {
  return {assets:[{contract:'native',symbol:'FLR',name:'Flare',balance:7}],
    priceMap:{'native@flare':0.02},priceTsMap:{'native@flare':NOW-1000},
    balanceTsMap:{native:NOW-2000},usd_to_eur_rate:0.9,last_cache_update_ms:NOW-2000};
}
function harness(options = {}) {
  const phases = [];
  let clock = NOW;
  const persisted = options.cache === undefined ? fixture() : options.cache;
  const l1 = new Map();
  const props = new Map();
  function record(phase, ms = 0) { phases.push({phase,atMs:clock-NOW}); clock += ms; }
  const c = {
    console, Logger:{log(){}}, PriceManager:{}, WCORE_STABLECOINS:{},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:k=>{record('property.read');return props.get(k)||null;},
      getProperties:()=>{record('property.enumerate',options.maintenanceMs||0);return Object.fromEntries(props);},
      setProperty:(k,v)=>{record('property.write');props.set(k,v);},
      deleteProperty:k=>{record('property.delete');props.delete(k);}
    })},
    CacheService:{getScriptCache:()=>({get:k=>l1.get(k)||null,put:(k,v)=>l1.set(k,v)})},
    Session:{getScriptTimeZone:()=> 'UTC'},Utilities:{formatDate:d=>d.toISOString()},
    CacheManager:{init(){record('cache.init',options.initMs||0);}},
    RpcClient:{call(){record('rpc.call');throw new Error('unexpected RPC');}}, 
    WalletCache:{load(){record('wallet.load',options.loadMs||0);return clone(persisted);},
      save(){record('wallet.save');},getLastUpdateStr:()=> 'fixture-cache-time'},
    MetaCache:{load:()=>({})},GlobalPriceCache:{load:()=>({})},
    AssetManager:{normalizeMetadata(){}},WalletNames:{get:(_a,name)=>name},
    BaseEngine:{isSystemBlocked:()=>!!options.blocked},
    _webScanCacheTimestamp_:cache=>cache.last_cache_update_ms||0,
    HTTP:{getJson(url,opts){
      record('http.'+(url.includes('llama')?'llama':url.includes('gecko')?'gecko':'dex'),options.httpMs||0);
      if(options.httpError) throw new Error(options.httpError);
      return options.httpResult || {};
    }},
    LockService:{getScriptLock(){record('lock.request');throw new Error('lock unavailable');}}
  };
  if (options.realPacked) { c.WalletCache={};c.MetaCache={};c.GlobalPriceCache={};c.CacheManager={}; }
  vm.createContext(c);
  c.fixtureNow = ()=>clock;
  vm.runInContext('Date.now = fixtureNow;',c);
  for (const file of ['02_UTILS.gs',...(options.realPacked ? ['04A_CACHE_CORE.gs','04B_CACHE_WALLET.gs','04C_CACHE_GLOBAL.gs'] : []),'04E_FX_METADATA.gs','07_PRICES.gs','10_OUTPUT.gs','11_EVM_ENGINE.gs','19_CHAIN_FACTORY.gs','24_DEGRADED_MODE.gs','FLARE.gs']) {
    vm.runInContext(fs.readFileSync(path.join(SRC,file),'utf8'),c,{filename:file});
  }
  c.DegradedMode.isCircuitBreakerActive = ()=>false;
  if (options.realPacked) {
    // Clear mocks before evaluating the real WalletCache adapter.
    const cfg=c._FLARE.getConfig();
    const key=c.CacheManager.walletKey('fixture-wallet',cfg);
    const compact={v:5,u:NOW-2000,a:[['n',7,'FLR','Flare',18]],pm:{'native@flare':0.02},pt:{'native@flare':NOW-1000},bt:{native:NOW-2000},fx:0.9};
    props.set(c.GLOBAL_CACHE_KEYS.GLOBAL_WALLET,JSON.stringify({m:{[c.CacheManager._hashKey_(key)]:{k:key,ts:Math.floor(NOW/1000),s:JSON.stringify(compact)}}}));
  }
  const run = ()=>c.CACHED_WALLET_ASSETS_FLARE('fixture-wallet', 'fixture-refresh');
  return {c,run,phases,elapsed:()=>clock-NOW,persisted};
}
const native = out=>out.find(r=>r[3]==='native');
const total = out=>out.find(r=>r[1]==='INFO_TOTAL');
const errors = out=>out.filter(r=>r[1]==='ERROR');

test('FLARE cached : aucun HTTP malgré un prix natif et un FX présents',()=>{
  const h=harness();const out=h.run();
  assert.equal(errors(out).length,0,JSON.stringify(out));
  assert.equal(native(out)[4],7);assert.equal(native(out)[5],0.02);
  assert.equal(h.phases.filter(p=>p.phase.startsWith('http.')).length,0,JSON.stringify(h.phases));
});
for (const incident of ['timeout','429','503','incomplete']) {
  test(`FLARE cached : ${incident}, aucun retry réseau ni attente`,()=>{
    const h=harness({httpError:incident==='incomplete'?null:incident,httpMs:8000});
    const out=h.run();
    assert.equal(h.elapsed(),0,JSON.stringify(h.phases));
    assert.equal(native(out)[4],7);assert.equal(native(out)[5],0.02);
    assert.equal(total(out)[6],0.14);
    assert.equal(h.phases.some(p=>p.phase.startsWith('http.')),false);
  });
}
test('FLARE cached : aucune écriture, énumération globale, purge ou acquisition de lock',()=>{
  const h=harness({maintenanceMs:18000});h.run();
  assert.deepEqual(h.phases.filter(p=>/write|delete|enumerate|save|lock/.test(p.phase)),[]);
});
for (const priceState of ['absent','stale','timestamp-missing','timestamp-future','corrupt']) {
  test(`prix natif ${priceState} : solde conservé, prix/total inconnus sans zéro fabriqué`,()=>{
    const cache=fixture();
    if(priceState==='absent')cache.priceMap={};
    if(priceState==='stale')cache.priceTsMap['native@flare']=NOW-86400000;
    if(priceState==='timestamp-missing')cache.priceTsMap={};
    if(priceState==='timestamp-future')cache.priceTsMap['native@flare']=NOW+1;
    if(priceState==='corrupt')cache.priceMap['native@flare']='broken';
    const h=harness({cache});const out=h.run();
    assert.equal(native(out)[4],7);assert.equal(native(out)[5],'');assert.equal(native(out)[6],'');
    assert.equal(total(out)[6],'');assert.ok(errors(out).length);
    assert.equal(h.phases.some(p=>p.phase.startsWith('http.')),false);
  });
}
for(const cache of [null,{assets:[]},{assets:'corrupt'},{assets:[{contract:'native',balance:null}]},{assets:[{contract:'native',balance:'bad'}]}]) {
  test(`cache absent/incomplet : aucune ligne native zéro factice (${JSON.stringify(cache)})`,()=>{
    const out=harness({cache}).run();
    assert.ok(errors(out).length);assert.equal(native(out),undefined);
    assert.equal(total(out),undefined);
  });
}
test('circuit breaker actif et cache absent : conserver UNKNOWN, pas zéro natif',()=>{
  const h=harness({cache:null});h.c.DegradedMode.isCircuitBreakerActive=()=>true;
  const out=h.run();assert.ok(errors(out).length);assert.equal(native(out),undefined);
});
test('snapshot rendu sans collecte attestée : refusé si source wallet absente',()=>{
  const h=harness({cache:null});let reads=0;
  h.c.OutputSnapshotCache.load=()=>{reads++;return [['header'],['fixture','FLR','Flare','native',9,1,9]];};
  const out=h.run();assert.equal(reads,0);assert.ok(errors(out).length);assert.equal(native(out),undefined);
});
test('zéro natif explicite valide : conservé, pas confondu avec cache absent',()=>{
  const cache=fixture();cache.assets[0].balance=0;
  const out=harness({cache}).run();assert.equal(native(out)[4],0);assert.equal(errors(out).length,0);
});
test('budget HTTP bloqué : mêmes données attestées, aucun appel réseau',()=>{
  const h=harness({blocked:true});const out=h.run();
  assert.equal(native(out)[5],0.02);assert.equal(h.phases.some(p=>p.phase.startsWith('http.')),false);
});
test('prix natif générique attesté : fallback local sans besoin du FX',()=>{
  const cache=fixture();cache.priceMap={native:0.03};cache.priceTsMap={native:NOW-1000};cache.usd_to_eur_rate=null;
  const out=harness({cache}).run();assert.equal(native(out)[5],0.03);assert.equal(total(out)[6],0.21);
});
test('CacheManager.init lent : durée observée sans promettre interruption syscall GAS',()=>{
  const h=harness({initMs:31000});const out=h.run();
  assert.equal(h.elapsed(),31000);assert.equal(native(out)[4],7);
  assert.equal(h.phases.filter(p=>/http|rpc|lock/.test(p.phase)).length,0);
});
test('cache packed réel : lecture sans lock, HTTP, purge ni énumération globale',()=>{
  const h=harness({realPacked:true,maintenanceMs:18000});
  const out=h.run();
  assert.equal(native(out)[4],7);assert.equal(native(out)[5],0.02);assert.equal(total(out)[6],0.14);
  assert.equal(h.elapsed(),0,JSON.stringify(h.phases));
  assert.deepEqual(h.phases.filter(p=>/http|write|delete|enumerate|save|lock/.test(p.phase)),[]);
});
test('cache wallet ancien : données conservées avec date absolue et ERROR',()=>{
  const cache=fixture();cache.last_cache_update_ms=NOW-8*3600000;
  const out=harness({cache}).run();assert.equal(native(out)[4],7);
  assert.ok(errors(out).some(r=>r[2].includes('DONNEES FIGEES')));
});

module.exports = {harness,fixture};
