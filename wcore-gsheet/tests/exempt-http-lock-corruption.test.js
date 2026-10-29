const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const fixture=fs.readFileSync(path.join(__dirname,'quota-exempt-portfolio.test.js'),'utf8');
const c={require,__dirname,console};vm.runInNewContext(fixture.slice(0,fixture.indexOf('// --- Contract 1:'))+'\nthis.create=makeEnv;',c);
const create=c.create;
const T=e=>e.__sent.filter(x=>x.counter==='transport').length;
const KEY='WCORE_EXEMPT_HTTP_PORTFOLIO_CRYPTO';
const day=(now=Date.now())=>{const d=new Date(now-9*3600000);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();};
const props=store=>()=>({getProperty:k=>(k in store?store[k]:null),setProperty:(k,v)=>{store[k]=String(v);},deleteProperty:k=>{delete store[k];}});

for(const mode of ['libre','contention','indisponible','exception']){
 test('verrou '+mode+' : une unité restante admise une seule fois',()=>{
  const opts={};const e=create(opts);e.PropertiesService.getScriptProperties=props(e.__store);
  if(mode==='contention')opts.lockContended=true;
  if(mode==='indisponible')opts.lockUnavailable=true;
  if(mode==='exception')e.LockService.getScriptLock=()=>{throw Error('lock');};
  e.__store[KEY]=JSON.stringify({d:day(),n:95});
  assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));
  assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);
  assert.equal(T(e),1);assert.equal(JSON.parse(e.__store[KEY]).n,mode==='libre'?96:95);
 });
}
test('verrou indisponible : mémos distincts restent secours locaux non durables',()=>{
 const shared={};const oa={lockContended:true},ob={lockContended:true};const A=create(oa),B=create(ob);
 A.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2);
 B.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2);
 shared[KEY]=JSON.stringify({d:day(),n:1});
 A.PropertiesService.getScriptProperties=props(shared);B.PropertiesService.getScriptProperties=props(shared);
 A.__sent.length=0;B.__sent.length=0;
 A.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2);
 B.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2);
 assert.equal(T(A)+T(B),2,'deux secours locaux distincts, aucune écriture persistante');
 assert.equal(JSON.parse(shared[KEY]).n,1);
});
test('échec écriture persistance : plafond local conservé dans l’exécution',()=>{
 const store={};const e=create({});
 e.PropertiesService.getScriptProperties=()=>({getProperty:k=>(k in store?store[k]:null),setProperty:()=>{throw Error('write');}});
 for(let i=0;i<5;i++)e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2);
 assert.equal(T(e),2,'une panne d’écriture doit rester bornée par le mémo local');
});
for(const [label,raw] of [
 ['JSON malformé','{broken'],
 ['n négatif',JSON.stringify({d:day(),n:-5})],
 ['n non entier',JSON.stringify({d:day(),n:95.5})],
 ['n en chaîne',JSON.stringify({d:day(),n:'95'})],
 ['jour manquant',JSON.stringify({n:1})],
 ['jour non conforme',JSON.stringify({d:'weird',n:1})],
 ['tableau',JSON.stringify([1,2])],
])test('corruption '+label+' : refus sans transport ni réécriture',()=>{
 const e=create({});e.PropertiesService.getScriptProperties=props(e.__store);e.__store[KEY]=raw;
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);
 assert.equal(e.__store[KEY],raw,'la valeur corrompue ne doit pas être réécrite');
 assert.equal(T(e),0);assert.equal(e.ExemptHttp.used('PORTFOLIO_CRYPTO'),null);
});
test('compteur au-delà du plafond : refus',()=>{
 const e=create({});e.PropertiesService.getScriptProperties=props(e.__store);e.__store[KEY]=JSON.stringify({d:day(),n:97});
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);assert.equal(T(e),0);
});
test('période différente légitime : repart à zéro sans être qualifiée de corruption',()=>{
 const e=create({});e.PropertiesService.getScriptProperties=props(e.__store);e.__store[KEY]=JSON.stringify({d:'2020-1-1',n:96});
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));assert.equal(JSON.parse(e.__store[KEY]).n,1);
});
test('panne de lecture des propriétés : disponibilité de secours conservée par exécution',()=>{
 const opts={lockContended:true};const e=create(opts);e.PropertiesService.getScriptProperties=()=>{throw Error('storage');};
 let ok=0;for(let i=0;i<5;i++)if(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2))ok++;
 assert.equal(ok,2);
});
for(const [label,slot] of [
 ['slot inconnu','UNKNOWN_SLOT'],
 ['slot vide',''],
 ['casse différente','portfolio_stock'],
 ['espace',' PORTFOLIO_STOCK '],
 ['troisième budget','PORTFOLIO_EXTRA'],
])test('frontière slot '+label+' : aucune nouvelle enveloppe de quota',()=>{
 const e=create({});const s=e.__store;
 const before=Object.keys(s).length;
 assert.equal(e.ExemptHttp.attempt(slot,'https://invalid',{}),null);
 assert.equal(T(e),0);assert.equal(Object.keys(s).length,before,'aucune clé de slot parasite ne doit être créée');
});
test('slots historiques autorisés : deux budgets indépendants conservés',()=>{
 const e=create({});assert.ok(e.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{},1));
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},1));
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{},1),null);
});
test('corruption après consommation : pas de restauration implicite à zéro',()=>{
 const e=create({});e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96);
 e.__store[KEY]='{broken';assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);
 assert.equal(T(e),1);assert.equal(e.__store[KEY],'{broken');assert.equal(e.ExemptHttp.used('PORTFOLIO_CRYPTO'),1,'mémo connu non nul distinct du compteur persistant inconnu');
});
test('changement09UTC exact : nouvelle période sans modifier le nom de clé',()=>{
 const e=create({});let now=Date.parse('2026-10-15T08:59:59Z');
 e.Date=class extends Date{static now(){return now;}};
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},1));assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},1),null);
 assert.equal(JSON.parse(e.__store[KEY]).d,'2026-10-14');now+=1000;
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},1));
 assert.equal(JSON.parse(e.__store[KEY]).d,'2026-10-15');assert.equal(JSON.parse(e.__store[KEY]).n,1);
});
test('absence de verrou : secours locaux sans écriture partagée',()=>{
 const A=create({lockContended:true}),B=create({lockContended:true});const store={[KEY]:JSON.stringify({d:day(),n:95})};let nested=false;
 B.PropertiesService.getScriptProperties=props(store);
 A.PropertiesService.getScriptProperties=()=>({getProperty:k=>{const snapshot=store[k];if(!nested){nested=true;B.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96);}return snapshot;},setProperty:(k,v)=>{store[k]=v;}});
 A.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96);
 // WC-07: le premier interleaving ordonné produisait 2 admissions/2 transports ;
 // la relecture autoritaire avant écriture refuse désormais la réservation non exclusive.
 assert.equal(T(A)+T(B),2);assert.equal(JSON.parse(store[KEY]).n,95);
});
test('verrou perdu après première réservation : fallback disponible sans prétention atomique',()=>{
 const opts={};const e=create(opts);e.__store[KEY]=JSON.stringify({d:day(),n:94});
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));opts.lockContended=true;
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);
 assert.equal(T(e),2);assert.equal(JSON.parse(e.__store[KEY]).n,95);
});
test('breaker/mode bloqués : le secours exempté reste disponible, borné et attribué',()=>{
 const e=create({});e.QuotaCircuitBreaker={isTripped:()=>true,handleError:()=>true};
 let consulted=false;e.Http={canFetchNow:()=>{consulted=true;return false;}};
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{},1));
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{},1),null);
 assert.equal(T(e),1);assert.equal(consulted,false,'le secours volontaire ne consulte pas le gate général');
 assert.equal(e.__sent.filter(x=>x.counter==='rolling').length,1);
 assert.equal(e.__sent.filter(x=>x.counter==='legacy').length,1);
});
test('lecture rétablie après secours : ne réadmet pas une enveloppe locale déjà consommée',()=>{
 const e=create({});const store=e.__store;
 e.PropertiesService.getScriptProperties=()=>{throw Error('read unavailable');};
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2));
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2));
 e.PropertiesService.getScriptProperties=props(store);
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2),null);
 assert.equal(T(e),2);
});
test('override du plafond ne peut pas dépasser96 sur un slot autorisé',()=>{
 const e=create({});for(let i=0;i<100;i++)e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},1000);
 assert.equal(T(e),96);assert.equal(JSON.parse(e.__store[KEY]).n,96);
});
test('verrou acquis après écriture échouée : compteur autoritaire saturé ne doit pas être masqué par mémo',()=>{
 const e=create({});const store=e.__store;store[KEY]=JSON.stringify({d:day(),n:94});let failed=true;
 e.PropertiesService.getScriptProperties=()=>({getProperty:k=>store[k]||null,setProperty:(k,v)=>{if(failed)throw Error('write');store[k]=String(v);}});
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));assert.equal(T(e),1);
 failed=false;store[KEY]=JSON.stringify({d:day(),n:96});
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);
 assert.equal(T(e),1);assert.equal(JSON.parse(store[KEY]).n,96);
});
test('secours dégradé production sans override : maximum deux admissions par exécution',()=>{
 const e=create({});e.PropertiesService.getScriptProperties=()=>{throw Error('storage unavailable');};
 for(let i=0;i<4;i++)e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{});
 assert.equal(T(e),2);
});
