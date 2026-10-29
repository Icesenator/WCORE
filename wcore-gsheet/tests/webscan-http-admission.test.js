const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixture=fs.readFileSync(path.join(__dirname,'web-scan-adapter.test.js'),'utf8').replace(/\r\n/g,'\n');
const factory={require,__dirname,console};vm.runInNewContext(fixture.slice(0,fixture.indexOf('\n{\n  const failedWritePayload'))+'\nthis.make=makeContext;',factory);
const response=(code=200,body='{}')=>({getResponseCode:()=>code,getContentText:()=>body});
const CONFIG={CHAIN:{KEY:'ETHEREUM',NAME:'Ethereum'}};
function harness(sequence=[response()],opts={}){
 const count={logical:0,admission:0,transport:0,c03:0,c26:0,testOnce:0,handleError:0};
 const props={GSHEET_WEB_SCAN_ENABLED:'true',WCORE_WEB_API_URL:'https://api.invalid',GSHEET_API_TOKEN:'synthetic',GSHEET_WEB_SCAN_ALLOWLIST:'ALL'};
 const c=factory.make(props,()=>{throw Error('patched transport must not be used here');});
 c.HttpCounter={record:()=>count.c03++};c.HttpCallCounter={increment:()=>count.c26++};
 c._httpTelemetryTransport_=()=>({explicitTelemetry:true,fetch:()=>{const r=sequence[Math.min(count.transport++,sequence.length-1)];if(r instanceof Error)throw r;if(opts.afterTransport)opts.afterTransport();return r;}});
 c.QuotaCircuitBreaker={isTripped:()=>(opts.tripped===true||(typeof opts.tripped==='function'&&opts.tripped())),testOnce:()=>count.testOnce++,handleError:e=>{count.handleError++;return /one day: urlfetch/.test(e.message);}};
 c.BudgetHTTP={allow:()=>true,isPostTripFloorActive:()=>false};
 c._webScanReadBreakerState_=()=>({failures:[],openUntil:opts.breakerOpenUntil||0});
 return {c,count,props,wallet:()=>{count.logical++;return c._webScanWallet_('synthetic',[],!!opts.manual,CONFIG,'synthetic');},admitV2:()=>c._webScanAcquireAdmissionV2_('synthetic','ETHEREUM',!!opts.manual)};
}
// 1) Bornes de tentatives : contrat exact
for(const manual of [false,true]){
 const cap=manual?2:1;
 for(const [label,seq,expected] of [['succès immédiat',[response()],1],['retriable 429',[response(429)],cap],['retriable 503',[response(503)],cap],['permanent 400',[response(400)],1],['exception réseau',[Error('socket hang up')],cap],['quota Google',[Error('Service invoked too many times for one day: urlfetch.')],1]])
 test((manual?'MANUAL':'AUTO')+' '+label+' : '+expected+' transport(s) maximum',()=>{
  const h=harness(seq,{manual});h.wallet();
  assert.equal(h.count.transport,expected);assert.equal(h.count.c03,expected);assert.equal(h.count.c26,expected);
 });
}
test('MANUAL ignore le post-trip floor, AUTO s’y dégrade',()=>{
 const a=harness([response()],{manual:false});a.c.BudgetHTTP={allow:()=>true,isPostTripFloorActive:()=>true};
 const ra=a.wallet();assert.equal(a.count.transport,0);assert.equal(ra.deferred,true);assert.equal(ra.deferredReason,'POST_TRIP_FLOOR');
 const m=harness([response()],{manual:true});m.c.BudgetHTTP={allow:()=>true,isPostTripFloorActive:()=>true};m.wallet();assert.equal(m.count.transport,1);
});
// 2) Admission réelle : chaque porte refuse sans transport
test('breaker web ouvert : admission refusée, résultat différé, zéro transport',()=>{
 const h=harness([response()],{breakerOpenUntil:Date.now()+600000});h.admitV2()&&0;
 const a=h.admitV2();assert.equal(a.allowed,false);assert.equal(a.reason,'WEB_BREAKER_OPEN');
 const r=h.wallet();assert.equal(h.count.transport,0);assert.match(r.status,/CACHE_ONLY|WEB_SCAN_DEFERRED/);assert.equal(r.ok,true);
});
test('bail déjà détenu : admission refusée sans transport',()=>{
 const h=harness();h.c.CacheService.getScriptCache=()=>({get:k=>k.indexOf('webScanLease')>=0?'1':null,put:()=>{},remove:()=>{}});
 const a=h.admitV2();assert.equal(a.allowed,false);assert.equal(a.reason,'LEASE_HELD');h.wallet();assert.equal(h.count.transport,0);
});
test('cache indisponible : admission refusée, aucune autorisation implicite',()=>{
 const h=harness();h.c.CacheService.getScriptCache=()=>null;
 const a=h.admitV2();assert.equal(a.allowed,false);assert.equal(a.reason,'CACHE_UNAVAILABLE');assert.equal(typeof a.allowed,'boolean');
});
test('admission en exception : repli V1 puis refus, zéro transport',()=>{
 const h=harness();h.c._webScanAcquireAdmissionV2_=()=>({allowed:false,reason:'ADMISSION_ERROR'});
 let v1=0;h.c._webScanAcquireAdmission_=()=>{v1++;return {allowed:false,reason:'LOCK_BUSY'};};
 const r=h.wallet();assert.equal(v1,1);assert.equal(h.count.transport,0);assert.equal(r.deferred,true);
});
test('quota breaker ouvert : BLOCKED_QUOTA sans transport, testOnce au plus une fois',()=>{
 const h=harness([response()],{tripped:true});const r=h.wallet();
 assert.equal(h.count.transport,0);assert.equal(r.quotaBlocked,true);assert.equal(h.count.testOnce,1);
});
test('quota qui se déclenche entre deux tentatives : le retry ne transmet pas',()=>{
 let trips=0;const h=harness([response(503),response()],{manual:true,tripped:()=>trips>0,afterTransport:()=>{trips=1;}});
 const r=h.wallet();assert.equal(h.count.transport,1);assert.equal(r.quotaBlocked,true);
});
test('désactivé ou hors allowlist : aucun résultat, aucun transport',()=>{
 const d=harness();d.props.GSHEET_WEB_SCAN_ENABLED='false';assert.equal(d.wallet(),null);assert.equal(d.count.transport,0);
 const a=harness();a.props.GSHEET_WEB_SCAN_ALLOWLIST='SOLANA';assert.equal(a.wallet(),null);assert.equal(a.count.transport,0);
});
// 3) Classification des erreurs
test('erreur Google atteint le breaker ; 429 fournisseur ne le sollicite pas',()=>{
 const g=harness([Error('Service invoked too many times for one day: urlfetch.')],{manual:true});g.wallet();
 assert.equal(g.count.handleError,1);
 const p=harness([response(429)],{manual:true});p.wallet();assert.equal(p.count.handleError,0);assert.equal(p.count.transport,2);
});
// 4) Aucun résultat périmé présenté comme frais
test('résultat différé porte un horodatage de cache, jamais WEB_SCAN_OK',()=>{
 const h=harness();h.c.CacheService.getScriptCache=()=>({get:()=>null,put:()=>{},remove:()=>{}});
 h.c.WalletCache.load=()=>({updatedAt:1700000000000,assets:[{symbol:'ETH'}]});
 const a=h.admitV2();h.c._webScanAcquireAdmissionV2_=()=>({allowed:false,reason:'LEASE_HELD'});
 const r=h.wallet();assert.equal(r.deferred,true);assert.match(r.status,/^\[CACHE_ONLY\]/);assert.doesNotMatch(r.status,/WEB_SCAN_OK/);assert.equal(h.count.transport,0);
});
for(const allowed of ['UNKNOWN',1])test('admission non attestée '+allowed+' : refus zéro transport',()=>{
 const h=harness();h.c._webScanAcquireAdmissionV2_=()=>({allowed});const r=h.wallet();assert.equal(h.count.transport,0);assert.equal(r.deferred,true);
});
for(const state of [null,undefined])test('admission absente '+state+' : résultat différé sans transport',()=>{
 const h=harness();h.c._webScanAcquireAdmissionV2_=()=>state;const r=h.wallet();assert.equal(h.count.transport,0);assert.equal(r.deferred,true);
});
for(const manual of [false,true])test('budget explicitement refusé doit bloquer WebScan '+manual,()=>{
 const h=harness([response()],{manual});h.c.BudgetHTTP={allow:()=>false};const r=h.wallet();assert.equal(h.count.transport,0);assert.equal(r.deferred,true);
});
test('budget épuisé au retry : seconde tentative logique sans second transport',()=>{
 const h=harness([response(503),response()],{manual:true});h.c.BudgetHTTP={allow:()=>h.count.transport===0};h.wallet();assert.equal(h.count.transport,1);
});
for(const value of [null,undefined,'UNKNOWN',0])test('budget non attesté '+value+' : aucun compteur ni transport',()=>{
 const h=harness();h.c.BudgetHTTP={allow:()=>value};const r=h.wallet();assert.equal(r.deferred,true);assert.equal(h.count.transport,0);assert.equal(h.count.c03,0);assert.equal(h.count.c26,0);
});
test('exception budget : cache différé, aucun transport',()=>{
 const h=harness();h.c.BudgetHTTP={allow:()=>{throw Error('counter unavailable');}};const r=h.wallet();assert.equal(r.deferred,true);assert.equal(h.count.transport,0);
});
test('réponse malformée200 : erreur sans succès ni nouvelle collecte revendiquée',()=>{
 const h=harness([response(200,'not-json')],{manual:true});const r=h.wallet();assert.equal(h.count.transport,1);assert.ok(!r||r.ok===false);assert.equal(h.c.__saved.length,0);
});
test('réponse absente : AUTO1 MANUAL2, jamais succès',()=>{
 for(const manual of [false,true]){const h=harness([null],{manual});const r=h.wallet();assert.equal(h.count.transport,manual?2:1);assert.equal(r.ok,false);assert.equal(h.c.__saved.length,0);}
});
test('transport repli intercepté : pas de double attribution explicite WebScan',()=>{
 const h=harness();h.c._httpTelemetryTransport_=()=>({explicitTelemetry:false,fetch:()=>{h.count.transport++;h.count.c03++;h.count.c26++;return response(400);}});
 h.wallet();assert.equal(h.count.transport,1);assert.equal(h.count.c03,1);assert.equal(h.count.c26,1);
});
test('exception réelle CacheService aux deux admissions AUTO : cache différé, aucun transport',()=>{
 const h=harness();h.c.CacheService.getScriptCache=()=>{throw Error('cache unavailable');};const r=h.wallet();assert.equal(h.count.transport,0);assert.equal(r.deferred,true);
});
