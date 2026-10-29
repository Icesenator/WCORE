// Reproduit l'incident historique : sous contention du UserLock, byHost()/byTrigger()
// doivent rester coherents avec count() au lieu de renvoyer silencieusement {} (total 0).
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const quotaSource=fs.readFileSync(path.join(root,'src/03E_QUOTA_CIRCUIT_BREAKER.gs'),'utf8');
const marker='var HttpCounter =';const start=quotaSource.indexOf(marker);const end=quotaSource.indexOf('\n})();',start);
const counterCode=quotaSource.slice(start,end+'\n})();'.length);


function makeShared(){
  const values=new Map();const lock={held:false,available:true,tryLock(){if(!this.available||this.held)return false;this.held=true;return true;},releaseLock(){this.held=false;}};
  const props={getProperty(k){return values.has(k)?values.get(k):null;},setProperty(k,v){assert.equal(lock.held,true,'writes stay locked');values.set(k,String(v));},deleteProperty(k){values.delete(k);},getProperties(){const o={};for(const[k,v]of values)o[k]=v;return o;}};
  return {values,lock,props};
}
function load(shared){
  const ctx={Date,JSON,Math,Object,parseInt,isNaN,CK_get:(n)=>({httpDroppedTelemetry:'CANONICAL_HTTP_DROPPED'}[n]||n),allowUnlockedReads:true,PropertiesService:{getScriptProperties:()=>shared.props},LockService:{getUserLock:()=>shared.lock}};
  vm.createContext(ctx);vm.runInContext(counterCode,ctx);return ctx;
}
function loadLegacy(shared){
  const ctx=load(shared);
  vm.runInContext(fs.readFileSync(path.join(root,'src/26B_HTTP_SAVINGS.gs'),'utf8'),ctx);
  return ctx;
}
const sum=(o)=>Object.values(o||{}).reduce((a,b)=>a+b,0);

{// etat initial : donnees deja persistees par une execution precedente
  const shared=makeShared();
  shared.values.set('WCORE_HTTP_BUCKETS_v1',JSON.stringify({[String(Math.floor(Date.now()/3600000))]:3}));
  shared.values.set('WCORE_HTTP_TRIGGERS_v2',JSON.stringify({[String(Math.floor(Date.now()/3600000))]:{WEB_SCAN:3}}));
  shared.values.set('WCORE_HTTP_HOSTS_v1',JSON.stringify({[String(Math.floor(Date.now()/3600000))]:{'api.example.com':3}}));
  const ctx=load(shared);

  assert.equal(ctx.HttpCounter.count(),3,'count() lit le total persistant');
  assert.equal(sum(ctx.HttpCounter.byTrigger()),3,'hors contention le breakdown trigger est complet');
  assert.equal(sum(ctx.HttpCounter.byHost()),3,'hors contention le breakdown host est complet');

  shared.lock.available=false;// contention : une autre execution tient le UserLock
  const hosts=ctx.HttpCounter.byHost();const triggers=ctx.HttpCounter.byTrigger();
  assert.equal(sum(hosts),3,'byHost() ne doit pas retomber a 0 sous contention');
  assert.equal(sum(triggers),3,'byTrigger() ne doit pas retomber a 0 sous contention');
  const snap=ctx.HttpCounter.snapshot();
  assert.equal(sum(snap.hosts),3,'snapshot().hosts ne doit pas retomber a 0 sous contention');
  assert.equal(sum(snap.categories),3,'snapshot().categories ne doit pas retomber a 0 sous contention');
}
console.log('PASS http-counter-breakdown-contention');{
 const s=makeShared();s.lock.available=false;
 s.values.set('WCORE_HTTP_HOSTS_v1','{bad');
 const c=load(s);const snap=c.HttpCounter.snapshot();
 assert.equal(snap.available,false);assert.equal(snap.corrupt,true);
 assert.equal(snap.consistency,'BEST_EFFORT_UNLOCKED');
 const before=JSON.stringify([...s.values]);c.HttpCounter.byHost();assert.equal(JSON.stringify([...s.values]),before);
}
{
 const s=makeShared();s.lock.available=false;s.props.getProperty=()=>{throw new Error('storage unavailable');};
 const c=load(s);assert.doesNotThrow(()=>c.HttpCounter.byHost());assert.doesNotThrow(()=>c.HttpCounter.byTrigger());
 const snap=c.HttpCounter.snapshot();assert.equal(snap.available,false);
}
