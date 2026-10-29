const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=fs.readFileSync(path.join(__dirname,'webscan-http-admission.test.js'),'utf8').replace(/\r\n/g,'\n');
const f={require,__dirname,console};vm.runInNewContext(base.slice(0,base.indexOf('// 1) Bornes'))+'\nthis.make=harness;this.response=response;',f);
const breaker=fs.readFileSync(path.join(__dirname,'../src/03E_QUOTA_CIRCUIT_BREAKER.gs'),'utf8');
const a3e=breaker.indexOf('var BudgetHTTP ='),b3e=breaker.indexOf('})();',a3e);
const FLOOR_KEY=(breaker.match(/TRIP_FLOOR_KEY = "([^"]+)"/)||[])[1];
assert.ok(FLOOR_KEY,'clé plancher introuvable');
function storeApi(store){return {getProperty:k=>Object.prototype.hasOwnProperty.call(store,k)?store[k]:null,setProperty:(k,v)=>{store[k]=String(v);},deleteProperty:k=>{delete store[k];}};}
function budgetInstance(store,clock){const c={console,JSON,Math,Number,Object,parseInt,isFinite,Date:class extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}},Logger:{log(){}},HttpCounter:{count:()=>0,noteDropped:()=>{}},CacheService:{getScriptCache:()=>null},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},PropertiesService:{getScriptProperties:()=>storeApi(store)}};vm.createContext(c);vm.runInContext(breaker.slice(a3e,b3e+5),c);return c;}
function scenario(opts){
 const clock={now:1800000000000};
 const h=f.make(undefined,opts||{});
 const store=h.props;
 h.c.PropertiesService={getScriptProperties:()=>storeApi(store)};
 h.c.Date=class extends Date{constructor(...args){super(...(args.length?args:[clock.now]));}static now(){return clock.now;}};
 h.c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
 const budgetA=budgetInstance(store,clock),budgetB=budgetInstance(store,clock);
 // Budget délibérément permissif (stub du banc) : seul le PLANCHER est réel,
 // afin de prouver que tout refus observé est causé par le plancher.
 const stub=h.c.BudgetHTTP;
 h.c.BudgetHTTP={allow:stub.allow,isPostTripFloorActive:()=>budgetA.BudgetHTTP.isPostTripFloorActive(),noteAuthoritativeTrip:t=>budgetA.BudgetHTTP.noteAuthoritativeTrip(t),clearPostTripFloor:()=>budgetA.BudgetHTTP.clearPostTripFloor(),status:()=>budgetA.BudgetHTTP.status()};
 // Conversion neutralisée : le sujet est la frontière d'admission, pas le mapping payload.
 h.c._webScanConvertToWalletCache_=()=>({assets:[{symbol:'SYNTHETIC',balance:1}],updatedAt:clock.now});
 return {store,clock,A:h,B:budgetB.BudgetHTTP,budgetA};
}
test('RED/PROBE : false mémorisé puis armement par une autre exécution doit refuser la nouvelle admission',()=>{
 const {store,clock,A,B}=scenario();
 const first=A.wallet();assert.equal(first.deferred,false,'admission initiale : plancher absent ('+first.deferredReason+')');assert.equal(A.count.transport,1,'aucun autre gate ne bloque au départ');
 B.noteAuthoritativeTrip(clock.now);
 assert.ok(Number(store[FLOOR_KEY])>clock.now,'plancher armé dans le stockage partagé');
 const second=A.wallet();
 assert.equal(second.deferred,true,'la nouvelle admission doit être refusée par le plancher');
 assert.equal(second.deferredReason,'POST_TRIP_FLOOR','refus causé par le plancher, pas un autre gate');
 assert.equal(A.count.transport,1,'aucun transport supplémentaire après refus');
});
test('limite : plancher expiré puis nouvelle admission autorisée',()=>{
 const {store,clock,A,B}=scenario();
 B.noteAuthoritativeTrip(clock.now);
 assert.equal(A.wallet().deferred,true);
 clock.now+=3*60*60*1000+1;
 assert.equal(A.wallet().deferred,false,'plancher expiré : reprise');
});
test('limite : clear opérateur puis lecture actualisée',()=>{
 const {store,clock,A,B}=scenario();
 B.noteAuthoritativeTrip(clock.now);
 assert.equal(A.wallet().deferred,true);
 assert.equal(B.clearPostTripFloor(),true);
 assert.equal(A.wallet().deferred,false,'clear opérateur effectif');
});
test('limite : lecture impossible ne doit jamais devenir floor=false autorisant un transport',()=>{
 const {store,clock,A,budgetA}=scenario();
 A.wallet();
 // Panne ciblée : seule la lecture du plancher échoue, le reste continue de fonctionner.
 budgetA.PropertiesService={getScriptProperties:()=>({getProperty:k=>{if(k===FLOOR_KEY)throw Error('properties unavailable');return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null;},setProperty(){},deleteProperty(){}})};
 assert.equal(A.wallet().deferred,true,'lecture impossible : refus sûr');
});
test('limite : absence vérifiée du plancher reste autorisée',()=>{
 const {store,clock,A}=scenario();
 delete store[FLOOR_KEY];
 assert.equal(A.wallet().deferred,false,'aucun plancher : admission normale');
});
test('limite : propriété corrompue ne doit jamais autoriser un transport',()=>{
 const {store,clock,A}=scenario();
 store[FLOOR_KEY]='not-a-number';
 assert.equal(A.wallet().deferred,true,'valeur corrompue : refus sûr');
});
test('diagnostic : un plancher illisible est signalé unknown, jamais présenté comme absent',()=>{
 const {store,clock,A,budgetA}=scenario();
 budgetA.PropertiesService={getScriptProperties:()=>({getProperty:k=>{if(k===FLOOR_KEY)throw Error('unavailable');return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null;},setProperty(){},deleteProperty(){}})};
 const status=JSON.parse(JSON.stringify(budgetA.BudgetHTTP.status()));
 assert.equal(status.tripFloorUnknown,true);assert.equal(status.tripFloorActive,false,undefined);
 assert.equal(A.wallet().deferred,true,'admission refusée malgré diagnostic inactif');
});
test('budgets et modes inchangés sous plancher actif et sous plancher illisible',()=>{
 const {store,clock,A,B,budgetA}=scenario();
 B.noteAuthoritativeTrip(clock.now);
 assert.equal(budgetA.BudgetHTTP.remaining(),20000,'le plancher ne rogne pas le budget global');
 // Le chemin portefeuille admis sous plancher est couvert par http-counter-atomicity.test.js
 // (allow('26B.fetch')===true), qui dispose des compteurs réels absents de ce banc.
 assert.equal(A.wallet().deferred,true,'seule l’admission AUTO est retenue');
});
test('limite résiduelle : un trip armé pendant le HTTP est vu à la frontière SUIVANTE, pas dans l’appel déjà admis',()=>{
 let fetches=0;
 const {store,clock,A,B}=scenario();
 A.c._httpTelemetryTransport_=()=>({explicitTelemetry:true,fetch:()=>{fetches++;B.noteAuthoritativeTrip(clock.now);return {getResponseCode:()=>200,getContentText:()=>'{}'};}});
 const admitted=A.wallet();
 assert.equal(admitted.deferred,false,'l’appel déjà admis ne peut pas être interrompu par un trip postérieur');
 assert.equal(fetches,1);
 A.c._httpTelemetryTransport_=()=>({explicitTelemetry:true,fetch:()=>{throw Error('post-trip transport must not run')}});
 assert.equal(A.wallet().deferred,true,'la frontière suivante refuse le transport');
 assert.equal(A.wallet().deferredReason,'POST_TRIP_FLOOR');
});
test('pureté des sections critiques : aucun transport/budget/réseau sous les verrous plancher et bail',()=>{
 const breakerSrc=fs.readFileSync(path.join(__dirname,'../src/03E_QUOTA_CIRCUIT_BREAKER.gs'),'utf8').replace(/\r\n/g,'\n');
 const floorSection=breakerSrc.slice(breakerSrc.indexOf('function _floorWrite('),breakerSrc.indexOf('function _floorUntil('));
 assert.doesNotMatch(floorSection,/UrlFetch|fetch\(|WcoreHttp|HttpCounter|BudgetHTTP/,'section plancher pure');
 const scanSrc=fs.readFileSync(path.join(__dirname,'../src/41_GSHEET_WEB_SCAN.gs'),'utf8').replace(/\r\n/g,'\n');
 const releaseSection=scanSrc.slice(scanSrc.indexOf('function _webScanReleaseLease_('),scanSrc.indexOf('function _webScanDeferredResult_('));
 assert.doesNotMatch(releaseSection,/UrlFetch|fetch\(|WcoreHttp/,'section bail pure');
 const locks=[...(scanSrc.match(/getScriptLock\(\)/g)||[])].length;
 assert.ok(locks>=2,'acquisition et libération partagent le même ScriptLock');
});
test('consommateur recovery : hold actif ou plancher illisible laissent la liste en attente',()=>{
 const refresh=fs.readFileSync(path.join(__dirname,'../src/16_REFRESH.gs'),'utf8').replace(/\r\n/g,'\n');
 const a=refresh.indexOf('function _recoverySelectPulseList_('),b=refresh.indexOf('\n}',a);
 const ctx={BudgetHTTP:{isPostTripFloorActive:()=>true},RECOVERY_FIRST_PASS_CAP:10};
 vm.createContext(ctx);vm.runInContext(refresh.slice(a,b+2),ctx);
 assert.equal(ctx._recoverySelectPulseList_(['a','b'],false).pulse.length,0,'plancher actif : aucune vague');
 ctx.BudgetHTTP={isPostTripFloorActive:()=>{throw Error('unreadable');}};
 assert.equal(ctx._recoverySelectPulseList_(['a','b'],false).pulse.length,0,'plancher illisible : refus sûr');
 ctx.BudgetHTTP={isPostTripFloorActive:()=>false};
 assert.equal(String(ctx._recoverySelectPulseList_(['a','b'],false).pulse),'a,b','aucun plancher : reprise');
});
test('MANUAL : contourne le plancher advisory (décision opérateur), pas budget/quota/breaker',()=>{
 const {store,clock,A,B}=scenario({manual:true});
 B.noteAuthoritativeTrip(clock.now);
 assert.equal(A.wallet().deferred,false,'forceFull reste la décision opérateur');
 // AUTO reste retenu sur le même plancher armé
 const auto=scenario();auto.B.noteAuthoritativeTrip(clock.now);
 assert.equal(auto.A.wallet().deferred,true,'AUTO retenu par le plancher');
});
