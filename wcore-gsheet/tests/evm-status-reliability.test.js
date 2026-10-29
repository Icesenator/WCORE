const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = f => fs.readFileSync(process.env.WCORE_STATUS_CANDIDATE ? path.join(process.env.WCORE_STATUS_CANDIDATE, f.replace(/\.gs$/, '.js')) : path.join(__dirname,'../src',f),'utf8');
function harness({cache, staleTrigger=false, sameTrigger=false, webMs=0, cacheMs=0}={}) {
 let elapsed=0,http=0;
 const c={console,Logger:{log(){}},Addr:{normalize:x=>x},CacheManager:{init(){}},WalletCache:{load:()=>{elapsed+=cacheMs;return cache;}},
 createTimer:()=>({remaining:()=>18000-elapsed,left:()=>18000-elapsed,has:ms=>18000-elapsed>=ms,isTimeUp:()=>elapsed>=18000}),
 Format:{now:()=> 'CURRENT',datetime:x=> typeof x==='number'?'CACHE_TIME':'N/A'},
 BaseEngine:{httpSnapshot:()=>0,shouldSkipRefreshForSameTrigger:()=>sameTrigger,shouldSkipNoTriggerRecentScan:()=>staleTrigger,wrapCacheOnlyMarker:x=>'[CACHE_ONLY] '+x},
 _webScanWallet_:()=>{http++;elapsed+=webMs;return {ok:true,status:'WEB_SCAN_OK CACHE_TIME'};},
 _webScanCacheTimestamp_:x=>x&&x.updatedAt||0};
 vm.createContext(c);vm.runInContext(src('11_EVM_ENGINE.gs'),c);
 return {run:()=>c.EvmEngine.getRefreshStatus('synthetic-wallet',null,[],false,'old-pulse',{CHAIN:{NAME:'ETHEREUM'}},{}),http:()=>http,elapsed:()=>elapsed};
}
test('stale pulse does not label an old cached result FRESH',()=>{
 const h=harness({cache:{updatedAt:1700000000000},staleTrigger:true});
 assert.doesNotMatch(h.run(),/\[FRESH\]/);assert.equal(h.http(),0);
});
test('unknown cache timestamp never substitutes current pulse time as success',()=>{
 const h=harness({cache:{},staleTrigger:true});
 assert.match(h.run(),/UNKNOWN|NO_CACHE/);assert.doesNotMatch(h.run(),/CURRENT/);assert.equal(h.http(),0);
});
test('synchronous Web scan latency remains inside the I1 path (characterization, not hard timeout reproduction)',()=>{
 const h=harness({cache:{updatedAt:1700000000000},webMs:31000});h.run();assert.equal(h.http(),1);assert.equal(h.elapsed(),31000);
});
test('slow cache preflight exhausts status budget without starting another Web request',()=>{
 const h=harness({cache:{updatedAt:1700000000000},cacheMs:19000,webMs:31000});
 const status=h.run();assert.equal(h.http(),0);assert.match(status,/DEFERRED|BUDGET/);assert.doesNotMatch(status,/WEB_SCAN_OK/);
});
test('same-trigger cache with unknown age cannot fabricate a success date',()=>{
 const h=harness({cache:{},sameTrigger:true});assert.doesNotMatch(h.run(),/CURRENT/);assert.match(h.run(),/AGE_UNKNOWN/);assert.equal(h.http(),0);
});
test('real BaseEngine obsolete pulse skip does not attest cache freshness',()=>{
 const now=Date.now();const c={console};vm.createContext(c);vm.runInContext(src('10A_BASE_ENGINE.gs'),c);
 const cache={updatedAt:now-48*3600000};
 assert.equal(c.BaseEngine.shouldSkipNoTriggerRecentScan('synthetic-wallet',{},cache,false,new Date(now-2*3600000).toISOString()),true);
 assert.equal(c.BaseEngine.shouldSkipNoTriggerRecentScan('synthetic-wallet',{},cache,false,new Date(now).toISOString()),false);
 assert.equal(c.BaseEngine.shouldSkipNoTriggerRecentScan('synthetic-wallet',{},cache,true,new Date(now-2*3600000).toISOString()),false);
});
test('Ethereum Action relay preserves failure without scan or mutation',()=>{
 const c={};vm.createContext(c);vm.runInContext(src('10C_LEDGER_VIEW_CORE.gs'),c);
 assert.equal(c.LedgerView_relayStatus_('[ERROR] TIMEOUT'),'[ERROR] TIMEOUT');
 assert.equal(c.LedgerView_relayStatus_(null),'N/A');
});
