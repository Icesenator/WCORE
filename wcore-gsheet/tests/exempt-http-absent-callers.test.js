const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=n=>fs.readFileSync(path.join(__dirname,'..','src',n),'utf8').replace(/\r\n/g,'\n');
const breaker=read('03E_QUOTA_CIRCUIT_BREAKER.gs'),saving=read('26B_HTTP_SAVINGS.gs'),http=read('03_HTTP.gs');
function fnFrom(s,n){const a=s.indexOf('function '+n+'(');assert.ok(a>=0,n);return s.slice(a,s.indexOf('\n}',a)+2);}
function method(n){const a=http.indexOf(n+': function('),o=http.indexOf('{',a);let d=0;for(let i=o;i<http.length;i++){if(http[i]==='{')d++;if(http[i]==='}'&&--d===0)return http.slice(a,i+1);}throw Error(n);}
const savingA=saving.indexOf('(function patchHttpCounter()'),layer=saving.slice(savingA,saving.indexOf('})();',savingA)+5);
const budgetA=breaker.indexOf('var BudgetHTTP ='),budgetBlock=breaker.slice(budgetA,breaker.indexOf('})();',budgetA)+5);
const exemptA=breaker.indexOf('var ExemptHttp ='),exemptBlock=breaker.slice(exemptA,breaker.indexOf('})();',exemptA)+5);
const ok=()=>({getResponseCode:()=>200,getContentText:()=>'{"ok":true,"value":1}'});
function make({caller='stock',exempt='absent',tripped=false,raw,exemptCall}={}){
 const m={logical:0,normalAdmission:0,physical:0,e03:0,e26:0,exemptAvailable:0,exemptAdmission:0,snapshot:0,cacheWrite:0,status:null};
 const store={WCORE_WEB_API_URL:'https://api.invalid',GSHEET_API_TOKEN:'synthetic'};
 const transport=raw||(()=>{m.physical++;return ok();});
 const c={console,Date,JSON,Math,String,Number,Boolean,Object,Array,RegExp,isFinite,parseInt,encodeURIComponent,
  QUOTA_EXEMPT_DAILY_LIMIT:96,
  Logger:{log(){}},Utilities:{sleep(){},formatDate:()=>'2026-10-15 00:00:00',DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:()=>Array(32).fill(1)},
  Session:{getScriptTimeZone:()=>'Europe/Paris'},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>(k in store?store[k]:null),setProperty:(k,v)=>{store[k]=String(v);},deleteProperty:k=>{delete store[k];}})},
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}}),getUserLock:()=>({tryLock:()=>true,releaseLock(){}})},
  UrlFetchApp:{fetch:transport,fetchAll:()=>{throw Error('unexpected batch');}},
  HttpCounter:{record:()=>m.e03++,count:()=>0,isCountValid:()=>true,isDegraded:()=>false},
  HttpCallCounter:{increment:()=>m.e26++},
  QuotaCircuitBreaker:{isTripped:()=>tripped,handleError:e=>/urlfetch|too many times/i.test(String(e&&e.message||e)),isQuotaError:e=>/urlfetch|too many times/i.test(String(e&&e.message||e))},
  WalletCache:{load:()=>null,save:()=>{m.cacheWrite++;return{written:true};}},CacheManager:{init(){}},
  Format:{now:()=>'2026-10-15 00:00:00',datetime:()=>'2026-10-15 00:00:00'},
  __m:m,__store:store};
 vm.createContext(c);
 vm.runInContext('var Http={'+method('isBlocked')+','+method('canFetchNow')+'};\n'+fnFrom(breaker,'INSTALL_GLOBAL_QUOTA_BREAKER')+'\n'+budgetBlock+'\n'+(exempt==='absent'?'':exemptBlock)+'\n'+layer,c);
 c._httpTelemetryTransport_=()=>({fetch:transport,explicitTelemetry:true});
 if(exempt==='absent')vm.runInContext('ExemptHttp = undefined;',c);
 else if(exempt==='valid') { const actual=c.ExemptHttp.attempt; c.ExemptHttp.attempt=(...args)=>{m.exemptAdmission++;return actual(...args);}; }
 else c.ExemptHttp=exempt===null?null:exempt==='noMethod'?{}:exempt==='nonCallable'?{attempt:42}:
  exempt==='refuse'?{attempt:()=>null}:
  exempt==='throwsQuota'?{attempt:()=>{throw Error('Service invoked too many times for one day: urlfetch.');}}:
  exempt==='throwsOther'?{attempt:()=>{throw Error('Address unavailable');}}:
  exempt==='malformed'?{attempt:()=>({})}:
  {attempt:(slot,url,options)=>{m.exemptAdmission++;if(exemptCall)return exemptCall(slot,url,options);m.physical++;return ok();}};
 if(typeof c.ExemptHttp!=='undefined'&&c.ExemptHttp)m.exemptAvailable=1;
 c.INSTALL_GLOBAL_QUOTA_BREAKER();
 vm.runInContext(read(caller==='stock'?'42_STOCK_PORTFOLIO.gs':'43_CRYPTO_PORTFOLIO.gs'),c);
 return {c,m,store,run:()=>{m.logical++;const f=caller==='stock'?c._stockPortfolioFetchSnapshot_:c._cryptoPortfolioFetchSnapshot_;try{const r=f();m.snapshot=1;m.status='SNAPSHOT_OK';return r;}catch(e){m.status=String(e&&e.message||e);throw e;}}};
}
const CASES=[
 ['normal admis succès',{exempt:undefined},r=>{assert.equal(r.value,1);},m=>{assert.equal(m.physical,1);assert.equal(m.e03,1);assert.equal(m.e26,1);assert.equal(m.exemptAdmission,0);assert.equal(m.snapshot,1);}],
 ['normal refusé, ExemptHttp absent',{exempt:undefined,tripped:true},(r,e)=>{assert.match(e.message,/BLOCKED:QUOTA/);},m=>{assert.equal(m.physical,0);assert.equal(m.exemptAdmission,0);assert.equal(m.snapshot,0);assert.match(m.status,/BLOCKED:QUOTA/);}],
 ['ExemptHttp null',{exempt:null,tripped:true},(r,e)=>{assert.match(e.message,/null.*attempt|reading 'attempt'/);assert.doesNotMatch(e.message,/BLOCKED:QUOTA/);},m=>{assert.equal(m.physical,0);assert.equal(m.exemptAdmission,0);}],
 ['méthode absente',{exempt:'noMethod',tripped:true},(r,e)=>{assert.match(e.message,/BLOCKED:QUOTA/);},m=>{assert.equal(m.physical,0);}],
 ['méthode non appelable',{exempt:'nonCallable',tripped:true},(r,e)=>{assert.match(String(e.message),/not a function/);assert.doesNotMatch(String(e.message),/BLOCKED:QUOTA/);},m=>{assert.equal(m.physical,0);assert.equal(m.snapshot,0);}],
 ['refus de réservation',{exempt:'refuse',tripped:true},(r,e)=>{assert.match(e.message,/BLOCKED:QUOTA/);},m=>{assert.equal(m.physical,0);assert.equal(m.exemptAdmission,0);}],
 ['secours valide une seule fois',{exempt:'valid',tripped:true},r=>{assert.equal(r.value,1);},m=>{assert.equal(m.exemptAdmission,1);assert.equal(m.physical,1);assert.equal(m.e03,1);assert.equal(m.e26,1);assert.equal(m.snapshot,1);}],
 ['exception Google quota',{exempt:'throwsQuota',tripped:true},(r,e)=>{assert.match(String(e.message),/urlfetch/);},m=>{assert.equal(m.snapshot,0);assert.ok(m.status.indexOf('urlfetch')>=0);}],
 ['retour malformé',{exempt:'malformed',tripped:true},(r,e)=>{assert.match(String(e.message),/blocked or empty response/);},m=>{assert.equal(m.snapshot,0);assert.equal(m.physical,0);}],
];
for(const caller of ['stock','crypto'])for(const [label,opts,checkResult,checkMetrics] of CASES)
 test(caller+' — '+label,()=>{const h=make({caller,...opts});let result,error;try{result=h.run();}catch(e){error=e;}checkResult(result,error);checkMetrics(h.m);});
for(const caller of ['stock','crypto']){
 test(caller+' — getter attempt lève : erreur fonctionnelle sans secours physique',()=>{
  const h=make({caller,tripped:true,exempt:'noMethod'});Object.defineProperty(h.c.ExemptHttp,'attempt',{get(){throw Error('ACCESS_UNAVAILABLE');}});
  assert.throws(()=>h.run(),/ACCESS_UNAVAILABLE/);assert.equal(h.m.physical,0);assert.equal(h.m.snapshot,0);assert.equal(h.m.cacheWrite,0);
 });
 test(caller+' — symbole explicitement undefined : refus sans brut',()=>{
  const h=make({caller,tripped:true,exempt:'absent'});h.c.ExemptHttp=undefined;
  assert.throws(()=>h.run(),/BLOCKED:QUOTA/);assert.equal(h.m.physical,0);assert.equal(h.m.e03,0);assert.equal(h.m.e26,0);
 });
 test(caller+' — erreur Google réelle du transport normal : breaker puis propagation',()=>{
  const h=make({caller,exempt:'absent'});let raw=0,events=0;
  // Installer les vrais wrappers autour du transport original qui échoue.
  h.c.UrlFetchApp={fetch:()=>{raw++;throw Error('Service invoked too many times for one day: urlfetch.');},fetchAll:()=>[]};
  const handler=h.c.QuotaCircuitBreaker.handleError;h.c.QuotaCircuitBreaker.handleError=e=>{events++;return handler(e);};
  vm.runInContext(layer,h.c);h.c.INSTALL_GLOBAL_QUOTA_BREAKER();
  assert.throws(()=>h.run(),/urlfetch/);assert.equal(raw,1);assert.equal(events,1);assert.equal(h.m.e03,1);assert.equal(h.m.e26,1);assert.equal(h.m.snapshot,0);
 });
}
