const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'../src',n),'utf8');
const breaker=read('03E_QUOTA_CIRCUIT_BREAKER.gs'), http=read('03_HTTP.gs'), savings=read('26B_HTTP_SAVINGS.gs');
const start=breaker.indexOf('function INSTALL_GLOBAL_QUOTA_BREAKER()');
const install=breaker.slice(start,breaker.indexOf('\n}',start)+2);
const a=savings.indexOf('(function patchHttpCounter()');
const layer=savings.slice(a,savings.indexOf('})();',a)+5);
function method(name){const a=http.indexOf(name+': function(');assert.ok(a>=0,name);let depth=0;const open=http.indexOf('{',a);for(let i=open;i<http.length;i++){if(http[i]==='{')depth++;if(http[i]==='}'){depth--;if(depth===0)return http.slice(a,i+1);}}throw Error('unclosed');}
function load(used,limit=10,realBudget=false){
 const calls=[],records=[],telemetry=[];let count=used;
 const c={Logger:{log(){}},QuotaCircuitBreaker:{isTripped:()=>false,handleError(){}},
  HttpCounter:{record:(_n,_tag,url)=>{records.push(url);count++;},count:()=>count,isCountValid:()=>true,isDegraded:()=>false},
  HttpCallCounter:{increment:url=>telemetry.push(url)},
  BudgetHTTP:{allow:()=>count<limit,remaining:()=>limit-count},
  UrlFetchApp:{fetch:url=>{calls.push(url);return 'ok';},fetchAll:requests=>{calls.push(...requests);return requests.map(()=> 'ok');}}};
 vm.createContext(c);
 if(realBudget){delete c.BudgetHTTP;const begin=breaker.indexOf('var BudgetHTTP =');const end=breaker.indexOf('})();',begin)+5;vm.runInContext(breaker.slice(begin,end),c);}
 vm.runInContext('var Http={'+method('isBlocked')+','+method('canFetchNow')+'};\n'+install,c);
 c.INSTALL_GLOBAL_QUOTA_BREAKER();vm.runInContext(layer,c);
 return {c,calls,records,telemetry,count:()=>count,reinstall:()=>vm.runInContext(layer,c),reverse:()=>{c.UrlFetchApp={fetch:url=>{calls.push(url);return 'ok';},fetchAll:requests=>{calls.push(...requests);return requests.map(()=> 'ok');}};vm.runInContext(layer,c);c.INSTALL_GLOBAL_QUOTA_BREAKER();}};
}
test('couches réelles03E+26B+Http : admission sous plafond puis refus au plafond',()=>{
 const h=load(9);assert.equal(h.c.UrlFetchApp.fetch('https://a.invalid'),'ok');
 assert.equal(h.c.UrlFetchApp.fetch('https://b.invalid'),null);
 assert.equal(h.count(),10);assert.equal(h.calls.length,1);assert.equal(h.records.length,1);assert.equal(h.telemetry.length,1);
});
test('couches réelles : fetchAll refusé au plafond sans compteur fantôme',()=>{
 const h=load(10);const out=h.c.UrlFetchApp.fetchAll([{url:'https://a.invalid'},{url:'https://b.invalid'}]);
 assert.equal(out.length,2);assert.equal(h.calls.length,0);assert.equal(h.records.length,0);assert.equal(h.telemetry.length,0);
});
test('couches réelles : installation26B idempotente, compteur03E et compteur26B séparés',()=>{
 const h=load(0);h.reinstall();h.c.UrlFetchApp.fetch('https://a.invalid');
 assert.equal(h.calls.length,1);assert.equal(h.records.length,1);assert.equal(h.telemetry.length,1);
});
test('lot dépassant le reste refusé sans franchir le plafond',()=>{
 const h=load(9);h.c.UrlFetchApp.fetchAll([{url:'https://a.invalid'},{url:'https://b.invalid'}]);
 assert.equal(h.count(),9);assert.equal(h.calls.length,0);
 // Protection locale du lot, pas une réservation globale concurrente.
});
test('BudgetHTTP réel : seuil other1000, appel admis à19000 puis refus à19001',()=>{
 const h=load(19000,20000,true);
 assert.equal(h.c.UrlFetchApp.fetch('https://a.invalid'),'ok');
 assert.equal(h.c.UrlFetchApp.fetch('https://b.invalid'),null);
 assert.equal(h.calls.length,1);assert.equal(h.count(),19001);
});
test('BudgetHTTP réel : lot1001 refusé à19000 avant tout transport ou comptage',()=>{
 const h=load(19000,20000,true);
 h.c.UrlFetchApp.fetchAll(Array.from({length:1001},()=>({url:'https://a.invalid'})));
 assert.equal(h.calls.length,0);assert.equal(h.count(),19000);
});
test('lot exact au reste admis, compteur par requête sans double comptage',()=>{
 const h=load(8);h.c.UrlFetchApp.fetchAll([{url:'https://a.invalid'},{url:'https://b.invalid'}]);
 assert.equal(h.count(),10);assert.equal(h.calls.length,2);assert.equal(h.records.length,2);assert.equal(h.telemetry.length,2);
});
test('budget indisponible : lot refusé sans transport et sans compteur fantôme',()=>{
 const h=load(0);h.c.BudgetHTTP.remaining=()=>{throw Error('storage');};
 h.c.UrlFetchApp.fetchAll([{url:'https://a.invalid'}]);
 assert.equal(h.calls.length,0);assert.equal(h.records.length,0);assert.equal(h.telemetry.length,0);
});
test('ordre inverse26B puis03E : refus budget sans transport ; comptage03E peut précéder le refus',()=>{
 const h=load(10);
 h.c.UrlFetchApp={fetch:url=>{h.calls.push(url);return 'ok';},fetchAll:req=>{h.calls.push(...req);return req;}};
 h.reinstall();h.c.INSTALL_GLOBAL_QUOTA_BREAKER();
 assert.equal(h.c.UrlFetchApp.fetch('https://a.invalid'),null);
 assert.equal(h.calls.length,0);assert.equal(h.records.length,1);
 // Limite qualifiée : compteur03E incrémenté avant que26B refuse le transport.
});
for(const order of ['normal','reverse']){
 test('refus allow sans transport : '+order,()=>{const h=load(0);if(order==='reverse')h.reverse();h.c.BudgetHTTP.allow=()=>false;
 assert.equal(h.c.UrlFetchApp.fetch('https://a.invalid'),null);assert.equal(h.calls.length,0);});
 test('exception allow doit refuser sans transport : '+order,()=>{const h=load(0);if(order==='reverse')h.reverse();h.c.BudgetHTTP.allow=()=>{throw Error('unattested');};
 assert.equal(h.c.UrlFetchApp.fetch('https://a.invalid'),null);assert.equal(h.calls.length,0);});
 for(const value of [NaN,Infinity,-1,'100',null])test('remaining invalide '+String(value)+' : '+order,()=>{
 const h=load(0);if(order==='reverse')h.reverse();h.c.BudgetHTTP.remaining=()=>value;h.c.UrlFetchApp.fetchAll([{url:'https://a.invalid'}]);assert.equal(h.calls.length,0);});
 for(const kind of ['absent','corrupt','throws','unattested'])test('compteur '+kind+' BudgetHTTP réel : '+order,()=>{
 const h=load(19000,20000,true);if(order==='reverse')h.reverse();
 if(kind==='absent')delete h.c.HttpCounter;
 if(kind==='corrupt')h.c.HttpCounter.count=()=>NaN;
 if(kind==='throws')h.c.HttpCounter.count=()=>{throw Error('storage');};
 if(kind==='unattested')h.c.HttpCounter.isCountValid=()=>false;
 assert.equal(h.c.UrlFetchApp.fetch('https://a.invalid'),null);assert.equal(h.calls.length,0);});
}
