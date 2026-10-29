const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'quota-exempt-portfolio.test.js'),'utf8');const c={require,__dirname,console};vm.runInNewContext(fixture.slice(0,fixture.indexOf('// --- Contract 1:'))+'\nthis.make=makeEnv;',c);
const day=()=>{const d=new Date(Date.now()-9*3600000);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};const key='WCORE_EXEMPT_HTTP_PORTFOLIO_CRYPTO';
test('deux utilisateurs : même ScriptLock requis pour écrire ScriptProperties',()=>{
 const A=c.make(),B=c.make(),store={[key]:JSON.stringify({d:day(),n:95})};let owner=null,entered=false,writesA=0,writesB=0,scriptCalls=0,userCalls=0;
 for(const [name,e] of [['A',A],['B',B]]){
  e.LockService.getUserLock=()=>{userCalls++;return{tryLock:()=>true,releaseLock(){}};};
  e.LockService.getScriptLock=()=>{scriptCalls++;return{tryLock:()=>{if(owner)return false;owner=name;return true;},releaseLock:()=>{assert.equal(owner,name);owner=null;}};};
  e.PropertiesService.getScriptProperties=()=>({getProperty:k=>{const v=store[k];if(name==='A'&&!entered){entered=true;B.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{});}return v||null;},setProperty:(k,v)=>{assert.equal(owner,name,'écriture partagée seulement sous ScriptLock');store[k]=v;if(name==='A')writesA++;else writesB++;}});
  const raw=e._originalUrlFetch;e._originalUrlFetch=(...args)=>{assert.notEqual(owner,name,'aucun transport sous son propre verrou de réservation');return raw(...args);};
 }
 A.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{});
 assert.equal(scriptCalls,2);assert.equal(userCalls,0);assert.equal(writesA,1);assert.equal(writesB,0);assert.equal(JSON.parse(store[key]).n,96);
 // B peut bénéficier d'un secours local sans réservation partagée : pas de plafond global atomique.
});
test('ScriptLock indisponible par un autre travail : secoursStock/Crypto borné sans deadlock',()=>{
 const e=c.make();let requests=0;e.LockService.getScriptLock=()=>({tryLock:()=>{requests++;return false;},releaseLock(){throw Error('not owner');}});
 for(const slot of ['PORTFOLIO_STOCK','PORTFOLIO_CRYPTO']){for(let i=0;i<3;i++)e.ExemptHttp.attempt(slot,'https://invalid',{});}
 assert.equal(e.__sent.filter(x=>x.counter==='transport').length,4);assert.equal(Object.keys(e.__store).length,0);assert.equal(requests,6);
});
