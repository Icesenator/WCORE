const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../src/03E_QUOTA_CIRCUIT_BREAKER.gs'),'utf8');
const key=(src.match(/TRIP_FLOOR_KEY = "([^"]+)"/)||[])[1];
assert.ok(key,'TRIP_FLOOR_KEY introuvable');
const floorMs=Number((src.match(/TRIP_FLOOR_MS = ([^;]+);/)||[])[1]&&vm.runInNewContext((src.match(/TRIP_FLOOR_MS = ([^;]+);/)||[])[1]));
function load(){
 const a=src.indexOf('var BudgetHTTP ='),b=src.indexOf('})();',a);assert.ok(a>0&&b>a,'bloc BudgetHTTP introuvable');
 const store=new Map(),now=1800000000000,count={writes:0,lockTries:0};
 const c={Logger:{log(){}},Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},
  LockService:{getScriptLock:()=>({tryLock:()=>{count.lockTries++;return true;},releaseLock(){}})},
  Utilities:{sleep(){}},console};
 c.PropertiesService={getScriptProperties:()=>({getProperty:k=>store.has(k)?store.get(k):null,setProperty:(k,v)=>{store.set(k,String(v));count.writes++;},deleteProperty:k=>{store.delete(k);count.writes++;}})};
 vm.createContext(c);vm.runInContext(src.slice(a,b+5),c);
 return {c,store,count,now};
}
test('deux identités : un ancrage plus ancien ne raccourcit pas le plancher armé',()=>{
 const h=load();const now=h.now;
 h.c.BudgetHTTP.noteAuthoritativeTrip(now-1000);
 const later=Number(h.store.get(key));
 assert.ok(later>0,'plancher armé');
 h.c.BudgetHTTP.noteAuthoritativeTrip(now-2000);
 const after=Number(h.store.get(key));
 assert.ok(after>=later,'le plancher ne recule pas : attendu>='+later+' observé '+after);
});
test('plancher : isPostTripFloorActive cohérent avec la valeur persistée effective',()=>{
 const h=load();h.c.BudgetHTTP.noteAuthoritativeTrip(h.now-1000);const armed=Number(h.store.get(key));
 h.c.BudgetHTTP.noteAuthoritativeTrip(h.now-2000);
 assert.equal(Number(h.store.get(key)),armed);
 assert.equal(h.c.BudgetHTTP.isPostTripFloorActive(),true);
});
test('libération opérateur face à un armement concurrent : le clear gagne (exception assumée)',()=>{
 const h=load();const now=h.now;
 h.c.BudgetHTTP.noteAuthoritativeTrip(now-1000);
 const armed=Number(h.store.get(key));
 assert.equal(h.c.BudgetHTTP.clearPostTripFloor(),true);
 assert.equal(h.store.has(key),false,'libération opérateur effective');
 h.c.BudgetHTTP.noteAuthoritativeTrip(now-1000);
 assert.equal(Number(h.store.get(key)),armed,'réarmement identique');
 // Historique : UserLock ne sérialisait pas deux identités. La couverture de
 // concurrence sous ScriptLock commun est exercée dans wc07-shared-critical-sections.
});
