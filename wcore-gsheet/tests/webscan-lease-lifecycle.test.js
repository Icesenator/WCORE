const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const base=fs.readFileSync(path.join(__dirname,'webscan-http-admission.test.js'),'utf8').replace(/\r\n/g,'\n');
const f={require,__dirname,console};vm.runInNewContext(base.slice(0,base.indexOf('// 1) Bornes'))+'\nthis.make=harness;this.response=response;',f);
const source=fs.readFileSync(path.join(__dirname,'../src/41_GSHEET_WEB_SCAN.gs'),'utf8');
function fn(name){const a=source.indexOf('function '+name+'(');return source.slice(a,source.indexOf('\n}',a)+2);}
function env(){let now=1800000000000;const map=new Map(),events=[];let fail=false;
 const cache={get:key=>{if(fail)throw Error('cache unavailable');const e=map.get(key);if(!e)return null;if(e.until<=now){map.delete(key);return null;}return e.value;},put:(key,value,sec)=>{map.set(key,{value,until:now+sec*1000});events.push(['acquire',key,now]);},remove:key=>{map.delete(key);events.push(['release',key,now]);}};
 const actors=[];
 function actor(manual=false,seq){const h=f.make(seq,{manual});h.c.Date=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};h.c.CacheService.getScriptCache=()=>cache;actors.push(h);return h;}
 return {actor,cache,map,events,advance:ms=>{now+=ms;},clock:()=>now,unavailable:()=>{fail=true;}};
}
test('budget refusé : bail retenu30s, réappel refusé avantTTL et admis aprèsTTL',()=>{
 const e=env(),a=e.actor();a.c.BudgetHTTP.allow=()=>false;const r=a.wallet();assert.equal(r.deferred,true);assert.equal(a.count.transport,0);assert.equal(e.events.filter(x=>x[0]==='acquire').length,1);
 a.c.BudgetHTTP.allow=()=>true;e.advance(29999);const before=a.wallet();assert.equal(before.deferredReason,'LEASE_HELD');assert.equal(a.count.transport,0);
 e.advance(1);a.wallet();assert.equal(a.count.transport,1);assert.equal(e.clock(),1800000030000);
});
test('réentrée AUTO puis MANUAL : MANUAL bypass explicite bail, pas assertion implicite',()=>{
 const e=env(),a=e.actor();a.c.BudgetHTTP.allow=()=>false;a.wallet();const b=e.actor(true);const r=b.c._webScanAcquireAdmissionV2_('synthetic','ETHEREUM',true);assert.equal(r.bypassed,true);b.wallet();assert.equal(b.count.transport,1);assert.equal(e.events.filter(x=>x[0]==='acquire').length,1);
});
test('deuxAUTO mêmeclé : second refusé tant que bail non expiré',()=>{
 const e=env(),a=e.actor(),b=e.actor();const first=a.admitV2(),second=b.admitV2();assert.equal(first.allowed,true);assert.equal(second.allowed,false);assert.equal(second.reason,'LEASE_HELD');
});
test('erreur réseau aprèsbail : bail retenuTTL ; succèsréponse libère aprèstransport',()=>{
 const e=env(),a=e.actor(false,[Error('network')]);a.wallet();assert.equal(a.count.transport,1);assert.equal(e.events.filter(x=>x[0]==='release').length,0);
 e.advance(30000);const b=e.actor();b.wallet();assert.equal(b.count.transport,1);assert.equal(e.events.filter(x=>x[0]==='release').length,1);
});
test('floor etquota changés aprèsadmission : quota relu avanttransport, floor non relu',()=>{
 const e=env(),a=e.actor();const acquire=a.c._webScanAcquireAdmissionV2_;a.c._webScanAcquireAdmissionV2_=(...args)=>{const r=acquire(...args);a.c.QuotaCircuitBreaker.isTripped=()=>true;return r;};a.wallet();assert.equal(a.count.transport,0);assert.equal(e.events.filter(x=>x[0]==='release').length,0);
});
test('libération périmée via admitV2 : jeton propriétaire préserve le bail renouvelé',()=>{
 const e=env(),a=e.actor(),b=e.actor();const first=a.admitV2();e.advance(30000);const next=b.admitV2();assert.equal(first.leaseKey,next.leaseKey);assert.notEqual(first.leaseToken,next.leaseToken);
 a.c._webScanReleaseLease_(first.leaseKey);assert.equal(e.cache.get(next.leaseKey),next.leaseToken,'sans jeton, aucun retrait');
 a.c._webScanReleaseLease_(first.leaseKey,first.leaseToken);assert.equal(e.cache.get(next.leaseKey),next.leaseToken,'jeton périmé ≠ détenteur');
 b.c._webScanReleaseLease_(next.leaseKey,next.leaseToken);assert.equal(e.cache.get(next.leaseKey),null,'le détenteur libère');
});
test('diagnostic unavailable : ne prétend pas que le breaker est fermé',()=>{
 const e=env(),a=e.actor();vm.runInContext(fn('_webScanReadBreakerState_'),a.c);e.unavailable();const s=a.c._webScanBreakerStatus_();assert.equal(s.unavailable,true);assert.equal(s.open,null);assert.equal(s.openUntil,null);assert.equal(s.failures,null);
});
test('diagnostic indisponible seul ne change pas admission indépendante attestée',()=>{
 const e=env(),a=e.actor();a.c._webScanBreakerStatus_=()=>({open:null,unavailable:true});a.wallet();assert.equal(a.count.transport,1);
});
test('floor activé après acquisition : pas de nouvelle lecture floor dans tentative déjà admise',()=>{
 const e=env(),a=e.actor();let held=false;a.c.BudgetHTTP.isPostTripFloorActive=()=>held;
 const acquire=a.c._webScanAcquireAdmissionV2_;a.c._webScanAcquireAdmissionV2_=(...args)=>{const r=acquire(...args);held=true;return r;};
 a.wallet();assert.equal(a.count.transport,1); // fenêtre mesurée, pas possibilité d’annuler après envoi
});
test('cache défaillant après acquisition : quota/budget restent attestés, libération best-effort',()=>{
 const e=env(),a=e.actor();const acquire=a.c._webScanAcquireAdmissionV2_;a.c._webScanAcquireAdmissionV2_=(...args)=>{const r=acquire(...args);e.unavailable();return r;};
 a.wallet();assert.equal(a.count.transport,1);assert.ok(e.events.filter(x=>x[0]==='release').length<=1,'libération best-effort, jamais bloquante');
});
test('libération : jeton propriétaire obligatoire, retrait non atomique',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','src','41_GSHEET_WEB_SCAN.gs'),'utf8');
 const body=src.slice(src.indexOf('function _webScanReleaseLease_('),src.indexOf('function _webScanDeferredResult_('));
 // Mitigation jeton propriétaire : lecture puis retrait conditionnel, NON atomique.
 assert.match(body,/if \(cache && cache\.get\(leaseKey\) === leaseToken\) cache\.remove\(leaseKey\);/,'retrait gardé par le jeton');
 assert.match(body,/if \(!leaseKey \|\| !leaseToken\) return;/,'sans jeton, aucune suppression');
 assert.match(body,/cache\.get\(leaseKey\) === leaseToken/,'retrait seulement si le jeton correspond');
 assert.match(body,/getScriptLock/,'même verrou commun à acquisition et retrait');
});
test('libérateur périmé : ne supprime pas le bail d’un nouveau détenteur',()=>{
 const errs=()=>Array.from({length:12},()=>Error('Address unavailable'));
 const e=env(),a=e.actor(false,errs()),b=e.actor(false,errs());e.advance(1000);
 a.c.BudgetHTTP.allow=()=>true;a.wallet();
 const leaseKey=[...e.map.keys()][0];
 assert.ok(leaseKey,'bail A retenu après échec réseau');
 e.advance(31000);e.map.delete(leaseKey);
 b.c.BudgetHTTP.allow=()=>true;b.wallet();
 assert.ok(e.map.has(leaseKey),'bail B présent');
 a.c._webScanReleaseLease_(leaseKey);
 assert.ok(e.map.has(leaseKey),'bail B survit à la libération périmée de A');
});
test('baseline sans respect du protocole commun : un get périmé permet le retrait',()=>{
 const e=env(),a=e.actor(),b=e.actor();
 const first=a.admitV2();
 e.advance(30000);e.map.delete(first.leaseKey);
 const next=b.admitV2();
 assert.notEqual(first.leaseToken,next.leaseToken);
 const realGet=e.cache.get;
 // A est suspendu après sa lecture : sa valeur lue reste son propre jeton.
 e.cache.get=k=>k===first.leaseKey?first.leaseToken:realGet(k);
 a.c._webScanReleaseLease_(first.leaseKey,first.leaseToken);
 e.cache.get=realGet;
 assert.ok(!e.map.has(first.leaseKey),'limite caractérisée : le bail B est supprimé par un remove non atomique');
 // ATTENTION : le comportement souhaité (bail B préservé) n'est PAS garanti.
 // CacheService n'offre pas de compare-and-delete ; le protocole partagé est
 // testé séparément, ce stub injecte une lecture périmée hors de ce protocole.
 // Aucune exclusion mutuelle commune acquisitions/libérations n'est imposée sans étude de coût.
});
