// F1 elargi (2026-11-08) — P1-DATA-NATIVE-PRICE-FRESHNESS : integrite de la valorisation EUR.
// Contrat : une valeur EUR presentee comme fraiche exige (A) un prix USD admissible et date,
// (B) un taux USD/EUR frais (< FX_TTL_MS) avec provenance et date attestees, (C) un solde date
// pour une valeur detenue. Date effective = composant le plus ancien. Jamais de taux fixe 0,85,
// jamais UNKNOWN -> 0, jamais de quantite effacee.
// Code reel : 01_INIT, 02, 03_HTTP, 04A, 04C, 04E, 07, 10_OUTPUT, 10A_BASE_ENGINE, 11_EVM_ENGINE,
// 19_CHAIN_FACTORY, 24, FLARE. Les blocs du scan EVM (prix natif, jetons, repli) sont extraits
// tels quels de 11_EVM_ENGINE et executes dans ce contexte reel. Aucun reseau reel.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '../src');
const NOW = 1800000000000, MIN = 60000, H = 60 * MIN;
const FX_KEY = 'GLOBAL_FX_CACHE_V1', L1_FX = 'FX:USD_EUR', STORE_KEY = 'WCORE_NATIVE_PRICE_STORE_V1';
const FLARE_ID = 'coingecko:flare-networks';
const TOKEN = '0x' + 'cd'.repeat(20);
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const newStorage = () => ({ props: new Map(), cache: new Map() });
const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body), getAllHeaders: () => ({}) });
const isFxUrl = u => /frankfurter|open\.er-api|coinbase|euro-coin/.test(u);
const FX_OK = url => {
  if (url.indexOf('frankfurter') >= 0) return resp(200, { date: '2026-11-07', rates: { USD: 1 / 0.91 } });
  if (url.indexOf('open.er-api') >= 0) return resp(200, { rates: { EUR: 0.91 } });
  if (url.indexOf('coinbase') >= 0) return resp(200, { data: { rates: { EUR: '0.91' } } });
  if (url.indexOf('euro-coin') >= 0) return resp(200, { coins: { 'coingecko:euro-coin': { price: 1 / 0.91 } } });
  return null;
};

function execution(storage, options = {}) {
  const clock = { now: options.now || NOW };
  const fetches = [];
  const props = {
    getProperty: k => storage.props.has(k) ? storage.props.get(k) : null,
    setProperty: (k, v) => { storage.props.set(k, String(v)); }, deleteProperty: k => { storage.props.delete(k); },
    getProperties: () => Object.fromEntries(storage.props), getKeys: () => Array.from(storage.props.keys()),
    setProperties: o => { for (const k of Object.keys(o)) storage.props.set(k, String(o[k])); }
  };
  const cache = {
    get: k => storage.cache.has(k) ? storage.cache.get(k) : null, put: (k, v) => { storage.cache.set(k, String(v)); },
    remove: k => { storage.cache.delete(k); }, removeAll: ks => ks.forEach(k => storage.cache.delete(k)),
    getAll: ks => Object.fromEntries(ks.filter(k => storage.cache.has(k)).map(k => [k, storage.cache.get(k)])),
    putAll: m => { for (const k of Object.keys(m)) storage.cache.set(k, String(m[k])); }
  };
  const c = {
    console, Logger: { log() {} }, PriceManager: {}, WCORE_STABLECOINS: {},
    PropertiesService: { getScriptProperties: () => props, getUserProperties: () => props, getDocumentProperties: () => props },
    CacheService: { getScriptCache: () => cache, getUserCache: () => cache, getDocumentCache: () => cache },
    Session: { getScriptTimeZone: () => 'UTC' }, Utilities: { formatDate: d => new Date(d).toISOString(), sleep() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => null },
    RpcClient: { call() { throw new Error('RPC inattendu'); }, getNativeBalance() { throw new Error('RPC inattendu'); } },
    UrlFetchApp: {
      fetch(url, params) { fetches.push({ url, params: clone(params) }); const r = options.fetch ? options.fetch(url, params, clock) : resp(404, {}); if (r instanceof Error) throw r; return r || resp(404, {}); },
      fetchAll() { throw new Error('fetchAll inattendu'); }
    },
    LockService: { getScriptLock() { throw new Error('lock unavailable'); } }
  };
  vm.createContext(c);
  c.fixtureNow = () => clock.now;
  vm.runInContext('Date.now = fixtureNow;', c);
  for (const f of ['01_INIT.gs', '02_UTILS.gs', '03_HTTP.gs', '04A_CACHE_CORE.gs', '04C_CACHE_GLOBAL.gs', '04E_FX_METADATA.gs',
    '07_PRICES.gs', '10_OUTPUT.gs', '10A_BASE_ENGINE.gs', '11_EVM_ENGINE.gs', '19_CHAIN_FACTORY.gs', '24_DEGRADED_MODE.gs', 'FLARE.gs'])
    vm.runInContext(read(f), c, { filename: f });
  if (c.DegradedMode) c.DegradedMode.isCircuitBreakerActive = () => false;
  return { c, clock, fetches, fxFetches: () => fetches.filter(f => isFxUrl(f.url)).length };
}
const seedFx = (st, ts, rate = 0.91, ver) => {
  st.cache.set(L1_FX, rate + '|' + ver + '|' + ts);
  st.props.set(FX_KEY, JSON.stringify({ rates: { USD_EUR: { rate, ts } }, USD_EUR: { rate, ts }, updatedAt: ts }));
};
const VER = (() => { const e = execution(newStorage()); return e.c.FxRate._CURRENT_VERSION; })();
const fail503 = () => resp(503, {});

// --- Blocs reels du scan EVM ------------------------------------------------
const evmSrc = () => read('11_EVM_ENGINE.gs').replace(/\r\n/g, '\n');
function block(startMarker, endMarker) {
  const s = evmSrc(); const a = s.indexOf(startMarker); const b = s.indexOf(endMarker, a);
  assert.ok(a > 0 && b > a, 'bloc introuvable : ' + startMarker.trim());
  return s.slice(a, b);
}
const NATIVE_BLOCK = () => block(' if (natAsset) {\n var pNat = PriceManager.computePriceEur(', ' // Token prices');
const TOKEN_BLOCK = () => block(' // Token prices', ' // Fallback pricing (Llama/CoinGecko)');
const FALLBACK_BLOCK = () => block(' // Fallback pricing (Llama/CoinGecko)', ' // v4.14.4: Stale price preservation');

// Etat de scan apres l'appel reel de getFxRateStrict (ou, sur le LIVE, de getFxRate).
function scanState(e, cache) {
  const state = { nowMs: e.clock.now, timer: { isLow: () => false, elapsed: () => 0 }, assets: [], attemptTsMap: {},
    priceMap: { 'native@flare': 0.02, native: 0.02, [TOKEN]: 1.5 },
    priceTsMap: { 'native@flare': NOW - 200 * MIN, native: NOW - 200 * MIN, [TOKEN]: NOW - 200 * MIN } };
  if (typeof e.c.BaseEngine.getFxRateStrict === 'function') e.c.BaseEngine.getFxRateStrict(state, cache || null);
  else e.c.BaseEngine.getFxRate(state, cache || null);
  return state;
}
function runNative(e, state, meta, usdPrice) {
  const natAsset = { contract: 'native', symbol: 'FLR', balance: 7 };
  e.c.PriceManager.computePriceEur = function(_a, _k, _m, fx) {
    this._lastPriceMeta = meta; return (fx && fx > 0) ? usdPrice * fx : null;
  };
  e.c.__t = { state, natAsset, config: { KEYS: { NATIVE_PRICE: 'native@flare' } }, priceUsdMap: {}, budget: {} };
  vm.runInContext('(function(t){ var state=t.state, natAsset=t.natAsset, config=t.config, priceUsdMap=t.priceUsdMap, budget=t.budget, applied=0;\n' + NATIVE_BLOCK() + '\n t.applied=applied; })(__t);', e.c);
  return { state, natAsset, applied: e.c.__t.applied };
}
function runTokens(e, state, usd) {
  const aP = { contract: TOKEN, balance: 3 };
  state.assets = [aP];
  e.c.__t = { state, config: { TIMEOUTS: { SAFE_SAVE_MARGIN_MS: 100 } }, priceUsdMap: { [TOKEN]: { priceUsd: usd } }, metaMap: {}, budget: { maxPriceLookups: 0 } };
  vm.runInContext('(function(t){ var state=t.state, config=t.config, priceUsdMap=t.priceUsdMap, metaMap=t.metaMap, budget=t.budget, applied=0;\n' + TOKEN_BLOCK() + '\n })(__t);', e.c);
  return aP;
}
function runFallback(e, state, meta, usd) {
  const af = { contract: TOKEN, balance: 3 };
  state.assets = [af];
  e.c.PriceManager.computePriceEur = function(_a, _k, _m, fx) { this._lastPriceMeta = meta; return (fx && fx > 0) ? usd * fx : null; };
  e.c.__t = { state, config: { TIMEOUTS: { SAFE_SAVE_MARGIN_MS: 100 } }, budget: { allowLlamaCg: true, maxPriceLookups: 5 } };
  vm.runInContext('(function(t){ var state=t.state, config=t.config, budget=t.budget;\n' + FALLBACK_BLOCK() + '\n })(__t);', e.c);
  return af;
}
// Rendu reel CACHED_WALLET_ASSETS_FLARE (11_EVM, chemin de la fonction personnalisee).
function renderFlare(e, wc) {
  const c = e.c;
  c.WalletCache = { load: () => clone(wc), save() {}, getLastUpdateStr: () => 'fixture-cache-time' };
  c.MetaCache = { load: () => ({}) };
  c.AssetManager = c.AssetManager || {}; c.AssetManager.normalizeMetadata = () => {};
  c.WalletNames = { get: (_a, n) => n };
  c.BaseEngine.isSystemBlocked = () => false;
  c._webScanCacheTimestamp_ = cc => cc.last_cache_update_ms || 0;
  return c.CACHED_WALLET_ASSETS_FLARE('fixture-wallet', 'fixture-J1');
}
const wcFromState = (state, t, { balance = 7, balanceAgeMs = 20 * MIN } = {}) => ({
  assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance }],
  priceMap: { 'native@flare': state.priceMap['native@flare'] }, priceTsMap: { 'native@flare': state.priceTsMap['native@flare'] },
  balanceTsMap: { native: t - balanceAgeMs }, usd_to_eur_rate: state.fxRate, fxMetadata: EVM_PERSISTS_FX_METADATA ? (state.fxMetadata || null) : null, last_cache_update_ms: t - MIN,
  lastInfoMetaRows: [['Flare', 'INFO_NATIVE', 'native=FLR', '', '', '', ''], ['Flare', 'INFO_FX', 'fx', '', '', '', ''], ['Flare', 'INFO_TOTAL', 'Total portefeuille (sum value_eur).', '', '', '', 0]] });
// Fixture fidele au code teste : le cache simule ne porte fxMetadata que si 11_EVM le persiste.
const EVM_PERSISTS_FX_METADATA = /^\s*fxMetadata:/m.test(evmSrc());
const isNpu = out => out.some(r => r[1] === 'ERROR' && String(r[2]).indexOf('NATIVE_PRICE_UNKNOWN') === 0);
const totalRow = out => out.find(r => r[1] === 'INFO_TOTAL');
const nativeRow = out => out.find(r => r[3] === 'native');
const storeWith = (st, { obsAgo, fxAgo, t = NOW }) => st.cache.set(STORE_KEY, JSON.stringify({ v: 1, refreshedAt: t - 5 * MIN, entries: {
  [FLARE_ID]: { usd: 0.025, eur: 0.0225, fx: 0.9, fxCollectedAt: fxAgo == null ? null : t - fxAgo, observedAt: t - obsAgo, fetchedAt: t - 5 * MIN, src: 'llama-native' } } }));

// ---------------------------------------------------------------------------
// 1 a 8 : composants USD et FX
// ---------------------------------------------------------------------------
test('V1 USD 10 min + FX 10 min : valorisation autorisee, date effective = composant le plus ancien', () => {
  const st = newStorage(); seedFx(st, NOW - 10 * MIN, 0.91, VER);
  const e = execution(st);
  const state = scanState(e);
  assert.equal(state.fxFresh, true); assert.equal(state.fxObservedAt, NOW - 10 * MIN);
  const r = runNative(e, state, { src: 'LLAMA', observedAt: NOW - 10 * MIN + 30000 }, 0.025);
  assert.ok(Math.abs(r.natAsset.price_eur - 0.025 * 0.91) < 1e-12);
  assert.equal(r.state.priceTsMap.native, NOW - 10 * MIN, 'date effective = FX (plus ancien que le prix USD)');
  assert.equal(r.state.priceTsMap['native@flare'], NOW - 10 * MIN);
  const out = renderFlare(execution(st, { now: NOW + MIN }), wcFromState(r.state, NOW + MIN));
  assert.equal(isNpu(out), false); assert.ok(totalRow(out)[6] > 0);
});

test('V2 USD 10 min + FX 3 h (RETAINED) : aucune valorisation fraiche, historique conserve sans nouvelle date', () => {
  const st = newStorage(); seedFx(st, NOW - 3 * H, 0.93, VER);
  const e = execution(st, { fetch: fail503 });
  const state = scanState(e);
  assert.equal(state.fxFresh, false); assert.equal(state.fxKind, 'RETAINED'); assert.equal(state.fxObservedAt, NOW - 3 * H);
  const r = runNative(e, state, { src: 'LLAMA', observedAt: NOW - 10 * MIN }, 0.025);
  assert.equal(r.state.priceTsMap.native, NOW - 200 * MIN, 'aucun reestampillage');
  assert.equal(r.state.priceMap.native, 0.02, 'prix historique conserve');
  assert.equal(r.natAsset.price_eur, 0.02, 'sortie : prix historique (date d origine), pas une conversion au FX de 3 h');
  const out = renderFlare(execution(st, { now: NOW + MIN }), wcFromState(r.state, NOW + MIN));
  assert.equal(isNpu(out), true); assert.equal(totalRow(out)[6], '');
  // r2 : INFO_FX ne revendique jamais une fraicheur qu'il ne peut garantir pour les valeurs affichees.
  assert.doesNotMatch(String(out.find(x => x[1] === 'INFO_FX')[2]), /freshness=FRESH/);
});

test('V3 USD perime (2 h) + FX recent : valeur datee par le prix USD, rendue UNKNOWN', () => {
  const st = newStorage(); seedFx(st, NOW - 5 * MIN, 0.91, VER);
  const e = execution(st);
  const r = runNative(e, scanState(e), { src: 'LLAMA', observedAt: NOW - 2 * H }, 0.025);
  assert.equal(r.state.priceTsMap.native, NOW - 2 * H);
  assert.equal(isNpu(renderFlare(execution(st, { now: NOW + MIN }), wcFromState(r.state, NOW + MIN))), true);
});

test('V4 USD recent + FX absent (aucun cache) : aucun taux, aucune valorisation, UNKNOWN au rendu', () => {
  const st = newStorage();
  const e = execution(st, { fetch: fail503 });
  const state = scanState(e);
  assert.equal(state.fxRate, null, 'jamais de taux fixe'); assert.equal(state.fxKind, 'UNAVAILABLE'); assert.equal(state.fxFresh, false);
  const r = runNative(e, state, { src: 'LLAMA', observedAt: NOW - MIN }, 0.025);
  assert.equal(r.state.priceTsMap.native, NOW - 200 * MIN);
  assert.equal(isNpu(renderFlare(execution(st, { now: NOW + MIN }), wcFromState(r.state, NOW + MIN))), true);
});

test('V5 taux fixe 0,85 : jamais utilise par la valorisation EVM ; le contrat historique getFxRate (SVM/Cosmos) reste inchange', () => {
  const st = newStorage();
  const e = execution(st, { fetch: fail503 });
  const state = scanState(e);
  assert.notEqual(state.fxRate, 0.85);
  const legacy = { timer: null };
  assert.equal(e.c.BaseEngine.getFxRate(legacy, null), 0.85, 'getFxRate partage : comportement historique conserve (hors perimetre EVM)');
  const r = runNative(e, state, { src: 'LLAMA', observedAt: NOW - MIN }, 0.025);
  assert.equal(r.natAsset.price_eur, 0.02, 'aucune valeur calculee avec 0,85');
});

test('V6 FX RETAINED : sa vraie date est conservee dans l etat et les metadonnees (STALE, applied=false)', () => {
  const st = newStorage(); seedFx(st, NOW - 3 * H, 0.93, VER);
  const e = execution(st, { fetch: fail503 });
  const state = scanState(e);
  assert.equal(state.fxObservedAt, NOW - 3 * H);
  assert.equal(state.fxMetadata.sourceCollectedAt, NOW - 3 * H); assert.equal(state.fxMetadata.applied, false);
  assert.match(e.c._fxMetadataLabel_(state.fxRate, state.fxMetadata, NOW), /freshness=STALE/);
});

test('V7 frontiere FX : 59 min frais (valorisation), 61 min non frais (aucune valorisation)', () => {
  for (const [age, fresh] of [[59 * MIN, true], [61 * MIN, false]]) {
    const st = newStorage(); seedFx(st, NOW - age, 0.91, VER);
    const e = execution(st, { fetch: fail503 });
    const state = scanState(e);
    assert.equal(state.fxFresh, fresh, String(age));
    const r = runNative(e, state, { src: 'LLAMA', observedAt: NOW - MIN }, 0.025);
    assert.equal(r.state.priceTsMap.native, fresh ? NOW - age : NOW - 200 * MIN);
  }
});

test('V8 reponse FX datee dans le futur (+10 min) : rejetee, aucune valorisation', () => {
  const st = newStorage(); seedFx(st, NOW + 10 * MIN, 0.91, VER);
  const e = execution(st, { fetch: fail503 });
  const state = scanState(e);
  assert.equal(state.fxFresh, false);
  const r = runNative(e, state, { src: 'LLAMA', observedAt: NOW - MIN }, 0.025);
  assert.equal(r.state.priceTsMap.native, NOW - 200 * MIN);
  assert.equal(e.c.GlobalFxCache.persistRate('USD_EUR', 0.9, NOW + 10 * MIN), false);
});

// ---------------------------------------------------------------------------
// 9 a 12 : solde, zero atteste, scan degrade, jetons
// ---------------------------------------------------------------------------
test('V9 solde natif > 6 h : UNKNOWN meme avec prix USD et FX recents (magasin)', () => {
  const st = newStorage(); storeWith(st, { obsAgo: 5 * MIN, fxAgo: 10 * MIN });
  const out = renderFlare(execution(st), { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 7 }],
    priceMap: { 'native@flare': 0.02 }, priceTsMap: { 'native@flare': NOW - 3 * H }, balanceTsMap: { native: NOW - 6 * H - MIN },
    usd_to_eur_rate: 0.9, last_cache_update_ms: NOW - 3 * H, lastInfoMetaRows: [['Flare', 'INFO_TOTAL', 'Total portefeuille (sum value_eur).', '', '', '', 0]] });
  assert.equal(isNpu(out), true); assert.equal(nativeRow(out)[5], ''); assert.equal(totalRow(out)[6], '');
});

test('V10 solde atteste a zero : total 0 conserve, sans NATIVE_PRICE_UNKNOWN', () => {
  const st = newStorage();
  const out = renderFlare(execution(st), { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 0 }],
    priceMap: {}, priceTsMap: {}, balanceTsMap: { native: NOW - MIN }, usd_to_eur_rate: 0.9, last_cache_update_ms: NOW - MIN,
    lastInfoMetaRows: [['Flare', 'INFO_TOTAL', 'Total portefeuille (sum value_eur).', '', '', '', 0]] });
  assert.equal(isNpu(out), false); assert.strictEqual(totalRow(out)[6], 0);
});

test('V11 scan degrade (FX indisponible) apres cache valide : prix, dates et quantite historiques intacts', () => {
  const st = newStorage(); seedFx(st, NOW - 2 * H, 0.91, VER);
  const e = execution(st, { fetch: fail503 });
  const state = scanState(e, { usd_to_eur_rate: 0.9 });
  const before = clone({ p: state.priceMap, t: state.priceTsMap });
  const r = runNative(e, state, { src: 'LLAMA', observedAt: NOW - MIN }, 0.025);
  const tok = runTokens(e, state, 2);
  assert.deepEqual(clone({ p: r.state.priceMap, t: r.state.priceTsMap }), before);
  assert.equal(r.natAsset.balance, 7); assert.equal(tok.balance, 3);
  assert.equal(tok.price_eur, undefined, 'jeton : aucune conversion au FX non frais');
});

test('V12 jetons : FX frais => date effective <= date FX ; FX non frais => aucune date ni prix nouveaux (BulkPriceFetch et repli)', () => {
  const st1 = newStorage(); seedFx(st1, NOW - 20 * MIN, 0.91, VER);
  const e1 = execution(st1);
  const s1 = scanState(e1);
  const a1 = runTokens(e1, s1, 2);
  assert.ok(Math.abs(a1.price_eur - 2 * 0.91) < 1e-12);
  assert.equal(s1.priceTsMap[TOKEN], NOW - 20 * MIN, 'jamais plus recent que le FX');
  const st2 = newStorage(); seedFx(st2, NOW - 3 * H, 0.93, VER);
  const e2 = execution(st2, { fetch: fail503 });
  const s2 = scanState(e2);
  runTokens(e2, s2, 2);
  assert.equal(s2.priceTsMap[TOKEN], NOW - 200 * MIN); assert.equal(s2.priceMap[TOKEN], 1.5);
  const af = runFallback(e2, s2, { src: 'LLAMA', observedAt: NOW - MIN }, 2);
  assert.equal(af.price_eur, undefined); assert.equal(s2.priceTsMap[TOKEN], NOW - 200 * MIN); assert.equal(s2.priceMap[TOKEN], 1.5);
  const s3 = scanState(e1);
  const af3 = runFallback(e1, s3, { src: 'LLAMA', observedAt: NOW - MIN }, 2);
  assert.ok(af3.price_eur > 0); assert.equal(s3.priceTsMap[TOKEN], NOW - 20 * MIN);
});

// ---------------------------------------------------------------------------
// Magasin natif, repli de sortie, bout en bout
// ---------------------------------------------------------------------------
test('V13 magasin natif : prix recent mais FX de l entree ancien (2 h) => UNKNOWN ; FX de l entree absent => UNKNOWN', () => {
  for (const fxAgo of [2 * H, null]) {
    const st = newStorage(); storeWith(st, { obsAgo: 5 * MIN, fxAgo });
    const out = renderFlare(execution(st), { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 7 }],
      priceMap: { 'native@flare': 0.02 }, priceTsMap: { 'native@flare': NOW - 3 * H }, balanceTsMap: { native: NOW - 30 * MIN },
      usd_to_eur_rate: 0.9, last_cache_update_ms: NOW - 3 * H, lastInfoMetaRows: [['Flare', 'INFO_NATIVE', 'n', '', '', '', ''], ['Flare', 'INFO_TOTAL', 'Total portefeuille (sum value_eur).', '', '', '', 0]] });
    assert.equal(isNpu(out), true, String(fxAgo)); assert.equal(totalRow(out)[6], '');
  }
});

test('V14 magasin natif : prix et FX de l entree recents => valeur, provenance annotee avec la date FX', () => {
  const st = newStorage(); storeWith(st, { obsAgo: 5 * MIN, fxAgo: 15 * MIN });
  const out = renderFlare(execution(st), { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 7 }],
    priceMap: { 'native@flare': 0.02 }, priceTsMap: { 'native@flare': NOW - 3 * H }, balanceTsMap: { native: NOW - 30 * MIN },
    usd_to_eur_rate: 0.9, last_cache_update_ms: NOW - 3 * H, lastInfoMetaRows: [['Flare', 'INFO_NATIVE', 'n', '', '', '', ''], ['Flare', 'INFO_TOTAL', 'Total portefeuille (sum value_eur).', '', '', '', 0]] });
  assert.equal(isNpu(out), false); assert.ok(totalRow(out)[6] > 0);
  assert.match(String(out.find(x => x[1] === 'INFO_NATIVE')[2]), /price=llama-native observedAt=.* balanceAt=.* fxAt=/);
});

test('V15 repli de sortie (_patchOutputNativePrice) : aucune revalorisation native avec un FX non frais, aucun appel FX reseau', () => {
  const st = newStorage(); seedFx(st, NOW - 3 * H, 0.93, VER);
  const e = execution(st, { fetch: url => (isFxUrl(url) ? resp(200, {}) : resp(200, { coins: { [FLARE_ID]: { price: 0.03, timestamp: NOW / 1000 } } })) });
  const out = [['chain_name', 'token_ticker', 'name', 'contract', 'balance', 'price_eur', 'value_eur'], ['Flare', 'FLR', 'Flare', 'native', 7, 0.02, 0.14], ['Flare', 'INFO_TOTAL', 'Total', '', '', '', 0.14]];
  const config = e.c._FLARE.getConfig();
  e.c.EvmEngine._patchOutputNativePrice(out, { cache: { usd_to_eur_rate: 0.93 }, fxRate: 0.93, timer: null }, config, 'Flare');
  assert.equal(out[1][5], 0.02, 'ligne native non revalorisee au FX de 3 h');
  assert.equal(e.fxFetches(), 0);
});

test('V16 bout en bout : reseau FX -> getFxRateStrict -> bloc natif reel -> cache -> rendu -> INFO_TOTAL ; puis vieillissement => UNKNOWN', () => {
  const st = newStorage();
  const e = execution(st, { fetch: route => FX_OK(route) });
  const state = scanState(e);
  assert.equal(state.fxFresh, true); assert.equal(state.fxKind, 'FRESH_NETWORK'); assert.equal(state.fxObservedAt, NOW);
  const r = runNative(e, state, { src: 'LLAMA', observedAt: NOW - 2 * MIN }, 0.025);
  assert.equal(r.state.priceTsMap.native, NOW - 2 * MIN);
  const t = NOW + 10 * MIN;
  const out = renderFlare(execution(st, { now: t }), wcFromState(r.state, t));
  assert.equal(isNpu(out), false);
  assert.ok(Math.abs(totalRow(out)[6] - 7 * 0.025 * 0.91) < 1e-9);
  assert.doesNotMatch(String(out.find(x => x[1] === 'INFO_FX')[2]), /freshness=FRESH/, 'r2 : aucune fraicheur FX affirmee par INFO_FX');
  const late = NOW - 2 * MIN + 90 * MIN;
  const stale = renderFlare(execution(st, { now: late, fetch: fail503 }), wcFromState(r.state, late));
  assert.equal(isNpu(stale), true); assert.equal(totalRow(stale)[6], '');
});
