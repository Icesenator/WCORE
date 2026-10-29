const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=n=>fs.readFileSync(path.join(__dirname,'../src',n),'utf8').replace(/\r\n/g,'\n');
const base=fs.readFileSync(path.join(__dirname,'webscan-http-admission.test.js'),'utf8').replace(/\r\n/g,'\n');
const factory={require,__dirname,console};vm.runInNewContext(base.slice(0,base.indexOf('// 1) Bornes'))+'\nthis.make=harness;this.res=response;',factory);
const quota=read('03E_QUOTA_CIRCUIT_BREAKER.gs'),saving=read('26B_HTTP_SAVINGS.gs'),http=read('03_HTTP.gs');
function fn(s,n){const a=s.indexOf('function '+n+'(');assert.ok(a>=0);return s.slice(a,s.indexOf('\n}',a)+2);}
function method(n){const a=http.indexOf(n+': function('),o=http.indexOf('{',a);let depth=0;for(let i=o;i<http.length;i++){if(http[i]==='{')depth++;if(http[i]==='}'&&--depth===0)return http.slice(a,i+1);}throw Error(n);}
const a=saving.indexOf('(function patchHttpCounter()'),layer=saving.slice(a,saving.indexOf('})();',a)+5);
function stack({order='normal',original=false,codes=[400],denied=false,denyAfterFirst=false,google=false}={}){
 const h=factory.make();const c=h.c,m={logical:0,admissions:0,physical:0,c03:0,c26:0,explicit:0,breaker:0,cacheWrites:0};
 const raw=()=>{const i=m.physical++;if(google)throw Error('Service invoked too many times for one day: urlfetch.');return factory.res(codes[Math.min(i,codes.length-1)]);};
 c.UrlFetchApp={fetch:raw,fetchAll:()=>{throw Error('unexpected batch');}};
 c.HttpCounter={record:()=>m.c03++};c.HttpCallCounter={increment:()=>m.c26++};
 c.QuotaCircuitBreaker={isTripped:()=>false,handleError:e=>{m.breaker++;return /one day: urlfetch/.test(e.message);}};
 c.BudgetHTTP={allow:()=>{m.admissions++;return !denied&&(!denyAfterFirst||m.physical===0);},remaining:()=>20000,isPostTripFloorActive:()=>false};
 c.WalletCache.save=()=>{m.cacheWrites++;return {written:true};};
 vm.runInContext('var Http={'+method('isBlocked')+','+method('canFetchNow')+'};\n'+fn(quota,'INSTALL_GLOBAL_QUOTA_BREAKER'),c);
 if(order==='normal'){c.INSTALL_GLOBAL_QUOTA_BREAKER();vm.runInContext(layer,c);}else{vm.runInContext(layer,c);c.INSTALL_GLOBAL_QUOTA_BREAKER();}
 c._httpTelemetryTransport_=()=>({explicitTelemetry:original,fetch:original?raw:c.UrlFetchApp.fetch});
 return {h,c,m,run:()=>{m.logical++;return c._webScanWallet_('synthetic',[],true,{CHAIN:{KEY:'ETHEREUM',NAME:'Ethereum'}},'synthetic');}};
}
for(const order of ['normal','reverse'])for(const original of [false,true]){
 const label=order+' original='+original;
 test('pile réelle refus initial '+label,()=>{const x=stack({order,original,denied:true});const r=x.run();assert.equal(x.m.physical,0);assert.equal(x.m.c03,0);assert.equal(x.m.c26,0);assert.equal(r.deferred,true);});
 test('pile réelle 503 MANUAL borné '+label,()=>{const x=stack({order,original,codes:[503]});x.run();assert.equal(x.m.physical,2);assert.equal(x.m.c03,2);assert.equal(x.m.c26,2);assert.equal(x.m.cacheWrites,0);});
 test('pile réelle budget changé entre essais '+label,()=>{const x=stack({order,original,codes:[503],denyAfterFirst:true});x.run();assert.equal(x.m.physical,1);assert.equal(x.m.c03,1);assert.equal(x.m.c26,1);});
 test('pile réelle quota Google '+label,()=>{const x=stack({order,original,google:true});const r=x.run();assert.equal(x.m.physical,1);assert.equal(x.m.c03,1);assert.equal(x.m.c26,1);assert.equal(r.quotaBlocked,true);assert.ok(x.m.breaker>=1);});
}
for(const [label,change] of [
 ['budget absent',c=>{delete c.BudgetHTTP;}],
 ['breaker exception',c=>{c.QuotaCircuitBreaker.isTripped=()=>{throw Error('state');};}],
 ['breaker null',c=>{c.QuotaCircuitBreaker.isTripped=()=>null;}],
 ['breaker UNKNOWN',c=>{c.QuotaCircuitBreaker.isTripped=()=>'UNKNOWN';}],
 ['floor exception',c=>{c.BudgetHTTP={allow:()=>true,isPostTripFloorActive:()=>{throw Error('state');}};}],
 ['floor null',c=>{c.BudgetHTTP={allow:()=>true,isPostTripFloorActive:()=>null};}],
 ['floor NaN',c=>{c.BudgetHTTP={allow:()=>true,isPostTripFloorActive:()=>NaN};}],
])test('frontière indisponible '+label+' AUTO : zéro transport',()=>{
 const h=factory.make([factory.res(400)]);change(h.c);h.wallet();assert.equal(h.count.transport,0);
});
for(const order of ['normal','reverse'])test('couche aval refuse après admission WebScan : '+order,()=>{
 const x=stack({order,codes:[400]});let n=0;x.c.BudgetHTTP.allow=()=>++n===1;
 const r=x.run();assert.equal(x.m.physical,0);assert.equal(x.m.cacheWrites,0);
 assert.equal(x.m.c03,order==='reverse'?1:0);assert.equal(x.m.c26,0);
 assert.equal(r.deferred,true); // refus budget au passage suivant, aucun transport
});
for(const original of [false,true])test('succès complet/cache avec pile réelle original='+original,()=>{
 const x=stack({original,codes:[200]});
 x.c._webScanConvertToWalletCache_=()=>({assets:[{symbol:'ETH',balance:1}],updatedAt:1234});
 const r=x.run();assert.equal(x.m.physical,1);assert.equal(x.m.c03,1);assert.equal(x.m.c26,1);assert.equal(x.m.cacheWrites,1);assert.equal(r.ok,true);
});
for(const openUntil of [null,'UNKNOWN',-1,Infinity])test('état cache breaker invalide '+openUntil+' refuse AUTO',()=>{
 const h=factory.make();vm.runInContext(fn(read('41_GSHEET_WEB_SCAN.gs'),'_webScanReadBreakerState_'),h.c);
 h.c.CacheService.getScriptCache=()=>({get:key=>String(key).indexOf('webApiFailureState')>=0?JSON.stringify({openUntil}):null,put(){},remove(){}});
 h.wallet();assert.equal(h.count.transport,0);
});
test('qualification bail : refus budget après acquisition conserve le bail jusqu au TTL',()=>{
 const h=factory.make();let acquired=0,released=0;
 h.c._webScanAcquireAdmissionV2_=()=>{acquired++;return {allowed:true,leaseKey:'synthetic-lease'};};
 h.c._webScanReleaseLease_=()=>released++;
 h.c.BudgetHTTP={allow:()=>false,isPostTripFloorActive:()=>false};h.wallet();
 assert.equal(acquired,1);assert.equal(released,0);assert.equal(h.count.transport,0);
 // Limite existante: pas de transport, mais bail borné par TTL jusqu’à expiration.
});
