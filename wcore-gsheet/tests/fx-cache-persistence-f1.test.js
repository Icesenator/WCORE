// F1 (2026-11-08) — P1-DATA-NATIVE-PRICE-FRESHNESS : persistance datee du taux USD->EUR.
// Code reel charge : 01_INIT (configuration LIVE), 02, 03_HTTP, 04A_CACHE_CORE, 04C_CACHE_GLOBAL,
// 04E, 07_PRICES, 10_OUTPUT, 11_EVM_ENGINE, 19_CHAIN_FACTORY, 24_DEGRADED_MODE, FLARE.
// GlobalFxCache et FxRate ne sont PAS bouchonnes. Chaque "execution" GAS est un contexte neuf
// (memoire vide) partageant le meme stockage (ScriptProperties + CacheService).
// Aucun reseau reel : UrlFetchApp est un routeur de fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '../src');
const NOW = 1800000000000;
const MIN = 60000;
const H = 60 * MIN;
const FX_KEY = 'GLOBAL_FX_CACHE_V1';
const L1_FX = 'FX:USD_EUR';
const STORE_KEY = 'WCORE_NATIVE_PRICE_STORE_V1';
const FLARE_ID = 'coingecko:flare-networks';
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const newStorage = () => ({ props: new Map(), cache: new Map() });
const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)), getAllHeaders: () => ({}) });

// Fixtures FX : 4 sources concordantes autour de 0.91 EUR/USD.
const FX_OK = url => {
  if (url.indexOf('frankfurter') >= 0) return resp(200, { rates: { USD: 1 / 0.91 } });
  if (url.indexOf('open.er-api') >= 0) return resp(200, { rates: { EUR: 0.91 } });
  if (url.indexOf('coinbase') >= 0) return resp(200, { data: { rates: { EUR: '0.91' } } });
  if (url.indexOf('euro-coin') >= 0) return resp(200, { coins: { 'coingecko:euro-coin': { price: 1 / 0.91 } } });
  return null;
};
const LLAMA = (tsSec, price = 0.025) => url => {
  if (url.indexOf('/prices/current/') < 0 || url.indexOf('euro-coin') >= 0) return null;
  const ids = decodeURIComponent(url.split('/prices/current/')[1] || '').split(',');
  const coins = {}; for (const id of ids) coins[id] = { price, timestamp: tsSec, confidence: 0.99 };
  return resp(200, { coins });
};
const route = (...handlers) => (url, params, clock) => {
  for (const h of handlers) { const r = h(url, params, clock); if (r) return r; }
  return resp(404, {});
};
const isFxUrl = u => /frankfurter|open\.er-api|coinbase|euro-coin/.test(u);

function execution(storage, options = {}) {
  const clock = { now: options.now || NOW };
  const fetches = [];
  const props = {
    getProperty: k => storage.props.has(k) ? storage.props.get(k) : null,
    setProperty: (k, v) => { if (options.propsFail) throw new Error('quota'); storage.props.set(k, String(v)); },
    deleteProperty: k => { storage.props.delete(k); },
    getProperties: () => Object.fromEntries(storage.props),
    getKeys: () => Array.from(storage.props.keys()),
    setProperties: o => { for (const k of Object.keys(o)) storage.props.set(k, String(o[k])); }
  };
  const cache = {
    get: k => storage.cache.has(k) ? storage.cache.get(k) : null,
    put: (k, v) => { storage.cache.set(k, String(v)); },
    remove: k => { storage.cache.delete(k); },
    getAll: ks => Object.fromEntries(ks.filter(k => storage.cache.has(k)).map(k => [k, storage.cache.get(k)])),
    putAll: m => { for (const k of Object.keys(m)) storage.cache.set(k, String(m[k])); },
    removeAll: ks => ks.forEach(k => storage.cache.delete(k))
  };
  const c = {
    console, Logger: { log() {} }, PriceManager: {}, WCORE_STABLECOINS: {},
    PropertiesService: { getScriptProperties: () => props, getUserProperties: () => props, getDocumentProperties: () => props },
    CacheService: { getScriptCache: () => cache, getUserCache: () => cache, getDocumentCache: () => cache },
    Session: { getScriptTimeZone: () => 'UTC' }, Utilities: { formatDate: d => new Date(d).toISOString(), sleep() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => null },
    RpcClient: { call() { throw new Error('RPC inattendu'); }, getNativeBalance() { throw new Error('RPC inattendu'); } },
    UrlFetchApp: {
      fetch(url, params) {
        fetches.push({ url, params: clone(params) });
        if (options.fetchDelayMs) clock.now += options.fetchDelayMs;
        const r = options.fetch ? options.fetch(url, params, clock) : resp(404, {});
        if (r instanceof Error) throw r;
        return r;
      },
      fetchAll() { throw new Error('fetchAll inattendu'); }
    },
    LockService: { getScriptLock() { throw new Error('lock unavailable'); } }
  };
  vm.createContext(c);
  c.fixtureNow = () => clock.now;
  vm.runInContext('Date.now = fixtureNow;', c);
  for (const f of ['01_INIT.gs', '02_UTILS.gs', '03_HTTP.gs', '04A_CACHE_CORE.gs', '04C_CACHE_GLOBAL.gs', '04E_FX_METADATA.gs',
    '07_PRICES.gs', '10_OUTPUT.gs', '11_EVM_ENGINE.gs', '19_CHAIN_FACTORY.gs', '24_DEGRADED_MODE.gs', 'FLARE.gs']) vm.runInContext(read(f), c, { filename: f });
  if (c.DegradedMode) c.DegradedMode.isCircuitBreakerActive = () => false;
  return { c, clock, fetches, fxFetches: () => fetches.filter(f => isFxUrl(f.url)).length };
}
const fxGet = e => { try { return e.c.FxRate.getUsdToEur(null); } catch (err) { return { error: String(err && err.message || err) }; } };
const persisted = st => { const raw = st.props.get(FX_KEY) || st.cache.get(FX_KEY); return raw ? JSON.parse(raw) : null; };
const persistedEntry = st => { const p = persisted(st); return p && p.rates && p.rates.USD_EUR || null; };

function renderFlare(exec, wc) {
  const c = exec.c;
  c.WalletCache = { load: () => clone(wc), save() {}, getLastUpdateStr: () => 'fixture-cache-time' };
  c.MetaCache = { load: () => ({}) };
  c.AssetManager = c.AssetManager || {}; c.AssetManager.normalizeMetadata = () => {};
  c.WalletNames = { get: (_a, n) => n };
  c.BaseEngine = c.BaseEngine || {}; c.BaseEngine.isSystemBlocked = () => false;
  c._webScanCacheTimestamp_ = cc => cc.last_cache_update_ms || 0;
  return c.CACHED_WALLET_ASSETS_FLARE('fixture-wallet', 'fixture-J1');
}
const walletCache = ({ now = NOW, priceAgeMs = 2 * H, balanceAgeMs = 30 * MIN } = {}) => ({
  assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 7 }],
  priceMap: { 'native@flare': 0.02 }, priceTsMap: { 'native@flare': now - priceAgeMs },
  balanceTsMap: { native: now - balanceAgeMs }, usd_to_eur_rate: 0.9, last_cache_update_ms: now - 2 * H,
  lastInfoMetaRows: [['Flare', 'INFO_NATIVE', 'native=FLR', '', '', '', ''], ['Flare', 'INFO_TOTAL', 'Total portefeuille (sum value_eur).', '', '', '', 0.14]] });
const nativeRow = out => out.find(r => r[3] === 'native');
const totalRow = out => out.find(r => r[1] === 'INFO_TOTAL');
const isNpu = out => out.some(r => r[1] === 'ERROR' && String(r[2]).indexOf('NATIVE_PRICE_UNKNOWN') === 0);

// ---------------------------------------------------------------------------
// A / B : demarrage a froid, puis seconde execution
// ---------------------------------------------------------------------------
test('F1-A demarrage a froid : taux recupere puis PERSISTE avec la date attestee de la recuperation reseau', () => {
  const st = newStorage();
  const e1 = execution(st, { fetch: route(FX_OK), fetchDelayMs: 1000 });
  const rate = fxGet(e1);
  assert.ok(Math.abs(rate - 0.91) < 1e-9, JSON.stringify(rate));
  assert.equal(e1.fxFetches(), 4);
  const entry = persistedEntry(st);
  assert.ok(entry, 'GLOBAL_FX_CACHE_V1 persiste en fin d execution');
  assert.ok(Math.abs(entry.rate - 0.91) < 1e-9);
  assert.equal(entry.ts, NOW + 4000, 'ts = instant de la reponse reseau (apres les 4 sources), pas un instant de lecture');
  assert.deepEqual(Object.keys(entry).sort(), ['rate', 'ts'], 'format {rate, ts} conserve');
  assert.match(String(st.cache.get(L1_FX)), /^0\.91\d*\|[^|]+\|1800000004000$/, 'L1 date : taux|version|ts');
});

test('F1-B seconde execution : taux et date relus, 0 appel reseau, aucun reestampillage', () => {
  const st = newStorage();
  fxGet(execution(st, { fetch: route(FX_OK) }));
  const ts0 = persistedEntry(st).ts;
  const e2 = execution(st, { now: NOW + 20 * MIN, fetch: route(FX_OK) });
  assert.ok(Math.abs(fxGet(e2) - 0.91) < 1e-9);
  assert.equal(e2.fxFetches(), 0);
  assert.equal(persistedEntry(st).ts, ts0, 'relecture : ts inchange');
  assert.equal(String(st.cache.get(L1_FX)).split('|')[2], String(ts0));
  const fx = e2.c.NativePriceStore._cachedFx(NOW + 20 * MIN);
  assert.equal(fx.collectedAt, ts0);
});

// ---------------------------------------------------------------------------
// C / D / E : fenetre de 1 h et cache intermediaire de 4 h
// ---------------------------------------------------------------------------
test('F1-C taux de 59 min : accepte (contrat FX_TTL_MS = 1 h), sans reseau', () => {
  const st = newStorage();
  fxGet(execution(st, { fetch: route(FX_OK) }));
  const ts0 = persistedEntry(st).ts;
  const e = execution(st, { now: ts0 + 59 * MIN, fetch: route(FX_OK) });
  assert.equal(e.c.NativePriceStore._cachedFx(ts0 + 59 * MIN).collectedAt, ts0);
  fxGet(e); assert.equal(e.fxFetches(), 0);
});

test('F1-D taux de 61 min : refuse par le magasin ; FxRate renouvelle avec une nouvelle date reseau', () => {
  const st = newStorage();
  fxGet(execution(st, { fetch: route(FX_OK) }));
  const ts0 = persistedEntry(st).ts;
  const t = ts0 + 61 * MIN;
  const e = execution(st, { now: t, fetch: route(FX_OK) });
  assert.equal(e.c.NativePriceStore._cachedFx(t), null, 'FX > 1 h jamais presente comme frais');
  fxGet(e);
  assert.equal(e.fxFetches(), 4, 'renouvellement reseau reel');
  assert.ok(persistedEntry(st).ts >= t, 'nouvelle date = nouvelle recuperation');
  assert.ok(execution(st, { now: t + MIN }).c.NativePriceStore._cachedFx(t + MIN));
});

test('F1-D2 taux de 61 min et renouvellement en echec : FX_UNAVAILABLE maintenu, taux ancien jamais reestampille', () => {
  const st = newStorage();
  fxGet(execution(st, { fetch: route(FX_OK) }));
  const ts0 = persistedEntry(st).ts;
  const t = ts0 + 61 * MIN;
  const e = execution(st, { now: t, fetch: () => resp(503, {}) });
  const r = fxGet(e);
  assert.equal(persistedEntry(st).ts, ts0, 'aucune nouvelle date sans nouvelle observation');
  assert.equal(String(st.cache.get(L1_FX)).split('|')[2], String(ts0));
  assert.equal(execution(st, { now: t }).c.NativePriceStore.refreshIfDue({ nowMs: t }).reason, 'FX_UNAVAILABLE');
  assert.ok(typeof r === 'number' || r.error, 'appelants historiques : taux de retention ou erreur, jamais un taux invente');
  if (typeof r === 'number') assert.ok(Math.abs(r - 0.91) < 1e-9);
});

test('F1-E cache intermediaire de 3 h (format historique sans date) : pas de fraicheur artificielle', () => {
  const st = newStorage();
  const e0 = execution(st);
  st.cache.set(L1_FX, '0.93|' + e0.c.FxRate._CURRENT_VERSION);
  const e = execution(st, { now: NOW, fetch: () => resp(503, {}) });
  const r = fxGet(e);
  assert.equal(e.fxFetches() > 0, true, 'un L1 sans date declenche un renouvellement');
  assert.equal(persistedEntry(st), null, 'le taux non date n est jamais persiste comme observation');
  assert.equal(execution(st).c.NativePriceStore._cachedFx(NOW), null);
  if (typeof r === 'number') assert.equal(r, 0.93);
});

test('F1-E2 cache intermediaire date de 3 h : refuse comme frais, ts conserve', () => {
  const st = newStorage();
  const e0 = execution(st);
  st.cache.set(L1_FX, '0.93|' + e0.c.FxRate._CURRENT_VERSION + '|' + (NOW - 3 * H));
  const e = execution(st, { now: NOW, fetch: () => resp(503, {}) });
  fxGet(e);
  assert.equal(String(st.cache.get(L1_FX)).split('|')[2], String(NOW - 3 * H));
  assert.equal(persistedEntry(st), null);
  assert.equal(execution(st).c.NativePriceStore._cachedFx(NOW), null);
});

// ---------------------------------------------------------------------------
// F / G / H / I : alimentation du magasin et garde-fous de valorisation
// ---------------------------------------------------------------------------
test('F1-F FX indisponible (toutes sources en echec) : aucune ecriture de prix natif, rendu UNKNOWN', () => {
  const st = newStorage();
  const e = execution(st, { fetch: route(() => resp(500, {}), LLAMA(NOW / 1000 - 60)) });
  fxGet(e);
  const r = e.c.NativePriceStore.refreshIfDue({ nowMs: NOW, budgetMs: 20000 });
  assert.equal(r.reason, 'FX_UNAVAILABLE'); assert.equal(r.written, 0); assert.equal(r.http, 0);
  assert.equal(st.cache.has(STORE_KEY), false);
  const out = renderFlare(execution(st), walletCache());
  assert.equal(isNpu(out), true); assert.equal(nativeRow(out)[5], ''); assert.equal(totalRow(out)[6], '');
});

test('F1-G FX renouvele : le watchdog suivant alimente le magasin avec la date source native', () => {
  const st = newStorage();
  fxGet(execution(st, { fetch: route(FX_OK) }));
  const wd = execution(st, { now: NOW + 10 * MIN, fetch: route(LLAMA((NOW + 9 * MIN) / 1000)) });
  const r = wd.c.NativePriceStore.refreshIfDue({ nowMs: NOW + 10 * MIN, budgetMs: 20000 });
  assert.equal(r.reason, 'OK'); assert.ok(r.written >= 1); assert.equal(r.http, 1);
  const e = JSON.parse(st.cache.get(STORE_KEY)).entries[FLARE_ID];
  assert.equal(e.observedAt, NOW + 9 * MIN);
  assert.equal(e.fxCollectedAt, persistedEntry(st).ts);
  assert.ok(Math.abs(e.eur - 0.025 * 0.91) < 1e-12);
});

test('F1-H observation native ancienne (2 h) avec FX recent : UNKNOWN', () => {
  const st = newStorage();
  fxGet(execution(st, { fetch: route(FX_OK) }));
  execution(st, { now: NOW + 5 * MIN, fetch: route(LLAMA((NOW - 2 * H) / 1000)) }).c.NativePriceStore.refreshIfDue({ nowMs: NOW + 5 * MIN });
  const out = renderFlare(execution(st, { now: NOW + 6 * MIN }), walletCache({ now: NOW + 6 * MIN }));
  assert.equal(isNpu(out), true); assert.equal(totalRow(out)[6], '');
});

test('F1-I solde natif > 6 h avec prix natif recent : UNKNOWN', () => {
  const st = newStorage();
  fxGet(execution(st, { fetch: route(FX_OK) }));
  execution(st, { now: NOW + 5 * MIN, fetch: route(LLAMA((NOW + 4 * MIN) / 1000)) }).c.NativePriceStore.refreshIfDue({ nowMs: NOW + 5 * MIN });
  const out = renderFlare(execution(st, { now: NOW + 6 * MIN }), walletCache({ now: NOW + 6 * MIN, balanceAgeMs: 6 * H + MIN }));
  assert.equal(isNpu(out), true); assert.equal(nativeRow(out)[5], ''); assert.equal(totalRow(out)[6], '');
});

// ---------------------------------------------------------------------------
// J / K : concurrence, erreurs reseau, quota, retry borne
// ---------------------------------------------------------------------------
test('F1-J deux executions concurrentes : la persistance ne revient jamais a une observation plus ancienne', () => {
  const st = newStorage();
  const older = execution(st, { now: NOW, fetch: route(FX_OK) });
  const newer = execution(st, { now: NOW + 2 * MIN, fetch: route(FX_OK) });
  // L'execution la plus recente termine et persiste la premiere.
  fxGet(newer);
  const tsNewer = persistedEntry(st).ts;
  // L'execution plus ancienne persiste ensuite son observation anterieure.
  fxGet(older);
  assert.equal(persistedEntry(st).ts, tsNewer);
  assert.equal(String(st.cache.get(L1_FX)).split('|')[2], String(tsNewer));
});

test('F1-K erreur reseau / timeout / quota HTTP : aucun faux succes, aucun retry avant 10 min', () => {
  for (const failing of [() => new Error('Timeout'), () => resp(429, {}), () => resp(500, 'oops')]) {
    const st = newStorage();
    const e = execution(st, { fetch: failing });
    const r1 = fxGet(e);
    assert.ok(r1.error, 'aucun taux sans source valide');
    assert.equal(persistedEntry(st), null);
    const n = e.fxFetches();
    assert.equal(n, 4);
    const e2 = execution(st, { now: NOW + 5 * MIN, fetch: failing });
    assert.ok(fxGet(e2).error); assert.equal(e2.fxFetches(), 0, 'retry borne : pas de nouvel essai avant 10 min');
    const e3 = execution(st, { now: NOW + 11 * MIN, fetch: route(FX_OK) });
    assert.ok(Math.abs(fxGet(e3) - 0.91) < 1e-9); assert.equal(e3.fxFetches(), 4);
    assert.ok(persistedEntry(st));
  }
});

test('F1-K2 ecriture ScriptProperties en echec (quota stockage) : taux servi au L1 mais sans faux succes de persistance', () => {
  const st = newStorage();
  const e = execution(st, { fetch: route(FX_OK), propsFail: true });
  assert.ok(Math.abs(fxGet(e) - 0.91) < 1e-9);
  assert.equal(st.props.has(FX_KEY), false);
  // Le support CacheService de safeSet peut porter l'entree ; si present, sa date est la date reseau.
  const entry = persistedEntry(st);
  if (entry) assert.equal(entry.ts, NOW);
});

// ---------------------------------------------------------------------------
// Bout en bout
// ---------------------------------------------------------------------------
test('F1 bout en bout : source FX -> persistance -> nouvelle execution -> magasin -> rendu Ledger -> INFO_TOTAL', () => {
  const st = newStorage();
  fxGet(execution(st, { fetch: route(FX_OK) }));                                    // 1-2
  const wd = execution(st, { now: NOW + 10 * MIN, fetch: route(LLAMA((NOW + 9 * MIN) / 1000)) });
  assert.equal(wd.c.NativePriceStore._cachedFx(NOW + 10 * MIN).collectedAt, persistedEntry(st).ts); // 3-4
  assert.equal(wd.c.NativePriceStore.refreshIfDue({ nowMs: NOW + 10 * MIN, budgetMs: 20000 }).reason, 'OK'); // 5
  const t = NOW + 12 * MIN;
  const out = renderFlare(execution(st, { now: t }), walletCache({ now: t }));       // 6
  assert.equal(isNpu(out), false, JSON.stringify(out));
  const eur = 0.025 * 0.91;
  assert.ok(Math.abs(nativeRow(out)[5] - eur) < 1e-12);
  assert.ok(Math.abs(totalRow(out)[6] - 7 * eur) < 1e-12, 'INFO_TOTAL chiffre, non nul');   // 7
  assert.match(String(out.find(r => r[1] === 'INFO_NATIVE')[2]), /price=llama-native observedAt=/);
  const late = NOW + 9 * MIN + 90 * MIN;                                             // 8
  const stale = renderFlare(execution(st, { now: late }), walletCache({ now: late }));
  assert.equal(isNpu(stale), true); assert.equal(totalRow(stale)[6], '');
});

test('F1 sans recalcul de la cellule : la sortie deja rendue reste inchangee apres alimentation du magasin', () => {
  const st = newStorage();
  const displayed = renderFlare(execution(st), walletCache());
  const snap = JSON.stringify(displayed);
  fxGet(execution(st, { fetch: route(FX_OK) }));
  execution(st, { now: NOW + MIN, fetch: route(LLAMA(NOW / 1000)) }).c.NativePriceStore.refreshIfDue({ nowMs: NOW + MIN });
  assert.equal(JSON.stringify(displayed), snap);
  assert.equal(isNpu(displayed), true, 'propagation non prouvee par F1 : il faut un recalcul de la formule');
});

test('F1-J2 course reelle : une execution plus recente persiste PENDANT la recuperation de l ancienne', () => {
  const st = newStorage();
  const newer = execution(st, { now: NOW + 2 * MIN, fetch: route(FX_OK) });
  let interleaved = false;
  const older = execution(st, { now: NOW, fetch: (url, p, clock) => {
    if (!interleaved) { interleaved = true; fxGet(newer); }
    return FX_OK(url, p, clock);
  } });
  fxGet(older);
  assert.equal(interleaved, true); assert.equal(older.fxFetches(), 4);
  assert.equal(persistedEntry(st).ts, NOW + 2 * MIN, 'l observation plus ancienne ne remplace pas la plus recente');
  assert.equal(String(st.cache.get(L1_FX)).split('|')[2], String(NOW + 2 * MIN));
  const direct = execution(st, { now: NOW + 3 * MIN });
  assert.equal(direct.c.GlobalFxCache.persistRate('USD_EUR', 0.95, NOW + MIN), false);
  assert.equal(direct.c.GlobalFxCache.persistRate('USD_EUR', 0.95, NOW + 3 * MIN + 10 * MIN), false, 'date future refusee');
  assert.equal(direct.c.GlobalFxCache.persistRate('USD_EUR', -1, NOW + 3 * MIN), false);
  assert.equal(persistedEntry(st).ts, NOW + 2 * MIN);
});

test('F1-K3 delai borne : timeoutSeconds = 5 par source et budget de cascade 12 s : 4 sources lentes => 2 tentees, <= 10 s', () => {
  const st = newStorage();
  const e = execution(st, { fetch: route(FX_OK), fetchDelayMs: 5000 });
  const t0 = e.clock.now;
  assert.ok(Math.abs(fxGet(e) - 0.91) < 1e-9);
  const fx = e.fetches.filter(f => isFxUrl(f.url));
  assert.equal(fx.length, 2, 'la 3e source sortirait du budget de 12 s');
  for (const f of fx) assert.equal(f.params.timeoutSeconds, 5, JSON.stringify(f.params));
  assert.ok(e.clock.now - t0 <= 10000, String(e.clock.now - t0));
  assert.equal(persistedEntry(st).ts, t0 + 10000, 'date = fin de la derniere reponse');
});

test('F1-K4 rendu cache-only EVM (fonction personnalisee) : aucun appel FX, meme FX expire', () => {
  const e = execution(newStorage(), { fetch: route(FX_OK) });
  const out = renderFlare(e, walletCache());
  assert.equal(isNpu(out), true);
  assert.equal(e.fxFetches(), 0);
});
