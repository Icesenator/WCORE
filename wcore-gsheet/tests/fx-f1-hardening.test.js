// F1 durcissement (2026-11-08) — P1-DATA-NATIVE-PRICE-FRESHNESS.
// Code reel : 01_INIT, 02, 03_HTTP, 04A, 04C, 04E, 07, 10_OUTPUT, 10A_BASE_ENGINE, 11_EVM,
// 19_CHAIN_FACTORY, 24, FLARE, FOGO, TON. Aucun reseau reel : UrlFetchApp est un routeur de
// fixtures avec horloge simulee (chaque reponse avance l'horloge de son delai).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, '../src');
const NOW = 1800000000000, MIN = 60000, H = 60 * MIN, SEC = 1000;
const FX_KEY = 'GLOBAL_FX_CACHE_V1', L1_FX = 'FX:USD_EUR', STORE_KEY = 'WCORE_NATIVE_PRICE_STORE_V1';
const FOGO_USD_STABLE = 'uSd2czE61Evaf76RNbq4KPpXnkiL3irdzgLFUMe3NoG';
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const newStorage = () => ({ props: new Map(), cache: new Map() });
const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body), getAllHeaders: () => ({}) });
const isFxUrl = u => /frankfurter|open\.er-api|coinbase|euro-coin/.test(u);
const FX_BODY = url => {
  if (url.indexOf('frankfurter') >= 0) return resp(200, { amount: 1, base: 'EUR', date: '2026-11-07', rates: { USD: 1 / 0.91 } });
  if (url.indexOf('open.er-api') >= 0) return resp(200, { time_last_update_unix: 1799971201, rates: { EUR: 0.91 } });
  if (url.indexOf('coinbase') >= 0) return resp(200, { data: { rates: { EUR: '0.91' } } });
  if (url.indexOf('euro-coin') >= 0) return resp(200, { coins: { 'coingecko:euro-coin': { price: 1 / 0.91, timestamp: (NOW - 2 * MIN) / 1000 } } });
  return null;
};
const LLAMA = (tsSec, price = 0.025) => url => {
  if (url.indexOf('/prices/current/') < 0 || url.indexOf('euro-coin') >= 0) return null;
  const ids = decodeURIComponent(url.split('/prices/current/')[1] || '').split(',');
  const coins = {}; for (const id of ids) coins[id] = { price, timestamp: tsSec, confidence: 0.99 };
  return resp(200, { coins });
};

// options.fetch(url) -> reponse | Error ; options.delay(url) -> ms d'horloge consommes.
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
      fetch(url, params) {
        fetches.push({ url, params: clone(params), at: clock.now });
        if (options.onFetch) options.onFetch(url, clock);
        clock.now += options.delay ? options.delay(url) : 0;
        const r = options.fetch ? options.fetch(url, params, clock) : resp(404, {});
        if (r instanceof Error) throw r;
        return r || resp(404, {});
      },
      fetchAll() { throw new Error('fetchAll inattendu'); }
    },
    LockService: { getScriptLock() { throw new Error('lock unavailable'); } }
  };
  vm.createContext(c);
  c.fixtureNow = () => clock.now;
  vm.runInContext('Date.now = fixtureNow;', c);
  for (const f of ['01_INIT.gs', '02_UTILS.gs', '03_HTTP.gs', '04A_CACHE_CORE.gs', '04C_CACHE_GLOBAL.gs', '04E_FX_METADATA.gs',
    '07_PRICES.gs', '10_OUTPUT.gs', '10A_BASE_ENGINE.gs', '11_EVM_ENGINE.gs', '19_CHAIN_FACTORY.gs', '24_DEGRADED_MODE.gs',
    'CHAIN_CONFIG_SCHEMA.gs', '14_SVM_ENGINE.gs', 'FLARE.gs', 'FOGO.gs', 'TON.gs']) vm.runInContext(read(f), c, { filename: f });
  if (c.DegradedMode) c.DegradedMode.isCircuitBreakerActive = () => false;
  if (options.quotaTripped) c.QuotaCircuitBreaker = { isTripped: () => true };
  return { c, clock, fetches, fxFetches: () => fetches.filter(f => isFxUrl(f.url)).length };
}
const route = (...hs) => (url, p, clock) => { for (const h of hs) { const r = h(url, p, clock); if (r) return r; } return resp(404, {}); };
const persistedEntry = st => { const raw = st.props.get(FX_KEY) || st.cache.get(FX_KEY); const p = raw ? JSON.parse(raw) : null; return p && p.rates && p.rates.USD_EUR || null; };
const seedFx = (st, e, ts, rate = 0.93) => {
  st.cache.set(L1_FX, rate + '|' + e.c.FxRate._CURRENT_VERSION + '|' + ts);
  st.props.set(FX_KEY, JSON.stringify({ rates: { USD_EUR: { rate, ts } }, USD_EUR: { rate, ts }, updatedAt: ts }));
};
const fail503 = () => resp(503, {});

// Rendu Flare (11_EVM, chemin de la fonction personnalisee) a partir d'un WalletCache fixe.
function renderFlare(exec, wc) {
  const c = exec.c;
  c.WalletCache = { load: () => clone(wc), save() {}, getLastUpdateStr: () => 'fixture-cache-time' };
  c.MetaCache = { load: () => ({}) };
  c.AssetManager = c.AssetManager || {}; c.AssetManager.normalizeMetadata = () => {};
  c.WalletNames = { get: (_a, n) => n };
  c.BaseEngine.isSystemBlocked = () => false;
  c._webScanCacheTimestamp_ = cc => cc.last_cache_update_ms || 0;
  return c.CACHED_WALLET_ASSETS_FLARE('fixture-wallet', 'fixture-J1');
}
const isNpu = out => out.some(r => r[1] === 'ERROR' && String(r[2]).indexOf('NATIVE_PRICE_UNKNOWN') === 0);
const totalRow = out => out.find(r => r[1] === 'INFO_TOTAL');
const nativeRow = out => out.find(r => r[3] === 'native');

// TON : rendu reel CACHED_WALLET_ASSETS_TON depuis un WalletCache fixe.
function renderTon(exec) {
  const c = exec.c;
  c.WalletCache = { load: () => ({ assets: [{ contract: 'native', symbol: 'TON', name: 'Toncoin', balance: 3, decimals: 9 }],
    priceMap: { native: 2.1, TON: 2.1 }, updatedAt: exec.clock.now - 10 * MIN }), save() {}, getLastUpdateStr: () => 'fixture-cache-time' };
  return c.CACHED_WALLET_ASSETS_TON('UQ-fixture-ton-address');
}
// FOGO : fonction reelle appliquee par CACHED_WALLET_ASSETS_FOGO a la sortie du rendu SVM.
const fogoOutput = () => [['chain_name', 'token_ticker', 'name', 'contract', 'balance', 'price_eur', 'value_eur'],
  ['Fogo', '', '', FOGO_USD_STABLE, 4, '', ''], ['Fogo', 'INFO_TOTAL', 'Total portefeuille (sum value_eur).', '', '', '', 0]];
const timed = (exec, fn) => { const t0 = exec.clock.now; let out, err = null; try { out = fn(); } catch (e) { err = e; } return { out, err, ms: exec.clock.now - t0 }; };

// ---------------------------------------------------------------------------
// 1) Repli FX ancien (3 h) : identifiable, jamais frais, jamais redate
// ---------------------------------------------------------------------------
test('H1 FX observe il y a 3 h + renouvellement en echec : taux de retention IDENTIFIE (RETAINED, fresh=false, date 3 h conservee)', () => {
  const st = newStorage(); const e0 = execution(st); const ts = NOW - 3 * H; seedFx(st, e0, ts);
  const e = execution(st, { fetch: fail503 });
  const info = e.c.FxRate.getUsdToEurInfo(null);
  assert.equal(info.kind, 'RETAINED'); assert.equal(info.fresh, false); assert.equal(info.observedAt, ts);
  assert.equal(info.rate, 0.93); assert.equal(info.reason, 'RENEW_FAILED');
  assert.equal(persistedEntry(st).ts, ts, 'aucun reestampillage');
  assert.equal(String(st.cache.get(L1_FX)).split('|')[2], String(ts));
  assert.equal(execution(st).c.NativePriceStore.refreshIfDue({ nowMs: NOW }).reason, 'FX_UNAVAILABLE', 'contrat 1 h : fail-closed');
  const again = execution(st, { now: NOW + MIN, fetch: fail503 });
  assert.equal(again.c.FxRate.getUsdToEurInfo(null).reason, 'RENEW_BACKOFF'); assert.equal(again.fxFetches(), 0);
});

test('H2 CARACTERISATION hors 04C : BaseEngine.getFxRate ne transmet aucune date ; le scan date le prix EUR par la seule observation USD', () => {
  const st = newStorage(); const e0 = execution(st); seedFx(st, e0, NOW - 3 * H);
  const e = execution(st, { fetch: fail503 });
  const state = { timer: null };
  const fx = e.c.BaseEngine.getFxRate(state, null);
  assert.equal(fx, 0.93);
  assert.deepEqual(Object.keys(state).sort(), ['fxRate', 'timer'], 'aucune date ni fraicheur FX dans l etat du scan');
  // 11_EVM:850-870 : priceMap natif = prixUSD * state.fxRate, priceTsMap natif = date USD.
  const usdObs = NOW - 2 * MIN;
  const wc = { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 7 }],
    priceMap: { 'native@flare': 0.025 * fx }, priceTsMap: { 'native@flare': usdObs }, balanceTsMap: { native: NOW - MIN },
    usd_to_eur_rate: fx, last_cache_update_ms: NOW - MIN,
    lastInfoMetaRows: [['Flare', 'INFO_FX', 'fx', '', '', '', ''], ['Flare', 'INFO_TOTAL', 'Total portefeuille (sum value_eur).', '', '', '', 0]] };
  const out = renderFlare(execution(st), wc);
  assert.equal(isNpu(out), false, 'GAP : valeur EUR affichee sans NPU alors que le FX a 3 h');
  assert.match(String(out.find(r => r[1] === 'INFO_FX')[2]), /provenance=UNKNOWN; freshness=UNKNOWN/, 'le FX n est pas revendique frais');
});

test('H3 CARACTERISATION hors 04C : sans taux, BaseEngine.getFxRate retombe sur la constante DEFAULTS.FX_FALLBACK', () => {
  const e = execution(newStorage(), { fetch: fail503 });
  const state = { timer: null };
  assert.equal(e.c.BaseEngine.getFxRate(state, null), e.c.BaseEngine.DEFAULTS.FX_FALLBACK);
  assert.equal(e.c.FxRate.getUsdToEurInfo(null).kind, 'UNAVAILABLE');
});

// ---------------------------------------------------------------------------
// 2) Provenance de bout en bout (producteur -> persistance -> magasin -> rendu)
// ---------------------------------------------------------------------------
test('P1 producteur reseau : instant de reponse, sources, selection et date annoncee par le fournisseur distingues', () => {
  const st = newStorage();
  const e = execution(st, { fetch: route(FX_BODY), delay: () => 200 });
  const info = e.c.FxRate.getUsdToEurInfo(null);
  assert.equal(info.kind, 'FRESH_NETWORK'); assert.equal(info.fresh, true);
  assert.equal(info.observedAt, NOW + 800); assert.equal(info.observedAtMeaning, 'NETWORK_RESPONSE_INSTANT');
  assert.equal(info.selection, 'median'); assert.equal(info.sources.length, 4);
  const by = Object.fromEntries(info.sources.map(s => [s.source, s]));
  assert.deepEqual(clone(by.frankfurter.providerDate), { value: '2026-11-07', granularity: 'DAY' });
  assert.equal(by['open-er-api'].providerDate.granularity, 'PROVIDER_PUBLICATION');
  assert.equal(by.coinbase.providerDate, null, 'aucune date inventee');
  assert.equal(by['defillama-eurc'].providerDate.granularity, 'PRICE_OBSERVATION');
  assert.equal(by.frankfurter.fetchedAt, NOW + 200);
  assert.deepEqual(Object.keys(persistedEntry(st)).sort(), ['rate', 'ts']);
});

test('P2 seconde execution : meme provenance relue (FRESH_L1), magasin alimente, date native distincte, rendu apres recalcul naturel', () => {
  const st = newStorage();
  const obs = execution(st, { fetch: route(FX_BODY) }).c.FxRate.getUsdToEurInfo(null).observedAt;
  const e2 = execution(st, { now: NOW + 10 * MIN, fetch: route(LLAMA((NOW + 9 * MIN) / 1000)) });
  const info = e2.c.FxRate.getUsdToEurInfo(null);
  assert.equal(info.kind, 'FRESH_L1'); assert.equal(info.observedAt, obs); assert.equal(info.sources.length, 4);
  assert.equal(e2.fxFetches(), 0);
  assert.equal(e2.c.NativePriceStore.refreshIfDue({ nowMs: NOW + 10 * MIN, budgetMs: 20000 }).reason, 'OK');
  const entry = JSON.parse(st.cache.get(STORE_KEY)).entries['coingecko:flare-networks'];
  assert.equal(entry.fxCollectedAt, obs, 'date FX'); assert.equal(entry.observedAt, NOW + 9 * MIN, 'date du prix natif');
  const t = NOW + 12 * MIN;
  const out = renderFlare(execution(st, { now: t }), { assets: [{ contract: 'native', symbol: 'FLR', name: 'Flare', balance: 7 }],
    priceMap: { 'native@flare': 0.02 }, priceTsMap: { 'native@flare': t - 2 * H }, balanceTsMap: { native: t - 30 * MIN },
    usd_to_eur_rate: 0.9, last_cache_update_ms: t - 2 * H,
    lastInfoMetaRows: [['Flare', 'INFO_NATIVE', 'native=FLR', '', '', '', ''], ['Flare', 'INFO_TOTAL', 'Total portefeuille (sum value_eur).', '', '', '', 0]] });
  assert.equal(isNpu(out), false); assert.ok(totalRow(out)[6] > 0);
});

test('P3 expiration puis echec de renouvellement : aucun prix natif artificiellement frais', () => {
  const st = newStorage();
  const obs = execution(st, { fetch: route(FX_BODY) }).c.FxRate.getUsdToEurInfo(null).observedAt;
  const t = obs + 61 * MIN;
  const e = execution(st, { now: t, fetch: route(() => resp(500, {}), LLAMA(t / 1000)) });
  assert.equal(e.c.FxRate.getUsdToEurInfo(null).kind, 'RETAINED');
  const r = e.c.NativePriceStore.refreshIfDue({ nowMs: t, budgetMs: 20000 });
  assert.equal(r.reason, 'FX_UNAVAILABLE'); assert.equal(r.written, 0);
  assert.equal(st.cache.has(STORE_KEY), false);
});

test('P4 renouvellement a expiration : nouvelle observation reseau, provenance remplacee de facon monotone', () => {
  const st = newStorage();
  const obs1 = execution(st, { fetch: route(FX_BODY) }).c.FxRate.getUsdToEurInfo(null).observedAt;
  const e = execution(st, { now: obs1 + 61 * MIN, fetch: route(FX_BODY) });
  const info = e.c.FxRate.getUsdToEurInfo(null);
  assert.equal(info.kind, 'FRESH_NETWORK'); assert.equal(info.observedAt, obs1 + 61 * MIN);
  assert.equal(JSON.parse(st.cache.get('FX:USD_EUR:META')).observedAt, obs1 + 61 * MIN);
});

// ---------------------------------------------------------------------------
// 3) FOGO et TON : chemins reels, durees mesurees sur l'horloge des fixtures
// ---------------------------------------------------------------------------
const BUDGET_MS = 30 * SEC;
const scenarios = [
  { name: 'FX frais deja disponible', seed: true, delay: () => 0, expectFx: 0 },
  { name: 'FX absent, recuperation rapide', delay: () => 150, expectFx: 4 },
  { name: 'premiere source lente (timeout 5 s)', delay: u => (u.indexOf('frankfurter') >= 0 ? 5000 : 150), fail: u => u.indexOf('frankfurter') >= 0, expectFx: 4 },
  { name: 'quatre sources au timeout', delay: () => 5000, fail: () => true, expectFx: 2, expectError: true },
  { name: 'erreur d un fournisseur (coinbase 500)', delay: () => 150, http500: 'coinbase', expectFx: 4 },
  { name: 'budget HTTP indisponible (disjoncteur)', quota: true, delay: () => 0, expectFx: 0, expectError: true }
];
for (const sc of scenarios) {
  test('T/F ' + sc.name + ' : TON et FOGO bornes, marge >= 20 s sur 30 s', () => {
    for (const target of ['TON', 'FOGO']) {
      const st = newStorage();
      if (sc.seed) seedFx(st, execution(st), NOW - 10 * MIN, 0.91);
      const e = execution(st, { quotaTripped: sc.quota, delay: sc.delay,
        fetch: u => (sc.fail && sc.fail(u)) ? new Error('Timeout: ' + u) : (sc.http500 && u.indexOf(sc.http500) >= 0 ? resp(500, {}) : FX_BODY(u)) });
      const r = timed(e, () => target === 'TON' ? renderTon(e) : e.c._FOGO_applyKnownTokens(fogoOutput()));
      assert.equal(e.fxFetches(), sc.expectFx, target + ' ' + sc.name);
      assert.ok(r.ms <= 10 * SEC, target + ' duree ' + r.ms);
      assert.ok(BUDGET_MS - r.ms >= 20 * SEC, target + ' marge');
      if (target === 'TON') {
        if (sc.expectError) assert.match(String(r.err && r.err.message), /FX unavailable|FX cascade/, 'TON : erreur explicite, jamais un faux taux');
        else { assert.equal(r.err, null, String(r.err)); assert.match(String(r.out.find(x => x[1] === 'INFO_FX')[2]), /^USD->EUR=0\.91/); }
      } else {
        const row = r.out.find(x => x[3] === FOGO_USD_STABLE);
        if (sc.expectError) { assert.equal(row[5], 0, 'FOGO : prix 0 historique quand le FX est indisponible'); }
        else assert.ok(Math.abs(row[5] - 0.91) < 1e-9);
      }
    }
  });
}

test('T7 deux recalculs simultanes (TON pendant la cascade FOGO) : 8 appels au plus, observation persistee la plus recente', () => {
  const st = newStorage();
  const ton = execution(st, { now: NOW + 30 * SEC, fetch: route(FX_BODY), delay: () => 150 });
  let interleaved = false;
  const fogo = execution(st, { now: NOW, delay: () => 150, fetch: route(FX_BODY),
    onFetch: () => { if (!interleaved) { interleaved = true; renderTon(ton); } } });
  const r = timed(fogo, () => fogo.c._FOGO_applyKnownTokens(fogoOutput()));
  assert.equal(interleaved, true);
  assert.ok(fogo.fxFetches() + ton.fxFetches() <= 8);
  assert.ok(r.ms <= 10 * SEC);
  assert.equal(persistedEntry(st).ts, ton.c.FxRate._lastResult.observedAt, 'la plus recente (TON) est conservee');
});
