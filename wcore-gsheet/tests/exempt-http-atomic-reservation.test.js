const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixture=fs.readFileSync(path.join(__dirname,'quota-exempt-portfolio.test.js'),'utf8');
const loader={require,__dirname,console};vm.runInNewContext(fixture.slice(0,fixture.indexOf('// --- Contract 1:'))+'\nthis.create=makeEnv;',loader);
const create=loader.create;
const KEY='WCORE_EXEMPT_HTTP_PORTFOLIO_CRYPTO',KEY2='WCORE_EXEMPT_HTTP_PORTFOLIO_STOCK';
const d=new Date(Date.now()-9*3600000);const id=d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();
const count=(e,kind)=>e.__sent.filter(x=>x.counter===kind).length;
const metrics=e=>({PHYSICAL_TRANSPORTS:count(e,'transport'),HTTP_03E:count(e,'rolling'),HTTP_26B:count(e,'legacy')});
function tracked(store,w){return{getProperty:k=>(k in store?store[k]:null),setProperty:(k,v)=>{store[k]=String(v);w.writes++;},deleteProperty:k=>{delete store[k];}};}
function snapshot(store,key){let first=true;const snap=store[key];return{getProperty:k=>{if(k===key&&first){first=false;return snap;}return (k in store?store[k]:null);},setProperty:(k,v)=>{store[k]=String(v);},deleteProperty:k=>{delete store[k];}};}

test('verrou réellement acquis : une unité restante admise une seule fois',()=>{
 const e=create({});const w={writes:0};e.PropertiesService.getScriptProperties=()=>tracked(e.__store,w);
 e.__store[KEY]=JSON.stringify({d:id,n:95});
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);
 assert.equal(w.writes,1);assert.deepEqual(metrics(e),{PHYSICAL_TRANSPORTS:1,HTTP_03E:1,HTTP_26B:1});
 assert.equal(JSON.parse(e.__store[KEY]).n,96);
});
test('interleaving sans verrou : secours locaux séparés et aucune réservation persistée',()=>{
 const A=create({lockContended:true}),B=create({lockContended:true});const store={[KEY]:JSON.stringify({d:id,n:95})};
 const aProps=snapshot(store,KEY),bProps=snapshot(store,KEY);
 A.PropertiesService.getScriptProperties=()=>aProps;
 B.PropertiesService.getScriptProperties=()=>bProps;
 const admitted=[A.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),B.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96)].filter(Boolean).length;
 assert.equal(admitted,2,'secours locaux distincts, aucune réservation durable lockless');
 assert.equal(metrics(A).PHYSICAL_TRANSPORTS+metrics(B).PHYSICAL_TRANSPORTS,2);
 assert.equal(JSON.parse(store[KEY]).n,95);
});
test('réserve puis réserve depuis94 : plafond96 respecté sur deux exécutions',()=>{
 const A=create({}),B=create({});const store={[KEY]:JSON.stringify({d:id,n:94})};
 A.PropertiesService.getScriptProperties=()=>tracked(store,{writes:0});
 B.PropertiesService.getScriptProperties=()=>tracked(store,{writes:0});
 assert.ok(A.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));
 assert.ok(B.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));
 assert.equal(A.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);
 assert.equal(JSON.parse(store[KEY]).n,96);
});
test('deux slots distincts restent indépendants',()=>{
 const e=create({});e.__store[KEY]=JSON.stringify({d:id,n:95});e.__store[KEY2]=JSON.stringify({d:id,n:95});
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{},96));
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{},96),null);
 assert.equal(JSON.parse(e.__store[KEY]).n,96);assert.equal(JSON.parse(e.__store[KEY2]).n,96);
});
test('compteur96 et override1000 : refus, zéro transport',()=>{
 const e=create({});e.__store[KEY]=JSON.stringify({d:id,n:96});
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},1000),null);
 assert.deepEqual(metrics(e),{PHYSICAL_TRANSPORTS:0,HTTP_03E:0,HTTP_26B:0});
});
test('verrou indisponible : dégradé borné au mémo d’exécution, non durable',()=>{
 const e=create({lockUnavailable:true});e.__store[KEY]=JSON.stringify({d:id,n:95});
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);
 assert.equal(metrics(e).PHYSICAL_TRANSPORTS,1);
});
test('exception de lecture : secours mémo, aucune prétention journalière',()=>{
 const e=create({});e.PropertiesService.getScriptProperties=()=>{throw Error('storage down');};
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},1));
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},1),null);
 assert.equal(metrics(e).PHYSICAL_TRANSPORTS,1);
});
test('exception d’écriture : réservation locale comptée, persistance non attestée',()=>{
 const e=create({});e.__store[KEY]=JSON.stringify({d:id,n:0});
 e.PropertiesService.getScriptProperties=()=>({getProperty:k=>(k in e.__store?e.__store[k]:null),setProperty:()=>{throw Error('write');},deleteProperty:()=>{}});
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2));
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2));
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2),null);
 assert.equal(metrics(e).PHYSICAL_TRANSPORTS,2);assert.equal(JSON.parse(e.__store[KEY]).n,0);
});
test('corruption : refus fail-closed sans réécriture du compteur',()=>{
 const e=create({});e.__store[KEY]='{broken';
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),null);
 assert.equal(e.__store[KEY],'{broken');assert.equal(metrics(e).PHYSICAL_TRANSPORTS,0);
});
test('réservation persistée puis transport échoué : la tentative reste comptée',()=>{
 const e=create({throwOther:true});e.__store[KEY]=JSON.stringify({d:id,n:10});
 assert.throws(()=>e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));
 assert.equal(JSON.parse(e.__store[KEY]).n,11);assert.equal(metrics(e).PHYSICAL_TRANSPORTS,1);
});
test('franchissement 09:00 UTC sans changer le nom de clé',()=>{
 const e=create({});e.__store[KEY]=JSON.stringify({d:'2026-10-14',n:96});
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96));
 assert.equal(JSON.parse(e.__store[KEY]).d,id);assert.equal(JSON.parse(e.__store[KEY]).n,1);
});
test('stockage rétabli après deux secours : pas de réouverture d’enveloppe',()=>{
 const e=create({});const store={};let down=true;
 e.PropertiesService.getScriptProperties=()=>{if(down)throw Error('down');return{getProperty:k=>(k in store?store[k]:null),setProperty:(k,v)=>{store[k]=String(v);},deleteProperty:k=>{delete store[k];}};};
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2));
 assert.ok(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2));
 down=false;
 assert.equal(e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},2),null);
 assert.equal(metrics(e).PHYSICAL_TRANSPORTS,2);
});
test('erreur Google quota : breaker notifié et erreur propagée, réservation comptée',()=>{
 const e=create({throwQuota:true});e.__store[KEY]=JSON.stringify({d:id,n:5});
 assert.throws(()=>e.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),/urlfetch/);
 assert.equal(JSON.parse(e.__store[KEY]).n,6);assert.equal(e.__handled.length,1);
});
test('appelants Stock/Crypto : aucun verrou tenu autour du transport exempté',()=>{
 for(const file of ['42_STOCK_PORTFOLIO.gs','43_CRYPTO_PORTFOLIO.gs']){
  const src=fs.readFileSync(path.join(__dirname,'..','src',file),'utf8');
  const at=src.indexOf('ExemptHttp.attempt');
  assert.ok(at>0,file);
  const window=src.slice(Math.max(0,at-1200),at);
  assert.doesNotMatch(window,/LockService|tryLock/,'pas de verrou indéjà tenu vers '+file);
 }
});
function frozenFor(store,key,reads){let n=0;const snap=store[key];return{getProperty:k=>{if(k===key&&n<reads){n++;return snap;}return (k in store?store[k]:null);},setProperty:(k,v)=>{store[k]=String(v);},deleteProperty:k=>{delete store[k];}};}
test('fenêtre résiduelle : deux relectures avant toute écriture restent non prouvées',()=>{
 const A=create({lockContended:true}),B=create({lockContended:true});const store={[KEY]:JSON.stringify({d:id,n:95})};
 const ap=frozenFor(store,KEY,2),bp=frozenFor(store,KEY,2);
 A.PropertiesService.getScriptProperties=()=>ap;B.PropertiesService.getScriptProperties=()=>bp;
 const admitted=[A.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96),B.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96)].filter(Boolean).length;
 assert.equal(admitted,2,'résidu : sans verrou ni primitive atomique, la simultanéité reste possible');
 assert.equal(JSON.parse(store[KEY]).n,95,'aucune réservation partagée sans verrou');
 assert.equal(metrics(A).PHYSICAL_TRANSPORTS+metrics(B).PHYSICAL_TRANSPORTS,2);
});
test('écrivain sans verrou pendant détenteur : deux transports restent possibles',()=>{
 const A=create({}),B=create({lockContended:true});const store={[KEY]:JSON.stringify({d:id,n:95})};
 let held=false,nested=false,writes=0,wroteWithoutOwnership=false;
 A.LockService.getScriptLock=()=>({tryLock:()=>{held=true;return true;},releaseLock:()=>{held=false;}});
 B.PropertiesService.getScriptProperties=()=>({getProperty:k=>store[k]||null,setProperty:(k,v)=>{wroteWithoutOwnership=held;store[k]=v;writes++;}});
 A.PropertiesService.getScriptProperties=()=>({getProperty:k=>{const snapshot=store[k];if(!nested){nested=true;B.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96);}return snapshot;},setProperty:(k,v)=>{store[k]=v;writes++;}});
 const original=A._originalUrlFetch;A._originalUrlFetch=(...args)=>{assert.equal(held,false,'transport après release');return original(...args);};
 A.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{},96);
 assert.equal(wroteWithoutOwnership,false);assert.equal(writes,1);assert.equal(JSON.parse(store[KEY]).n,96);
 assert.equal(metrics(A).PHYSICAL_TRANSPORTS+metrics(B).PHYSICAL_TRANSPORTS,2);
});
