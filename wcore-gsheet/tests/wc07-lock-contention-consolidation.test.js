const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8').replace(/\r\n/g,'\n');
function loadPrefix(file,marker,expose){const text=read(file),c={require,__dirname,console};const end=text.indexOf(marker);assert.ok(end>=0,file);vm.runInNewContext(text.slice(0,end)+expose,c);return c;}
const shared=loadPrefix('wc07-shared-critical-sections.test.js',"\ntest('",'\nthis.leaseFactory=lease;this.floorFactory=floor;this.lockFactory=sharedLock;');
const exempt=loadPrefix('quota-exempt-portfolio.test.js','// --- Contract 1:','\nthis.create=makeEnv;');
const source=n=>fs.readFileSync(path.join(__dirname,'../src',n),'utf8').replace(/\r\n/g,'\n');
const web=source('41_GSHEET_WEB_SCAN.gs'),quota=source('03E_QUOTA_CIRCUIT_BREAKER.gs');
const webWait=Number(web.match(/GSHEET_WEB_SCAN_LOCK_WAIT_MS\s*=\s*(\d+)/)[1]);
const floorWait=Number(quota.match(/TRIP_FLOOR_LOCK_WAIT_MS\s*=\s*(\d+)/)[1]);
const exemptWait=Number(quota.slice(quota.indexOf('var ExemptHttp =')).match(/LOCK_WAIT_MS\s*=\s*(\d+)/)[1]);
function participants(){const e=shared.leaseFactory.env(),scan=e.actor(),floor=shared.floorFactory.load(),x=exempt.create();const lock=shared.lockFactory([['scan',scan.c],['floor',floor.c],['exempt',x]]);return {e,scan,floor,x,lock};}
for(const holder of ['scan','floor','exempt'])test('contention sous '+holder+' : refus scan/floor et secours exempt borné, attentes constantes',()=>{
 const h=participants();const contexts={scan:h.scan.c,floor:h.floor.c,exempt:h.x};const held=contexts[holder].LockService.getScriptLock();assert.equal(held.tryLock(1),true);
 const before=h.lock.events.length;assert.equal(h.scan.admitV2().allowed,false);
 assert.equal(h.floor.c.BudgetHTTP.noteAuthoritativeTrip(h.floor.now),false);assert.equal(h.floor.store.size,0);
 for(let i=0;i<3;i++)h.x.ExemptHttp.attempt('PORTFOLIO_STOCK','https://invalid',{});
 assert.equal(h.x.__sent.filter(r=>r.counter==='transport').length,2);assert.equal(Object.keys(h.x.__store).length,0);
 const waits=h.lock.events.slice(before).filter(r=>r[0]==='try').map(r=>r[2]);assert.deepEqual(Array.from(waits),[webWait,floorWait,exemptWait,exemptWait,exemptWait]);
 assert.equal(h.lock.owner(),holder,'aucun concurrent ne libère le détenteur');held.releaseLock();assert.equal(h.lock.owner(),null);
});
test('armement empêché : false + log, aucune protection durable inventée, admission suivante possible',()=>{
 const h=participants();const logs=[];h.floor.c.Logger.log=s=>logs.push(s);const hold=h.scan.c.LockService.getScriptLock();hold.tryLock(1);
 assert.equal(h.floor.c.BudgetHTTP.noteAuthoritativeTrip(h.floor.now),false);assert.equal(h.floor.store.size,0);assert.ok(logs.some(s=>s.includes('not armed')));
 hold.releaseLock();assert.equal(h.floor.c.BudgetHTTP.isPostTripFloorActive(),false,'propriété absente réellement vérifiée après échec armement');
 assert.equal(h.scan.admitV2().allowed,true,'un échec de persistance ne fournit pas de deadline partagée');
});
test('tryLock en exception : aucun release indu, zéro écriture, secours2/slot seulement',()=>{
 const h=participants();let releases=0;for(const c of [h.scan.c,h.floor.c,h.x])c.LockService.getScriptLock=()=>({tryLock(){throw Error('lock unavailable');},releaseLock(){releases++;}});
 assert.equal(h.scan.admitV2().allowed,false);assert.equal(h.floor.c.BudgetHTTP.noteAuthoritativeTrip(h.floor.now),false);
 for(let i=0;i<3;i++)h.x.ExemptHttp.attempt('PORTFOLIO_CRYPTO','https://invalid',{});
 assert.equal(releases,0);assert.equal(h.x.__sent.filter(r=>r.counter==='transport').length,2);assert.equal(Object.keys(h.x.__store).length,0);
});
for(const [label,value,active,unknown] of [['absent',null,false,false],['actif','1800000001000',true,false],['malformé','oops',true,true],['futurabsurde','9999999999999999',false,false]])test('floor sémantique '+label,()=>{
 const h=shared.floorFactory.load();if(value!==null)h.store.set(shared.floorFactory.key,value);
 assert.equal(h.c.BudgetHTTP.isPostTripFloorActive(),active);const st=h.c.BudgetHTTP.status();assert.equal(st.tripFloorUnknown,unknown);
});
test('floor illisible : UNKNOWN sans claim CLOSED dans le diagnostic',()=>{
 const h=shared.floorFactory.load();h.c.PropertiesService.getScriptProperties=()=>{throw Error('storage');};assert.equal(h.c.BudgetHTTP.isPostTripFloorActive(),true);assert.equal(h.c.BudgetHTTP.status().tripFloorUnknown,true);
});
