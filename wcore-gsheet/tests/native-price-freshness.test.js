// v4.16.77 — fraicheur des prix natifs : UNKNOWN != 0, aucune date inventee.
// RED sur LIVE d560d67d : prix natif perime => total UNKNOWN meme si un prix
// observe < 90 min existe ; prix en cache reestampille "maintenant".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = path.join(__dirname, '../src');
const NOW = 1800000000000;
const MIN = 60000;
const STORE_KEY = 'WCORE_NATIVE_PRICE_STORE_V1';
const FLARE_ID = 'coingecko:flare-networks';
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const has07N = false; // NativePriceStore integre a 07_PRICES.gs

function harness(options = {}) {
  let clock = NOW;
  const http = [];
  const l1 = new Map();
  const persisted = options.cache;
  const c = {
    console, Logger:{log(){}}, PriceManager:{}, WCORE_STABLECOINS:{},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>null,getProperties:()=>({}),setProperty(){},deleteProperty(){}})},
    CacheService:{getScriptCache:()=>({get:k=>l1.has(k)?l1.get(k):null,put:(k,v)=>l1.set(k,v),getAll:ks=>Object.fromEntries(ks.filter(k=>l1.has(k)).map(k=>[k,l1.get(k)])),putAll(){}})},
    Session:{getScriptTimeZone:()=> 'UTC'},Utilities:{formatDate:d=>d.toISOString()},
    CacheManager:{init(){}},
    RpcClient:{call(){throw new Error('unexpected RPC');}},
    WalletCache:{load(){return clone(persisted);},save(){},getLastUpdateStr:()=> 'fixture-cache-time'},
    MetaCache:{load:()=>({})},GlobalPriceCache:{load:()=>({})},
    AssetManager:{normalizeMetadata(){}},WalletNames:{get:(_a,name)=>name},
    BaseEngine:{isSystemBlocked:()=>false},
    _webScanCacheTimestamp_:cache=>cache.last_cache_update_ms||0,
    HTTP:{getJson(url){ http.push(url); return options.httpResult ? options.httpResult(url) : {}; }},
    LockService:{getScriptLock(){throw new Error('lock unavailable');}}
  };
  vm.createContext(c);
  c.fixtureNow = ()=>clock;
  vm.runInContext('Date.now = fixtureNow;',c);
  const files = ['02_UTILS.gs','04E_FX_METADATA.gs','07_PRICES.gs',...(has07N?['07N_NATIVE_PRICE_STORE.gs']:[]),'10_OUTPUT.gs','11_EVM_ENGINE.gs','19_CHAIN_FACTORY.gs','24_DEGRADED_MODE.gs','FLARE.gs'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(SRC,file),'utf8'),c,{filename:file});
  c.DegradedMode.isCircuitBreakerActive = ()=>false;
  if (options.store) l1.set(STORE_KEY, JSON.stringify(options.store));
  return { c, l1, http, run:()=>c.CACHED_WALLET_ASSETS_FLARE('fixture-wallet','fixture-refresh'), setClock:t=>{clock=t;} };
}
function staleCache(priceAgeMs) {
  return {assets:[{contract:'native',symbol:'FLR',name:'Flare',balance:7}],
    priceMap:{'native@flare':0.02},priceTsMap:{'native@flare':NOW-priceAgeMs},
    balanceTsMap:{native:NOW-2000},usd_to_eur_rate:0.9,last_cache_update_ms:NOW-2000,
    lastInfoMetaRows:[['Flare','INFO_NATIVE','native=FLR','','','',''],['Flare','INFO_TOTAL','Total portefeuille (sum value_eur).','','','',0.14]]};
}
const native = out=>out.find(r=>r[3]==='native');
const total = out=>out.find(r=>r[1]==='INFO_TOTAL');
const unknownErr = out=>out.some(r=>r[1]==='ERROR'&&String(r[2]).indexOf('NATIVE_PRICE_UNKNOWN')===0);

// ---------- Rendu CACHE_ONLY ----------
test('rendu : prix wallet perime (2 h) mais prix natif observe il y a 10 min => valeur, total chiffre, provenance tracee, 0 HTTP', () => {
  const h = harness({cache: staleCache(120*MIN), store:{v:1,refreshedAt:NOW-10*MIN,entries:{[FLARE_ID]:{usd:0.025,eur:0.0225,fx:0.9,fxCollectedAt:NOW-10*MIN,observedAt:NOW-10*MIN,fetchedAt:NOW-10*MIN,src:'llama-native'}}}});
  const out = h.run();
  assert.equal(unknownErr(out), false, JSON.stringify(out));
  assert.equal(native(out)[5], 0.0225);
  assert.ok(Math.abs(total(out)[6] - 7*0.0225) < 1e-12, JSON.stringify(total(out)));
  const info = out.find(r=>r[1]==='INFO_NATIVE');
  assert.match(String(info[2]), /price=llama-native observedAt=.* balanceAt=/);
  assert.equal(h.http.length, 0);
});

const freshStore = {v:1,refreshedAt:NOW-5*MIN,entries:{[FLARE_ID]:{usd:0.025,eur:0.0225,fx:0.9,fxCollectedAt:NOW-5*MIN,observedAt:NOW-5*MIN,fetchedAt:NOW-5*MIN,src:'llama-native'}}};
test('rendu : prix frais mais solde natif de 7 h (hors contrat wallet 6 h) => UNKNOWN, aucun total chiffre', () => {
  const cache = staleCache(8*60*MIN); cache.balanceTsMap = {native: NOW-7*60*MIN};
  const out = harness({cache, store: freshStore}).run();
  assert.equal(unknownErr(out), true);
  assert.equal(total(out)[6], '');
});

test('rendu : prix frais mais solde natif sans horodatage => UNKNOWN', () => {
  const cache = staleCache(120*MIN); delete cache.balanceTsMap;
  const out = harness({cache, store: freshStore}).run();
  assert.equal(unknownErr(out), true);
  assert.equal(total(out)[6], '');
});

test('rendu : observation du magasin aussi perimee (95 min) => UNKNOWN conserve, jamais zero', () => {
  const h = harness({cache: staleCache(120*MIN), store:{v:1,refreshedAt:NOW-95*MIN,entries:{[FLARE_ID]:{usd:0.025,eur:0.0225,fx:0.9,fxCollectedAt:NOW-95*MIN,observedAt:NOW-95*MIN,fetchedAt:NOW-95*MIN,src:'llama-native'}}}});
  const out = h.run();
  assert.equal(unknownErr(out), true);
  assert.equal(native(out)[5], '');
  assert.equal(total(out)[6], '');
});

test('rendu : magasin absent => comportement LIVE inchange (UNKNOWN)', () => {
  const out = harness({cache: staleCache(120*MIN)}).run();
  assert.equal(unknownErr(out), true);
  assert.equal(total(out)[6], '');
});

test('rendu : prix wallet frais => le magasin n est pas consulte (aucune annotation)', () => {
  const h = harness({cache: staleCache(10*MIN), store:{v:1,refreshedAt:NOW,entries:{[FLARE_ID]:{usd:9,eur:8.1,fx:0.9,fxCollectedAt:NOW-MIN,observedAt:NOW-MIN,fetchedAt:NOW,src:'llama-native'}}}});
  const out = h.run();
  assert.equal(native(out)[5], 0.02);
  assert.doesNotMatch(String(out.find(r=>r[1]==='INFO_NATIVE')[2]), /price=/);
});

// ---------- Integrite des horodatages ----------
test('computePriceEur : reutilisation d un prix en cache => provenance CACHE avec la date d origine', () => {
  const h = harness({cache: staleCache(10*MIN)});
  const cfg = h.c._FLARE.getConfig();
  const pm = {'native@flare':0.02}, pts = {'native@flare':NOW-30*MIN};
  const eur = h.c.PriceManager.computePriceEur({contract:'native',symbol:'FLR'},'native@flare',null,0.9,pm,pts,{},NOW,null,{},cfg);
  assert.equal(eur, 0.02);
  assert.deepEqual(clone(h.c.PriceManager._lastPriceMeta), {src:'CACHE', observedAt: NOW-30*MIN});
});

test('llamaPriceUsd : date d observation fournie par la source, conservee en L1', () => {
  const h = harness({cache: staleCache(10*MIN), httpResult: () => ({coins:{[FLARE_ID]:{price:0.025,timestamp:(NOW-3*MIN)/1000,confidence:0.99}}})});
  const cfg = h.c._FLARE.getConfig();
  const usd = h.c.PriceSources.llamaPriceUsd(FLARE_ID, null, cfg);
  assert.equal(usd, 0.025);
  assert.equal(h.c.PriceRunCache.llamaTs[FLARE_ID], NOW-3*MIN);
  const l1Entry = [...h.l1.entries()].find(([k])=>k.indexOf('LLAMA:')===0);
  assert.ok(l1Entry, 'entree L1 attendue');
  assert.equal(JSON.parse(l1Entry[1]).t, NOW-3*MIN);
});

test('llamaPriceUsd : entree L1 historique sans date => observation non attestee (null)', () => {
  const h = harness({cache: staleCache(10*MIN)});
  const cfg = h.c._FLARE.getConfig();
  const key = 'LLAMA:' + h.c._pxL1ChainKey(cfg) + ':' + FLARE_ID;
  h.l1.set(key, JSON.stringify({u:0.025}));
  assert.equal(h.c.PriceSources.llamaPriceUsd(FLARE_ID, null, cfg), 0.025);
  assert.equal(h.c.PriceRunCache.llamaTs[FLARE_ID], null);
  assert.equal(h.http.length, 0);
});

// ---------- Magasin de prix natifs ----------
test('NativePriceStore.ingest : date source, rejets sans date / confiance faible / futur / plus ancien', () => {
  const h = harness({cache: staleCache(10*MIN)});
  const S = h.c.NativePriceStore;
  assert.ok(S, '07N_NATIVE_PRICE_STORE absent');
  const store = {v:1,refreshedAt:0,entries:{'coingecko:old':{usd:1,eur:0.9,fx:0.9,observedAt:NOW-MIN}}};
  const n = S.ingest(store, {coins:{
    'coingecko:ok':{price:2,timestamp:(NOW-2*MIN)/1000,confidence:0.99},
    'coingecko:nots':{price:2,confidence:0.99},
    'coingecko:lowconf':{price:2,timestamp:(NOW-MIN)/1000,confidence:0.3},
    'coingecko:future':{price:2,timestamp:(NOW+60*MIN)/1000,confidence:0.99},
    'coingecko:old':{price:5,timestamp:(NOW-30*MIN)/1000,confidence:0.99},
    'coingecko:zero':{price:0,timestamp:(NOW-MIN)/1000}
  }}, 0.9, NOW);
  assert.equal(n, 1);
  assert.deepEqual(clone(store.entries['coingecko:ok']), {usd:2,eur:1.8,fx:0.9,fxCollectedAt:null,observedAt:NOW-2*MIN,fetchedAt:NOW,src:'llama-native'});
  assert.equal(store.entries['coingecko:old'].usd, 1);
  assert.equal(store.entries['coingecko:nots'], undefined);
});

test('NativePriceStore.get : fenetre stricte, aucune prolongation', () => {
  const S = harness({cache: staleCache(10*MIN)}).c.NativePriceStore;
  const store = {entries:{a:{eur:1,observedAt:NOW-89*MIN},b:{eur:1,observedAt:NOW-90*MIN},c:{eur:0,observedAt:NOW}}};
  assert.equal(S.get('a',90*MIN,NOW,store).eur, 1);
  assert.equal(S.get('b',90*MIN,NOW,store), null);
  assert.equal(S.get('c',90*MIN,NOW,store), null);
  assert.equal(S.get('zz',90*MIN,NOW,store), null);
});

test('NativePriceStore.refreshIfDue : 1 HTTP groupe, chaines desactivees exclues, NOT_DUE < 25 min, FX en cache requis (aucune cascade)', () => {
  const h = harness({cache: staleCache(10*MIN), httpResult: url => {
    const ids = url.split('/prices/current/')[1].split(',');
    return {coins:Object.fromEntries(ids.map(id=>[id,{price:1.5,timestamp:(NOW-MIN)/1000,confidence:0.99}]))};
  }});
  const S = h.c.NativePriceStore;
  h.c.ChainFactory._registry = {
    A:{getConfig:()=>({CHAIN:{NATIVE_LLAMA_ID:'coingecko:ethereum'}})},
    B:{getConfig:()=>({CHAIN:{NATIVE_LLAMA_ID:'coingecko:ethereum'}})},
    C:{getConfig:()=>({CHAIN:{NATIVE_LLAMA_ID:'coingecko:celo'}})},
    D:{getConfig:()=>({CHAIN:{NATIVE_LLAMA_ID:'coingecko:ancient8'},FLAGS:{DISABLE_CHAIN:true}})}
  };
  h.c.GlobalFxCache = {load:()=>({rates:{USD_EUR:{rate:0.9,ts:NOW-7*60*MIN}}})}; // FX hors contrat 6 h
  assert.equal(S.refreshIfDue({nowMs:NOW}).reason, 'FX_UNAVAILABLE');
  assert.equal(h.http.length, 0);
  h.c.GlobalFxCache = {load:()=>({rates:{USD_EUR:{rate:0.9,ts:NOW-30*MIN}}})};
  const r = S.refreshIfDue({nowMs:NOW});
  assert.equal(r.reason, 'OK'); assert.equal(r.ids, 2); assert.equal(r.http, 1); assert.equal(r.written, 2);
  assert.doesNotMatch(h.http[0], /ancient8/);
  assert.equal(S.refreshIfDue({nowMs:NOW+10*MIN}).reason, 'NOT_DUE');
  assert.equal(h.http.length, 1);
  assert.equal(S.get('coingecko:celo',90*MIN,NOW).eur, 1.35);
  assert.equal(S.load().entries['coingecko:celo'].fxCollectedAt, NOW-30*MIN);
});
