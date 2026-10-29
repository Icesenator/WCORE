const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'../src',f),'utf8');
function extract(s,name){const a=s.indexOf('function '+name+'(');assert.ok(a>=0);return s.slice(a,s.indexOf('\n}',a)+2);}
function diag(){const records=[],calls=[],errors=[];const c={_TEST:{getConfig:()=>({RPC:{ENDPOINTS:['https://a.invalid','https://b.invalid']}})},UrlFetchApp:{},HttpCounter:{record:(...x)=>records.push(x)},HttpCallCounter:{increment:(...x)=>records.push(x)},QuotaCircuitBreaker:{handleError:e=>errors.push(e.message)},_originalUrlFetch:(url)=>{calls.push(url);return {getResponseCode:()=>200,getContentText:()=>'{"result":"0x1"}'};}};
vm.createContext(c);vm.runInContext(extract(read('13B_DIAG_RPC.gs'),'DIAG_CHAIN_RPC_TEST'),c);return {c,records,calls,errors};}
test('diagnostic RPC original : chaque transport est attribué explicitement',()=>{const h=diag();h.c.DIAG_CHAIN_RPC_TEST('TEST');assert.equal(h.calls.length,2);assert.equal(h.records.length,4);});
test('diagnostic RPC original : erreur Google transmise au breaker et stop du lot',()=>{const h=diag();h.c._originalUrlFetch=url=>{h.calls.push(url);throw Error('Service invoked too many times for one day: urlfetch.');};h.c.DIAG_CHAIN_RPC_TEST('TEST');assert.equal(h.errors.length,1);assert.equal(h.calls.length,1);});
test('sonde recovery : réponse absente reste un refus et non un faux succès',()=>{const c={UrlFetchApp:{},_httpTelemetryTransport_:()=>({fetch:()=>null,explicitTelemetry:false})};vm.createContext(c);vm.runInContext(extract(read('16_REFRESH.gs'),'_recoveryProbeQuota_'),c);const r=c._recoveryProbeQuota_();assert.equal(r.ok,false);assert.equal(r.code,0);});
test('readiness : sonde originale comptabilisée même si étapes suivantes indisponibles',()=>{
 const records=[],calls=[];const c={UrlFetchApp:{},_originalUrlFetch:()=>{calls.push(1);return {getResponseCode:()=>200};},HttpCounter:{record:(...a)=>records.push(a)},HttpCallCounter:{increment:(...a)=>records.push(a)},PropertiesService:{getScriptProperties:()=>{throw Error('stop after probe');}}};
 vm.createContext(c);vm.runInContext(extract(read('13_DIAGNOSTIC.gs'),'QUOTA_RESET_READINESS_CHECK'),c);
 assert.throws(()=>c.QUOTA_RESET_READINESS_CHECK(),/stop after probe/);
 assert.equal(calls.length,1);assert.equal(records.length,2);
});
test('readiness : rejet Google classifié, compté une fois et aucun retry',()=>{
 const records=[],errors=[];let calls=0;const c={UrlFetchApp:{},_originalUrlFetch:()=>{calls++;throw Error('Service invoked too many times for one day: urlfetch.');},HttpCounter:{record:(...a)=>records.push(a)},HttpCallCounter:{increment:(...a)=>records.push(a)},QuotaCircuitBreaker:{handleError:e=>errors.push(e.message)},PropertiesService:{getScriptProperties:()=>{throw Error('stop after probe');}}};
 vm.createContext(c);vm.runInContext(extract(read('13_DIAGNOSTIC.gs'),'QUOTA_RESET_READINESS_CHECK'),c);
 assert.throws(()=>c.QUOTA_RESET_READINESS_CHECK(),/stop after probe/);assert.equal(calls,1);assert.equal(records.length,2);assert.equal(errors.length,1);
});
