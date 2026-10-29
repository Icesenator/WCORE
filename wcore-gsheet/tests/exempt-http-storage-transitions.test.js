const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'quota-exempt-portfolio.test.js'),'utf8');
const loader={require,__dirname,console};vm.runInNewContext(fixture.slice(0,fixture.indexOf('// --- Contract 1:'))+'\nthis.create=makeEnv;',loader);
const S='PORTFOLIO_STOCK',C='PORTFOLIO_CRYPTO',key=s=>'WCORE_EXEMPT_HTTP_'+s;
function env(){const e=loader.create({});let now=Date.parse('2026-10-16T08:59:59Z'),mode='ok',held=false;const store={},m={writes:0,reads:0,admissions:{[S]:0,[C]:0},transport:0,c03:0,c26:0};
 e.Date=class extends Date{static now(){return now;}};
 e.LockService.getScriptLock=()=>({tryLock:()=>{held=true;return true;},releaseLock:()=>{held=false;}});
 e.PropertiesService.getScriptProperties=()=>({getProperty:k=>{m.reads++;assert.equal(held,true);if(mode==='readFail')throw Error('read');return store[k]??null;},setProperty:(k,v)=>{assert.equal(held,true);if(mode==='writeFail')throw Error('write');store[k]=v;m.writes++;}});
 e._originalUrlFetch=()=>{assert.equal(held,false,'transport hors verrou');m.transport++;return {code:200};};e.HttpCounter.record=()=>m.c03++;e.HttpCallCounter.increment=()=>m.c26++;
 return {e,m,store,mode:v=>{mode=v;},advance:ms=>{now+=ms;},day:()=>{const d=new Date(now-9*3600000);return d.getUTCFullYear()+'-'+(d.getUTCMonth()+1)+'-'+d.getUTCDate();},run:s=>{const r=e.ExemptHttp.attempt(s,'https://invalid',{});if(r)m.admissions[s]++;return r;}};
}
for(const seq of [[S,S,C,C],[S,C,S,C],[C,S,C,S]])test('panne multislots '+seq.join('→'),()=>{
 const h=env();h.mode('readFail');for(const s of seq)assert.ok(h.run(s));assert.equal(h.run(S),null);assert.equal(h.run(C),null);
 assert.deepEqual(h.m.admissions,{[S]:2,[C]:2});assert.equal(h.m.transport,4);assert.equal(h.m.writes,0);assert.equal(h.m.c03,4);assert.equal(h.m.c26,4);
});
for(const slot of [S,C])test('deux secours puis restauration '+slot,()=>{const h=env();h.mode('readFail');h.run(slot);h.run(slot);h.mode('ok');assert.equal(h.run(slot),null);assert.equal(h.m.transport,2);assert.equal(h.m.writes,0);});
for(const distant of [0,1,20,96])test('écriture échouée puis autoritaire '+distant,()=>{
 const h=env();h.mode('writeFail');assert.ok(h.run(C));assert.equal(h.m.writes,0);h.mode('ok');h.store[key(C)]=JSON.stringify({d:h.day(),n:distant});
 const r=h.run(C);if(distant===96){assert.equal(r,null);assert.equal(JSON.parse(h.store[key(C)]).n,96);}else{assert.ok(r);assert.equal(JSON.parse(h.store[key(C)]).n,Math.max(1,distant)+1);}assert.equal(h.m.transport,distant===96?1:2);
});
test('lecture réussie puis impossible : consommation connue conservée',()=>{const h=env();h.run(C);h.mode('readFail');h.run(C);h.run(C);assert.equal(h.run(C),null);assert.equal(h.m.transport,3);assert.equal(h.m.writes,1);assert.equal(JSON.parse(h.store[key(C)]).n,1);});
test('nouvelle exécution : enveloppe locale renouvelée, aucune garantie durable',()=>{for(let n=0;n<2;n++){const h=env();h.mode('readFail');h.run(S);h.run(S);assert.equal(h.run(S),null);assert.equal(h.m.transport,2);}});
test('09UTC pendant panne : consommation dégradée ne disparaît pas',()=>{const h=env();h.mode('readFail');h.run(C);h.run(C);h.advance(1000);assert.equal(h.run(C),null);assert.equal(h.m.transport,2);});
test('normal deux slots :96 chacun, pas plafond global2',()=>{const h=env();for(let n=0;n<96;n++){assert.ok(h.run(S));assert.ok(h.run(C));}assert.equal(h.run(S),null);assert.equal(h.run(C),null);assert.equal(h.m.writes,192);assert.equal(h.m.transport,192);});
test('09UTC puis stockage restauré : deux secours déjà consommés ne sont pas réouverts',()=>{
 const h=env();h.mode('readFail');h.run(C);h.run(C);h.advance(1000);h.mode('ok');
 assert.equal(h.run(C),null);assert.equal(h.m.transport,2);assert.equal(h.m.writes,0);
});
test('écriture concurrente : écrivain lockless ne modifie plus le compteur partagé',()=>{
 const h=env();const k=key(C);h.store[k]=JSON.stringify({d:h.day(),n:90});let held=false;
 h.e.LockService.getScriptLock=()=>({tryLock:()=>false,releaseLock(){throw Error('not owner');}});
 h.e.PropertiesService.getScriptProperties=()=>({getProperty:key=>h.store[key]||null,setProperty:(key,value)=>{
  // Interleaving après les deux lectures : un autre écrivain a déjà réservé95.
  h.store[key]=JSON.stringify({d:h.day(),n:95});h.store[key]=value;
 }});
 assert.ok(h.run(C));assert.equal(JSON.parse(h.store[k]).n,90);
 // Limite caractérisée, pas une preuve de sécurité de la double lecture.
});
const callers=fs.readFileSync(path.join(__dirname,'exempt-http-absent-callers.test.js'),'utf8').replace(/\r\n/g,'\n');
const callerLoader={require,__dirname,console};vm.runInNewContext(callers.slice(0,callers.indexOf('const CASES='))+'\nthis.make=make;',callerLoader);
for(const seq of [[S,S,C,C],[S,C,S,C],[C,S,C,S]])test('deux vrais producteurs mêmeVM panne commune '+seq.join('→'),()=>{
 const h=callerLoader.make({caller:'stock',exempt:'valid',tripped:true});
 const crypto=fs.readFileSync(path.join(__dirname,'../src/43_CRYPTO_PORTFOLIO.gs'),'utf8');vm.runInContext(crypto,h.c);
 const props=h.c.PropertiesService.getScriptProperties();let attempts={ [S]:0,[C]:0 },writes=0;
 h.c.PropertiesService.getScriptProperties=()=>({getProperty:k=>{if(k.startsWith('WCORE_EXEMPT_HTTP_'))throw Error('meter unavailable');return props.getProperty(k);},setProperty:(k,v)=>{writes++;return props.setProperty(k,v);}});
 for(const slot of seq){const result=slot===S?h.c._stockPortfolioFetchSnapshot_():h.c._cryptoPortfolioFetchSnapshot_();assert.equal(result.ok,true);attempts[slot]++;}
 assert.deepEqual(attempts,{[S]:2,[C]:2});assert.equal(h.m.physical,4);assert.equal(h.m.e03,4);assert.equal(h.m.e26,4);
 assert.equal(Object.keys(h.store).filter(k=>k.startsWith('WCORE_EXEMPT_HTTP_')).length,0);
 for(const slot of [S,C])assert.throws(()=>slot===S?h.c._stockPortfolioFetchSnapshot_():h.c._cryptoPortfolioFetchSnapshot_(),/BLOCKED:QUOTA/);
 assert.equal(h.m.physical,4);assert.equal(h.m.cacheWrite,0);
});
test('verrou indisponible : aucun écrivain partagé, deux secours locaux maximum',()=>{
 const h=env();h.e.LockService.getScriptLock=()=>({tryLock:()=>false,releaseLock(){throw Error('non owner');}});
 for(let i=0;i<6;i++)h.run(C);
 assert.equal(h.m.writes,0);assert.equal(h.m.transport,2);assert.equal(h.store[key(C)],undefined);
});
test('tryLock en exception : compteur saturé lisible interdit même le secours',()=>{
 const h=env();h.store[key(C)]=JSON.stringify({d:h.day(),n:96});h.e.LockService.getScriptLock=()=>({tryLock(){throw Error('lock');}});
 h.e.PropertiesService.getScriptProperties=()=>({getProperty:k=>h.store[k]||null,setProperty(){throw Error('must not write');}});
 assert.equal(h.run(C),null);assert.equal(h.m.transport,0);
});
test('frontière09UTC interne à réservation : dépense précédente peut être datée dans la nouvelle période',()=>{
 const h=env();const k=key(C);h.store[k]=JSON.stringify({d:h.day(),n:95});let shifted=false;
 h.e.PropertiesService.getScriptProperties=()=>({getProperty:key=>{const old=h.store[key]||null;if(!shifted){shifted=true;h.advance(1000);}return old;},setProperty:(key,value)=>{h.store[key]=value;h.m.writes++;}});
 assert.ok(h.run(C));const persisted=JSON.parse(h.store[k]);
 assert.equal(persisted.d,'2026-10-15');assert.equal(persisted.n,96);
 // Caractérisation : période lue avant09UTC, date écrite après09UTC, consommation mal rattachée.
});
test('attenteverrou traverse09UTC : période capturée après acquisition',()=>{
 const h=env();h.store[key(C)]=JSON.stringify({d:h.day(),n:96});
 const get=h.e.LockService.getScriptLock;h.e.LockService.getScriptLock=()=>{const l=get();return{tryLock:()=>{h.advance(1000);return l.tryLock();},releaseLock:()=>l.releaseLock()};};
 assert.ok(h.run(C));assert.equal(JSON.parse(h.store[key(C)]).d,'2026-10-16');assert.equal(JSON.parse(h.store[key(C)]).n,1);
});
test('réservations successives frontière : chacune sa propre période, compteursconcordants',()=>{
 const h=env();assert.ok(h.run(C));assert.equal(JSON.parse(h.store[key(C)]).d,'2026-10-15');h.advance(1000);assert.ok(h.run(C));
 assert.equal(JSON.parse(h.store[key(C)]).d,'2026-10-16');assert.equal(JSON.parse(h.store[key(C)]).n,1);assert.equal(h.m.transport,2);assert.equal(h.m.c03,2);assert.equal(h.m.c26,2);
});
test('nouvellepériode déjàsaturée : refus sans transport',()=>{
 const h=env();h.advance(1000);h.store[key(C)]=JSON.stringify({d:h.day(),n:96});assert.equal(h.run(C),null);assert.equal(h.m.transport,0);
});
test('ancien95 écrit avanttransport09UTC : réservation suivante nouvellejournée reste1',()=>{
 const h=env();h.store[key(C)]=JSON.stringify({d:h.day(),n:95});let shift=false;
 h.e.PropertiesService.getScriptProperties=()=>({getProperty:k=>{const raw=h.store[k];if(!shift){shift=true;h.advance(1000);}return raw||null;},setProperty:(k,v)=>{h.store[k]=v;h.m.writes++;}});
 assert.ok(h.run(C));assert.equal(JSON.parse(h.store[key(C)]).d,'2026-10-15');assert.ok(h.run(C));assert.equal(JSON.parse(h.store[key(C)]).n,1);assert.equal(JSON.parse(h.store[key(C)]).d,'2026-10-16');
});
test('retry réseau traverse09UTC : deux réservations et deux tentatives comptées',()=>{
 const h=env();let raw=0;h.e._originalUrlFetch=()=>{raw++;h.m.transport++;if(raw===1){h.advance(1000);throw Error('network');}return {code:200};};
 assert.throws(()=>h.run(C),/network/);assert.equal(JSON.parse(h.store[key(C)]).d,'2026-10-15');assert.equal(JSON.parse(h.store[key(C)]).n,1);
 assert.ok(h.run(C));assert.equal(JSON.parse(h.store[key(C)]).d,'2026-10-16');assert.equal(JSON.parse(h.store[key(C)]).n,1);
 assert.equal(h.m.writes,2);assert.equal(h.m.transport,2);assert.equal(h.m.c03,2);assert.equal(h.m.c26,2);
});
