const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const candidate = process.env.WCORE_STATUS_CANDIDATE || path.resolve(__dirname, '../src');
const readSource = file => fs.readFileSync(path.join(candidate, process.env.WCORE_STATUS_CANDIDATE ? file : file.replace(/\.js$/, '.gs')), 'utf8');
function harness(store = new Map()) {
  const clock = { now: 1800000000000 };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [clock.now])); } static now() { return clock.now; } }
  const calls = [];
  const c = { Date: Clock, CacheService: { getScriptCache: () => ({ get: k => store.get(k) || null, put: (k,v) => store.set(k,v), remove: k => store.delete(k) }) }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) }, GSHEET_WEB_SCAN_LOCK_WAIT_MS: 1, _webScanProp_: () => '', _webScanEnabled_: () => true, _webScanChainKey_: c => c.CHAIN.NAME, _webScanForce_: x => x === true, _webScanTokenList_: x => x, _webScanSetLastError_: () => {}, ChainFactory: { getRegistry: () => ({ E: { getRefreshStatus: a => { calls.push(a); return c.scan(a); } } }) }, scan: () => 'WEB_SCAN_OK real-cache' };
  vm.createContext(c); vm.runInContext(readSource('41A_WEB_SCAN_QUEUE.js'), c);
  const add = (a, d = clock.now - 1000) => c._webScanQueueEnqueue_(a, [], false, { CHAIN: { NAME: 'E' } }, 'AUTO', d);
  const drain = (n=3,b=240000) => c._webScanQueueDrain_({maxItems:n,budgetMs:b});
  return { c, clock, store, calls, add, drain, queue: () => c._webScanQueueRead_() };
}
test('priorité ancien cache et UNKNOWN devant cache récent', () => {
  const h=harness(); h.add('fresh'); h.add('old',h.clock.now-86400000); h.add('unknown',0); h.drain();
  assert.equal(h.calls[0],'old'); assert.equal(h.calls[1],'unknown');
});
test('60 sources et pulses ordonnés: toutes servies, capacité40, débit3, aucun faux succès admission', () => {
  const h=harness(); const served=new Set();
  for(let cycle=0;cycle<70;cycle++) { for(let i=0;i<65;i++) { const r=h.add('w'+i,served.has('w'+i)?h.clock.now:0); if(!r.ok) assert.match(r.reason,/QUEUE_(DEFERRED|NOT_DUE)/); assert.ok(h.queue().length<=40); } const r=h.drain(); assert.ok(r.results.length<=3); h.calls.forEach(x=>served.add(x)); h.clock.now+=600000; }
  assert.equal(served.size,65);
});
test('admission évincée reste réadmissible avec ticket conservé et restart', () => {
  const h=harness(); for(let i=0;i<40;i++) h.add('fresh'+i); const r=h.add('old',h.clock.now-86400000);
  assert.equal(r.ok,true); assert.ok(r.evicted); const receipt=h.c._webScanQueueReceipt_(r.evicted); assert.equal(receipt.l,'EVICTED');
  const h2=harness(h.store); h2.clock.now+=7200000; h2.drain(1); assert.equal(h2.add(r.evicted.split('|')[1]).ok,true);
});
test('starvation: admission vieille prioritaire même devant donnée ancienne nouvelle', () => {
  const h=harness(); h.add('waiting'); h.clock.now+=h.c.GSHEET_WEB_SCAN_QUEUE_TTL_SEC*1000; h.add('ancient',1); h.drain(1); assert.equal(h.calls[0],'waiting');
});
test('échec quota, retries backoff et cooldown sans faux OK', () => {
 const h=harness(); h.c.scan=()=> '[BLOCKED:QUOTA]'; h.add('x');
 for(let i=0;i<3;i++){const r=h.drain(); assert.equal(r.results.length,1); assert.equal(r.results[0].outcome,'BLOCKED_QUOTA'); assert.equal(h.drain().results.length,0); h.clock.now+=600000*(i+1);}
 assert.equal(h.queue().length,0); assert.equal(h.add('x').reason,'QUEUE_COOLDOWN');
});
test('unresolved est backoffé, pas trois tentatives immédiates',()=>{const h=harness();h.c.ChainFactory.getRegistry=()=>({});h.add('x');assert.equal(h.drain().results.length,1);assert.ok(h.queue()[0].nx>h.clock.now);});
test('lent respecte budget restant et limite dure3',()=>{const h=harness();for(let i=0;i<10;i++)h.add('w'+i);h.c.scan=()=>{h.clock.now+=225000;return 'WEB_SCAN_OK real-cache';};assert.equal(h.drain(99).results.length,1);const h2=harness();for(let i=0;i<10;i++)h2.add('w'+i);assert.equal(h2.drain(99).results.length,3);});
test('observabilité conserve attempts durée et outcome après succès',()=>{const h=harness();h.add('x',0);h.c.scan=()=>{h.clock.now+=123;return 'WEB_SCAN_OK real-cache';};h.drain();const rows=Object.fromEntries(h.c._webScanQueueStatusRows_());assert.equal(rows.queueDepth,0);assert.equal(rows.lastOutcome,'OK');assert.equal(rows.lastDurationMs,123);assert.equal(rows.lastAttempts,1);});
test('succès n’enfile pas immédiatement la même source au pulse suivant',()=>{const h=harness();h.add('x');h.drain();assert.equal(h.add('x').reason,'QUEUE_NOT_DUE');assert.equal(h.queue().length,0);});
test('claim empêche drain réentrant et éviction du scan en vol',()=>{const h=harness();h.add('x');h.c.scan=()=>{const h2=harness(h.store);assert.equal(h2.drain().results.length,0);return 'WEB_SCAN_OK real-cache';};h.drain();assert.equal(h.calls.length,1);});

test('139 sources, 120 cycles: aucune starvation sous pulses fixes',()=>{const h=harness();const seen=new Set();const dates={};for(let cycle=0;cycle<120;cycle++){for(let i=0;i<139;i++)h.add('s'+i,dates['s'+i]||0);const r=h.drain();for(const a of h.calls){seen.add(a);dates[a]=h.clock.now;}h.calls.length=0;assert.ok(r.results.length<=3);h.clock.now+=600000;}assert.equal(seen.size,139);});
test('éviction globale cache et restart ne constituent pas un succès',()=>{const h=harness();h.add('x');h.store.clear();const h2=harness(h.store);assert.equal(h2.queue().length,0);assert.equal(h2.add('x').ok,true);assert.equal(h2.calls.length,0);});
test('backoff survit à éviction de capacité et réadmission',()=>{const h=harness();h.c.scan=()=> 'WEB_SCAN_ERROR';h.add('retry');h.drain(1);const nx=h.queue()[0].nx;for(let i=0;i<39;i++)h.add('fresh'+i);h.add('ancient',1);assert.equal(h.queue().some(x=>x.a==='retry'),false);h.c.scan=()=> 'WEB_SCAN_OK real-cache';h.drain(1);h.add('retry');assert.equal(h.queue().find(x=>x.a==='retry').nx,nx);assert.equal(h.queue().find(x=>x.a==='retry').n,1);});
test('DEGRADED et PRESERVED ne suppriment pas un pulse en se prétendant frais',()=>{for(const outcome of ['DEGRADED','PRESERVED']){const h=harness();h.c.scan=()=> 'WEB_SCAN_'+outcome+' cache';h.add('x');h.drain();assert.equal(h.add('x').ok,true);assert.equal(h.c._webScanQueueReceipt_('E|x').l,outcome);}});

test('escalade force pendant scan auto conservée puis traitée au cycle suivant',()=>{const h=harness();const forces=[];h.c.ChainFactory.getRegistry=()=>({E:{getRefreshStatus:(a,r,t,f)=>{forces.push(f);if(forces.length===1){assert.equal(h.c._webScanQueueEnqueue_(a,[],true,{CHAIN:{NAME:'E'}},'MANUAL',0).ok,true);}return 'WEB_SCAN_OK real-cache';}}});h.add('x');const first=h.drain(3);assert.equal(first.results.length,1);assert.equal(h.queue().length,1);assert.equal(h.queue()[0].f,1);assert.equal(h.queue()[0].x,0);const second=h.drain(3);assert.equal(second.results.length,1);assert.deepEqual(forces,[false,true]);assert.equal(h.queue().length,0);});
test('escalade pendant erreur conserve le backoff sans second scan immédiat',()=>{const h=harness();h.c.scan=a=>{h.c._webScanQueueEnqueue_(a,[],true,{CHAIN:{NAME:'E'}},'MANUAL',0);return '[BLOCKED:QUOTA]';};h.add('x');assert.equal(h.drain().results.length,1);assert.equal(h.queue()[0].f,1);assert.equal(h.queue()[0].n,1);assert.ok(h.queue()[0].nx>h.clock.now);assert.equal(h.drain().results.length,0);});
