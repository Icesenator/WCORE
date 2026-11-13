// Requalification 2026-11-07 (soir) : le harnais precedent ne chargeait pas 01_INIT et
// exercait donc une fenetre par defaut de 60 min. Ici 01_INIT est charge en premier :
// PRICE_STALE_MS = 90 min et WALLET_TTL_MS = 6 h, comme en LIVE.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = path.join(__dirname, '../src');
const NOW = 1800000000000;
const MIN = 60000;
const H = 60 * MIN;
const STORE_KEY = 'WCORE_NATIVE_PRICE_STORE_V1';
const FLARE_ID = 'coingecko:flare-networks';
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));

function harness(options = {}) {
  let clock = NOW;
  const http = [];
  const l1 = new Map();
  const c = {
    console, Logger:{log(){}}, PriceManager:{}, WCORE_STABLECOINS:{},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>null,getProperties:()=>({}),setProperty(){},deleteProperty(){}})},
    CacheService:{getScriptCache:()=>({get:k=>l1.has(k)?l1.get(k):null,put:(k,v)=>l1.set(k,v),getAll:ks=>Object.fromEntries(ks.filter(k=>l1.has(k)).map(k=>[k,l1.get(k)])),putAll(){}})},
    Session:{getScriptTimeZone:()=> 'UTC'},Utilities:{formatDate:d=>d.toISOString()},
    SpreadsheetApp:{getActiveSpreadsheet:()=>null},
    CacheManager:{init(){}},
    RpcClient:{call(){throw new Error('unexpected RPC');}},
    WalletCache:{load(){return clone(options.cache);},save(){},getLastUpdateStr:()=> 'fixture-cache-time'},
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
  const files = ['01_INIT.gs','02_UTILS.gs','04E_FX_METADATA.gs','07_PRICES.gs','10_OUTPUT.gs','11_EVM_ENGINE.gs','19_CHAIN_FACTORY.gs','24_DEGRADED_MODE.gs','FLARE.gs'];
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(SRC,file),'utf8'),c,{filename:file});
  c.DegradedMode.isCircuitBreakerActive = ()=>false;
  if (options.store) l1.set(STORE_KEY, JSON.stringify(options.store));
  return { c, l1, http, run:()=>c.CACHED_WALLET_ASSETS_FLARE('fixture-wallet','fixture-refresh') };
}
function cacheWith(priceAgeMs, balanceAgeMs = 2000) {
  return {assets:[{contract:'native',symbol:'FLR',name:'Flare',balance:7}],
    priceMap:{'native@flare':0.02},priceTsMap:{'native@flare':NOW-priceAgeMs},
    balanceTsMap: balanceAgeMs == null ? undefined : {native:NOW-balanceAgeMs},usd_to_eur_rate:0.9,last_cache_update_ms:NOW-2000,
    lastInfoMetaRows:[['Flare','INFO_NATIVE','native=FLR','','','',''],['Flare','INFO_TOTAL','Total portefeuille (sum value_eur).','','','',0.14]]};
}
const storeAt = obsAgeMs => ({v:1,refreshedAt:NOW-obsAgeMs,entries:{[FLARE_ID]:{usd:0.025,eur:0.0225,fx:0.9,fxCollectedAt:NOW-obsAgeMs,observedAt:NOW-obsAgeMs,fetchedAt:NOW-obsAgeMs,src:'llama-native'}}});
const native = out=>out.find(r=>r[3]==='native');
const total = out=>out.find(r=>r[1]==='INFO_TOTAL');
const unknownErr = out=>out.some(r=>r[1]==='ERROR'&&String(r[2]).indexOf('NATIVE_PRICE_UNKNOWN')===0);
const assertUnknown = out => { assert.equal(unknownErr(out), true, JSON.stringify(out)); assert.equal(native(out)[5], ''); assert.equal(total(out)[6], ''); };

test('01_INIT charge : PRICE_STALE_MS = 90 min et WALLET_TTL_MS = 6 h, propages a la config de chaine', () => {
  const h = harness({cache: cacheWith(10*MIN)});
  assert.equal(h.c.WCORE_CACHE_CONFIG.PRICE_STALE_MS, 90*MIN);
  assert.equal(h.c.WCORE_CACHE_CONFIG.WALLET_TTL_MS, 6*H);
  assert.equal(h.c._FLARE.getConfig().CACHE.PRICE_STALE_MS, 90*MIN);
});

test('rendu : prix wallet de 75 min (bande 60-90 min jamais exercee avant) => valeur wallet, aucun recours au magasin', () => {
  const h = harness({cache: cacheWith(75*MIN)});
  const out = h.run();
  assert.equal(unknownErr(out), false, JSON.stringify(out));
  assert.equal(native(out)[5], 0.02);
  assert.doesNotMatch(String(out.find(r=>r[1]==='INFO_NATIVE')[2]), /price=/);
  assert.equal(h.http.length, 0);
});

test('rendu : prix wallet de 91 min sans magasin => UNKNOWN, jamais zero ni total chiffre', () => {
  assertUnknown(harness({cache: cacheWith(91*MIN)}).run());
});

test('rendu : magasin observe a 89 min => valeur tracee ; a 90 min pile => UNKNOWN (borne stricte)', () => {
  const out89 = harness({cache: cacheWith(120*MIN), store: storeAt(89*MIN)}).run();
  assert.equal(native(out89)[5], 0.0225);
  assert.match(String(out89.find(r=>r[1]==='INFO_NATIVE')[2]), /price=llama-native observedAt=.* balanceAt=/);
  assertUnknown(harness({cache: cacheWith(120*MIN), store: storeAt(90*MIN)}).run());
});

test('rendu : solde natif a 5 h 59 => valeur ; a 6 h 01 => UNKNOWN (contrat wallet 6 h reel)', () => {
  const ok = harness({cache: cacheWith(120*MIN, 6*H - MIN), store: storeAt(5*MIN)}).run();
  assert.equal(native(ok)[5], 0.0225);
  assertUnknown(harness({cache: cacheWith(120*MIN, 6*H + MIN), store: storeAt(5*MIN)}).run());
});

test('rendu : solde natif sans horodatage => UNKNOWN meme avec prix frais', () => {
  assertUnknown(harness({cache: cacheWith(120*MIN, null), store: storeAt(5*MIN)}).run());
});

test('rendu : observation future au-dela de la tolerance d horloge (+10 min) => refusee, UNKNOWN', () => {
  const st = storeAt(5*MIN); st.entries[FLARE_ID].observedAt = NOW + 10*MIN;
  assertUnknown(harness({cache: cacheWith(120*MIN), store: st}).run());
});

test('rendu : prix wallet date dans le futur => non reutilise', () => {
  assertUnknown(harness({cache: cacheWith(-10*MIN)}).run());
});

test('computePriceEur : prix en cache de 80 min reutilise avec sa date d origine (pas de reestampillage)', () => {
  const h = harness({cache: cacheWith(10*MIN)});
  const cfg = h.c._FLARE.getConfig();
  const eur = h.c.PriceManager.computePriceEur({contract:'native',symbol:'FLR'},'native@flare',null,0.9,{'native@flare':0.02},{'native@flare':NOW-80*MIN},{},NOW,null,{},cfg);
  assert.equal(eur, 0.02);
  assert.deepEqual(clone(h.c.PriceManager._lastPriceMeta), {src:'CACHE', observedAt: NOW-80*MIN});
  assert.equal(h.http.length, 0);
});

test('computePriceEur : prix en cache de 95 min et aucune source disponible => null, aucun prix fabrique', () => {
  const h = harness({cache: cacheWith(10*MIN)});
  const cfg = h.c._FLARE.getConfig();
  const eur = h.c.PriceManager.computePriceEur({contract:'native',symbol:'FLR'},'native@flare',null,0.9,{'native@flare':0.02},{'native@flare':NOW-95*MIN},{},NOW,null,{},cfg);
  assert.equal(eur, null);
});

test('magasin : FX en cache absent ou hors contrat => FX_UNAVAILABLE, 0 HTTP, rien ecrit', () => {
  const h = harness({cache: cacheWith(10*MIN), httpResult: () => { throw new Error('HTTP inattendu'); }});
  const S = h.c.NativePriceStore;
  h.c.ChainFactory._registry = { A:{getConfig:()=>({CHAIN:{NATIVE_LLAMA_ID:'coingecko:ethereum'}})} };
  h.c.GlobalFxCache = {load:()=>({})};
  assert.equal(S.refreshIfDue({nowMs:NOW}).reason, 'FX_UNAVAILABLE');
  assert.equal(h.http.length, 0);
  assert.deepEqual(clone(S.load().entries), {});
});

// v4.17.0 : un seul appel de repli CoinGecko suit les lots DefiLlama, pour les ids "coingecko:" sans prix.
test('magasin : cout pire cas = ceil(ids/60) appels DefiLlama + 1 repli CoinGecko, aucun retry, lot de 95 ids => 3 appels ; prix absent => rien ecrit', () => {
  const h = harness({cache: cacheWith(10*MIN), httpResult: () => ({coins:{}})});
  const S = h.c.NativePriceStore;
  const reg = {}; for (let i = 0; i < 95; i++) reg['C' + i] = {getConfig:()=>({CHAIN:{NATIVE_LLAMA_ID:'coingecko:id-' + i}})};
  h.c.ChainFactory._registry = reg;
  h.c.GlobalFxCache = {load:()=>({rates:{USD_EUR:{rate:0.9,ts:NOW-30*MIN}}})};
  const r = S.refreshIfDue({nowMs:NOW});
  assert.equal(r.ids, 95); assert.equal(r.http, 3); assert.equal(h.http.length, 3);
  assert.equal(h.http.filter((u) => /coins\.llama\.fi/.test(u)).length, 2, 'deux lots DefiLlama, jamais rejoues');
  assert.equal(h.http.filter((u) => /api\.coingecko\.com/.test(u)).length, 1, 'un seul repli CoinGecko');
  assert.equal(r.written, 0); assert.equal(r.reason, 'NO_VALID_PRICE');
  assert.deepEqual(clone(S.load().entries), {});
  assert.equal(S.refreshIfDue({nowMs:NOW + 24*MIN}).reason, 'NOT_DUE');
  assert.equal(h.http.length, 3);
});

// Ancien residuel (todo jusqu'au 2026-11-07), corrige par le durcissement du 2026-11-08 :
// si Llama echoue, un repli natif servi par un L1 de 2 h sans date ne doit jamais
// laisser _lastPriceMeta = null (que le scan estampillerait "maintenant").
test('repli CoinGecko servi par L1 sans date => provenance explicite, observation non attestee', () => {
  const h = harness({cache: cacheWith(10*MIN)});
  const cfg = JSON.parse(JSON.stringify(h.c._FLARE.getConfig()));
  cfg.CHAIN.NATIVE_GECKO_ID = 'flare-networks'; delete cfg.CHAIN.NATIVE_PRICE_CONTRACT;
  h.l1.set(h.c._pxL1Key('CG', cfg, 'flare-networks'), JSON.stringify({u:0.025}));
  const eur = h.c.PriceManager.computePriceEur({contract:'native',symbol:'FLR'},'native@flare',null,0.9,{},{},{},NOW,null,{},cfg);
  assert.ok(eur > 0);
  assert.notEqual(h.c.PriceManager._lastPriceMeta, null, 'prix L1 non date retourne sans provenance');
  assert.deepEqual(clone(h.c.PriceManager._lastPriceMeta), {src:'COINGECKO', observedAt:null});
});
