const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function factory(file,expose){const s=fs.readFileSync(path.join(__dirname,file),'utf8').replace(/\r\n/g,'\n');const c={require,__dirname,console};vm.runInNewContext(s.slice(0,s.indexOf("test('"))+expose,c);return c;}
const lease=factory('webscan-lease-lifecycle.test.js','\nthis.env=env;');
const floor=factory('floor-write-scope.test.js','\nthis.load=load;this.key=key;');
function sharedLock(actors){let owner=null;const events=[];for(const [id,c] of actors){c.LockService.getScriptLock=()=>({tryLock:ms=>{events.push(['try',id,ms]);if(owner!==null)return false;owner=id;return true;},releaseLock:()=>{assert.equal(owner,id,'release seulement par détenteur');events.push(['release',id]);owner=null;}});}return {owner:()=>owner,events};}
test('deux acquisitions concurrentes AUTO : un seul détenteur, deux identités même ScriptLock',()=>{
 const e=lease.env(),a=e.actor(),b=e.actor();const lock=sharedLock([['A',a.c],['B',b.c]]);const get=e.cache.get;let nested=false,second;
 e.cache.get=k=>{const snapshot=get(k);if(k.includes('webScanLease')&&!nested){nested=true;second=b.admitV2();}return snapshot;};
 const first=a.admitV2();assert.equal(first.allowed,true);assert.equal(second.allowed,false);assert.equal(second.reason,'LOCK_BUSY');
 assert.equal(e.events.filter(x=>x[0]==='acquire').length,1);assert.equal(lock.owner(),null);
 assert.equal(b.admitV2().reason,'LEASE_HELD');
});
test('release suspendu après lecture : réacquisition exclue, nouveau bail après release préservé',()=>{
 const e=lease.env(),a=e.actor(),b=e.actor();const lock=sharedLock([['A',a.c],['B',b.c]]);const first=a.admitV2();const get=e.cache.get;let nested=false,second;
 e.cache.get=k=>{const snapshot=get(k);if(k===first.leaseKey&&!nested){nested=true;e.advance(30000);second=b.admitV2();}return snapshot;};
 a.c._webScanReleaseLease_(first.leaseKey,first.leaseToken);e.cache.get=get;
 assert.equal(second.allowed,false);assert.equal(second.reason,'LOCK_BUSY');assert.equal(lock.owner(),null);
 const renewed=b.admitV2();assert.equal(renewed.allowed,true);assert.notEqual(renewed.leaseToken,first.leaseToken);
 a.c._webScanReleaseLease_(first.leaseKey,first.leaseToken);assert.equal(get(renewed.leaseKey),renewed.leaseToken);
});
for(const failure of ['busy','throws'])test('verrou '+failure+' : acquisition refusée et release sans retrait, MANUAL sans verrou',()=>{
 const e=lease.env(),a=e.actor();const first=a.admitV2();let releases=0,tries=0;
 a.c.LockService.getScriptLock=()=>({tryLock:()=>{tries++;if(failure==='throws')throw Error('lock unavailable');return false;},releaseLock:()=>releases++});
 const result=a.admitV2();assert.equal(result.allowed,false);a.c._webScanReleaseLease_(first.leaseKey,first.leaseToken);assert.equal(e.cache.get(first.leaseKey),first.leaseToken);assert.equal(releases,0);
 const before=tries;assert.equal(a.c._webScanAcquireAdmissionV2_('synthetic','ETHEREUM',true).bypassed,true);assert.equal(tries,before);
});
test('HTTP et conversion hors ScriptLock : succès et échec réseau',()=>{
 for(const networkError of [false,true]){const e=lease.env(),a=e.actor();const lock=sharedLock([['A',a.c]]);let http=0,conversions=0;a.c._httpTelemetryTransport_=()=>({explicitTelemetry:true,fetch:()=>{http++;assert.equal(lock.owner(),null);if(networkError)throw Error('network');return {getResponseCode:()=>200,getContentText:()=>'{}'};}});a.c._webScanConvertToWalletCache_=()=>{conversions++;assert.equal(lock.owner(),null);return {assets:[{symbol:'SYNTHETIC',balance:1}],updatedAt:1};};a.wallet();assert.equal(http,1);assert.equal(conversions,networkError?0:1);assert.equal(lock.owner(),null);}
});
test('floor deux utilisateurs : B récent pendant lecture A ancienne ne peut pas être écrasé',()=>{
 const A=floor.load(),B=floor.load(),store=new Map();const lock=sharedLock([['A',A.c],['B',B.c]]);let nested=false,attemptB;const writes=[];
 for(const [id,h] of [['A',A],['B',B]])h.c.PropertiesService.getScriptProperties=()=>({getProperty:k=>{const raw=store.get(k)||null;if(id==='A'&&!nested){nested=true;attemptB=B.c.BudgetHTTP.noteAuthoritativeTrip(B.now);}return raw;},setProperty:(k,v)=>{writes.push({id,value:Number(v),owner:lock.owner()});store.set(k,String(v));},deleteProperty:k=>store.delete(k)});
 assert.equal(A.c.BudgetHTTP.noteAuthoritativeTrip(A.now-2000),true);assert.equal(attemptB,false,'B ne modifie pas le plancher sous verrou A');
 assert.equal(B.c.BudgetHTTP.noteAuthoritativeTrip(B.now),true);const newer=Number(store.get(floor.key));assert.equal(A.c.BudgetHTTP.noteAuthoritativeTrip(A.now-2000),true);assert.equal(Number(store.get(floor.key)),newer);
 assert.ok(writes.every(w=>w.owner===w.id),'tous écrivains utilisent le verrou commun');assert.equal(lock.owner(),null);
});
test('floor clear et armement : ordre sérialisé, pas de priorité éternelle du clear',()=>{
 const A=floor.load(),B=floor.load(),store=new Map();const lock=sharedLock([['A',A.c],['B',B.c]]);let nested=false,armDuringClear;
 for(const [id,h] of [['A',A],['B',B]])h.c.PropertiesService.getScriptProperties=()=>({getProperty:k=>store.get(k)||null,setProperty:(k,v)=>{assert.equal(lock.owner(),id);store.set(k,String(v));},deleteProperty:k=>{assert.equal(lock.owner(),id);if(!nested){nested=true;armDuringClear=B.c.BudgetHTTP.noteAuthoritativeTrip(B.now);}store.delete(k);}});
 A.c.BudgetHTTP.noteAuthoritativeTrip(A.now);assert.equal(A.c.BudgetHTTP.clearPostTripFloor(),true);assert.equal(armDuringClear,false);assert.equal(store.has(floor.key),false);
 assert.equal(B.c.BudgetHTTP.noteAuthoritativeTrip(B.now),true);assert.ok(store.has(floor.key),'un nouveau trip après clear réarme légitimement');
});
test('baseline UserLock indépendant : A lit, B lit/écrit récent, A écrase plus ancien',()=>{
 const A=floor.load(),B=floor.load(),store=new Map(),trace=[];let nested=false;
 for(const [id,h] of [['A',A],['B',B]]){
  h.c.LockService.getScriptLock=()=>({tryLock:()=>true,releaseLock(){}}); // reproduit l'absence de verrou commun inter-utilisateurs
  h.c.PropertiesService.getScriptProperties=()=>({getProperty:k=>{const raw=store.get(k)||null;trace.push([id,'read',raw]);if(id==='A'&&!nested){nested=true;B.c.BudgetHTTP.noteAuthoritativeTrip(B.now);}return raw;},setProperty:(k,v)=>{trace.push([id,'write',Number(v)]);store.set(k,String(v));},deleteProperty:k=>store.delete(k)});
 }
 A.c.BudgetHTTP.noteAuthoritativeTrip(A.now-2000);
 assert.deepEqual(trace.map(x=>x.slice(0,2)),[['A','read'],['B','read'],['B','write'],['A','write']]);
 assert.ok(trace[3][2]<trace[2][2]);assert.equal(Number(store.get(floor.key)),trace[3][2]);
 // Baseline observée : max() seul n'est pas monotone si les verrous ne sont pas communs.
});
test('floor armement puis clear : dernier ordre effectif gagne, nouvel armement ultérieur reste possible',()=>{
 const A=floor.load(),B=floor.load(),store=new Map();const lock=sharedLock([['A',A.c],['B',B.c]]);let nested=false,clearDuringArm;
 for(const [id,h] of [['A',A],['B',B]])h.c.PropertiesService.getScriptProperties=()=>({getProperty:k=>{const v=store.get(k)||null;if(id==='A'&&!nested){nested=true;clearDuringArm=B.c.BudgetHTTP.clearPostTripFloor();}return v;},setProperty:(k,v)=>{assert.equal(lock.owner(),id);store.set(k,String(v));},deleteProperty:k=>{assert.equal(lock.owner(),id);store.delete(k);}});
 assert.equal(A.c.BudgetHTTP.noteAuthoritativeTrip(A.now),true);assert.equal(clearDuringArm,false);assert.ok(store.has(floor.key));
 assert.equal(B.c.BudgetHTTP.clearPostTripFloor(),true);assert.equal(store.has(floor.key),false);
 assert.equal(A.c.BudgetHTTP.noteAuthoritativeTrip(A.now),true);assert.ok(store.has(floor.key));assert.equal(lock.owner(),null);
});
test('exceptions cache ou stockage : libération du verrou détenu, aucun verrou imbriqué',()=>{
 const e=lease.env(),a=e.actor();const l=sharedLock([['A',a.c]]);a.c.CacheService.getScriptCache=()=>{throw Error('cache');};
 assert.equal(a.admitV2().allowed,false);assert.equal(l.owner(),null);
 const h=floor.load();const f=sharedLock([['floor',h.c]]);h.c.PropertiesService.getScriptProperties=()=>{throw Error('storage');};
 assert.equal(h.c.BudgetHTTP.noteAuthoritativeTrip(h.now),false);assert.equal(h.c.BudgetHTTP.clearPostTripFloor(),false);assert.equal(f.owner(),null);
});
test('fraîcheur floor : une exécution ayant lu false voit le trip armé dès la frontière suivante',()=>{
 const A=floor.load(),B=floor.load(),store=new Map();sharedLock([['A',A.c],['B',B.c]]);
 for(const h of [A,B])h.c.PropertiesService.getScriptProperties=()=>({getProperty:k=>store.get(k)||null,setProperty:(k,v)=>store.set(k,String(v)),deleteProperty:k=>store.delete(k)});
 assert.equal(A.c.BudgetHTTP.isPostTripFloorActive(),false);
 assert.equal(B.c.BudgetHTTP.noteAuthoritativeTrip(B.now),true);
 assert.equal(A.c.BudgetHTTP.isPostTripFloorActive(),true,'relecture autoritative à la frontière suivante');
 assert.ok(Number(store.get(floor.key))>A.now);
 // Le mémo de lecture a été supprimé : plus de faux négatif inter-exécutions.
});
