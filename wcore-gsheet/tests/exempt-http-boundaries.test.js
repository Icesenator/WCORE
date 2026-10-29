const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const fixture=fs.readFileSync(path.join(__dirname,'quota-exempt-portfolio.test.js'),'utf8');
const c={require, __dirname, console};vm.runInNewContext(fixture.slice(0,fixture.indexOf('// --- Contract 1:'))+'\nthis.create=makeEnv;',c);
const transports=e=>e.__sent.filter(x=>x.counter==='transport').length;
test('exemption96 par slot, persistance redémarrage et attribution double compteur',()=>{
 const e=c.create();for(let i=0;i<97;i++)e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{});
 assert.equal(transports(e),96);assert.equal(e.__sent.filter(x=>x.counter==='rolling').length,96);
 const f=c.create();Object.assign(f.__store,e.__store);assert.equal(f.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{}),null);
 assert.ok(f.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{}));
});
test('erreur Google et autre : tentative réservée, erreur transmise au breaker et propagée',()=>{
 for(const opt of [{throwQuota:true},{throwOther:true}]){const e=c.create(opt);assert.throws(()=>e.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{}));assert.equal(transports(e),1);assert.equal(e.__handled.length,1);assert.equal(e.ExemptHttp.used('PORTFOLIO_STOCK'),1);}
});
test('persistance indisponible : secours borné localement mais renouvelé après redémarrage',()=>{
 for(let run=0;run<2;run++){const e=c.create();e.PropertiesService.getScriptProperties=()=>{throw Error('storage');};for(let i=0;i<97;i++)e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{});assert.equal(transports(e),2);}
});
test('API exemption refuse un slot non autorisé sans transport',()=>{
 const e=c.create();assert.equal(e.ExemptHttp.attempt('UNAUTHORIZED_TEST_SLOT','https://invalid',{}),null);assert.equal(transports(e),0);
});
test('concurrence : relecture sous verrou interdit double admission sur dernière unité',()=>{
 const a=c.create(),b=c.create();const store={};
 for(const e of [a,b])e.PropertiesService.getScriptProperties=()=>({getProperty:k=>store[k]||null,setProperty:(k,v)=>{store[k]=v;}});
 a.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2);
 b.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2);
 a.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2);
 assert.equal(transports(a)+transports(b),2);
});
test('période09UTC : compteur ancien ne consomme pas le quota du jour courant',()=>{
 const e=c.create();e.__store.WCORE_EXEMPT_HTTP_PORTFOLIO_STOCK=JSON.stringify({d:'2000-1-1',n:96});
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{}));assert.equal(e.ExemptHttp.used('PORTFOLIO_STOCK'),1);
});
test('compteur exemption corrompu : UNKNOWN refuse sans remise à zéro',()=>{
 const e=c.create();e.__store.WCORE_EXEMPT_HTTP_PORTFOLIO_STOCK='{broken';
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{}),null);assert.equal(transports(e),0);
 assert.equal(e.__store.WCORE_EXEMPT_HTTP_PORTFOLIO_STOCK,'{broken');
});
test('compteurs télémétrie indisponibles : secours transport maintenu avec réserve persistée',()=>{
 const e=c.create();e.HttpCounter.record=()=>{throw Error('counter');};e.HttpCallCounter.increment=()=>{throw Error('counter');};
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{}));assert.equal(transports(e),1);assert.equal(e.ExemptHttp.used('PORTFOLIO_STOCK'),1);
});
