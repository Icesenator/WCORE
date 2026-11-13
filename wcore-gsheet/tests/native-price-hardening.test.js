// Durcissement lot A (2026-11-08) : P1-DATA-NATIVE-PRICE-FRESHNESS.
// 1) Le delai HTTP est verifie sur les parametres REELLEMENT recus par le mock
//    de UrlFetchApp (03_HTTP.gs charge), pas sur la constante declaree.
//    Documentation Google : seul `timeoutSeconds` est un parametre reconnu de
//    UrlFetchApp.fetch ; `deadline`, `timeout` et `timeoutMs` ne le sont pas.
// 2) Budget de temps du rafraichissement des prix dans le watchdog.
// 3) Provenance : un prix de repli sans date source n'est jamais rendu frais.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = path.join(__dirname, '../src');
const NOW = 1800000000000;
const MIN = 60000;
const STORE_KEY = 'WCORE_NATIVE_PRICE_STORE_V1';
const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');

function response(code, body) {
  return { getResponseCode: () => code, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)), getAllHeaders: () => ({}) };
}

function harness(options = {}) {
  const clock = { now: NOW };
  const calls = [];
  const l1 = new Map();
  const c = {
    console, Logger: { log() {} }, PriceManager: {}, WCORE_STABLECOINS: {},
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, getProperties: () => ({}), setProperty() {}, deleteProperty() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => l1.has(k) ? l1.get(k) : null, put: (k, v) => l1.set(k, v), getAll: ks => Object.fromEntries(ks.filter(k => l1.has(k)).map(k => [k, l1.get(k)])), putAll: m => { for (const k of Object.keys(m)) l1.set(k, m[k]); } }) },
    Session: { getScriptTimeZone: () => 'UTC' }, Utilities: { formatDate: d => d.toISOString(), sleep() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => null },
    CacheManager: { init() {} },
    UrlFetchApp: {
      fetch(url, params) {
        calls.push({ url, params: clone(params) });
        const r = options.fetch ? options.fetch(url, params, calls.length, clock) : response(200, {});
        return r;
      },
      fetchAll() { throw new Error('fetchAll inattendu'); }
    },
    LockService: { getScriptLock() { throw new Error('lock unavailable'); } }
  };
  vm.createContext(c);
  c.fixtureNow = () => clock.now;
  vm.runInContext('Date.now = fixtureNow;', c);
  for (const f of ['01_INIT.gs', '02_UTILS.gs', '03_HTTP.gs', '04E_FX_METADATA.gs', '07_PRICES.gs', '10_OUTPUT.gs', '11_EVM_ENGINE.gs', '19_CHAIN_FACTORY.gs', '24_DEGRADED_MODE.gs', 'FLARE.gs']) vm.runInContext(read(f), c, { filename: f });
  c.GlobalFxCache = { load: () => ({ rates: { USD_EUR: { rate: 0.9, ts: NOW - 30 * MIN } } }) };
  return { c, l1, calls, clock };
}

function registry(h, n) {
  const reg = {};
  for (let i = 0; i < n; i++) reg['C' + i] = { getConfig: () => ({ CHAIN: { NATIVE_LLAMA_ID: 'coingecko:id-' + i } }) };
  h.c.ChainFactory = { getRegistry: () => reg };
}
const llamaBody = (url, tsSec) => {
  const ids = decodeURIComponent(url.split('/prices/current/')[1] || '').split(',');
  const coins = {}; for (const id of ids) coins[id] = { price: 1.5, timestamp: tsSec, confidence: 0.99 };
  return { coins };
};

// ---------------------------------------------------------------------------
// 1) Delai HTTP effectivement transmis
// ---------------------------------------------------------------------------
test('timeout : timeoutSeconds = 8 recu par UrlFetchApp.fetch sur les deux appels groupes (95 ids)', () => {
  const h = harness({ fetch: url => response(200, llamaBody(url, NOW / 1000 - 60)) });
  registry(h, 95);
  const r = h.c.NativePriceStore.refreshIfDue({ nowMs: NOW });
  assert.equal(r.http, 2); assert.equal(h.calls.length, 2);
  for (const call of h.calls) {
    assert.match(call.url, /^https:\/\/coins\.llama\.fi\/prices\/current\//);
    assert.equal(call.params.timeoutSeconds, 8, JSON.stringify(call.params));
    assert.equal(call.params.muteHttpExceptions, true);
  }
  assert.equal(r.written, 95); assert.equal(r.reason, 'OK');
});

test('timeout : une requete lente (8 s) est mesuree et bornee ; prix ecrit avec la date source', () => {
  const h = harness({ fetch: (url, _p, _n, clock) => { clock.now += 8000; return response(200, llamaBody(url, NOW / 1000 - 120)); } });
  registry(h, 10);
  const r = h.c.NativePriceStore.refreshIfDue({ nowMs: NOW });
  assert.equal(r.http, 1); assert.equal(r.reason, 'OK');
  assert.ok(r.ms <= 8000 + 50, String(r.ms));
  const e = h.c.NativePriceStore.load().entries['coingecko:id-0'];
  assert.equal(e.observedAt, NOW - 120000);
});

test('timeout : deux requetes lentes => duree totale <= 2 x 8 s, aucune troisieme requete', () => {
  const h = harness({ fetch: (url, _p, _n, clock) => { clock.now += 8000; return response(200, llamaBody(url, NOW / 1000 - 60)); } });
  registry(h, 95);
  const r = h.c.NativePriceStore.refreshIfDue({ nowMs: NOW, budgetMs: h.c.NativePriceStore.CONFIG.WATCHDOG_BUDGET_MS });
  assert.equal(r.http, 2); assert.equal(h.calls.length, 2);
  assert.ok(r.ms <= 16000 + 50, String(r.ms));
});

test('erreur HTTP 500 : rien ecrit, aucun second lot DefiLlama, un seul repli CoinGecko, prochain essai apres 25 min', () => {
  const h = harness({ fetch: () => response(500, { coins: { 'coingecko:id-0': { price: 9, timestamp: NOW / 1000 } } }) });
  registry(h, 95);
  const r = h.c.NativePriceStore.refreshIfDue({ nowMs: NOW });
  assert.equal(r.written, 0); assert.equal(r.reason, 'HTTP_FAILED');
  // v4.17.0 : apres l'echec, le second lot DefiLlama n'est pas tente ; seul le repli CoinGecko (un appel) suit.
  assert.equal(h.calls.length, 2, 'un lot DefiLlama puis un seul repli CoinGecko');
  assert.match(h.calls[0].url, /coins\.llama\.fi/);
  assert.match(h.calls[1].url, /api\.coingecko\.com/, 'le second appel est le repli, pas un nouvel essai DefiLlama');
  assert.deepEqual(clone(h.c.NativePriceStore.load().entries), {});
  assert.equal(h.c.NativePriceStore.refreshIfDue({ nowMs: NOW + 24 * MIN }).reason, 'NOT_DUE');
  assert.equal(h.calls.length, 2);
});

test('expiration : UrlFetchApp leve (timeout) => exception absorbee, aucun prix ecrit, aucun retry DefiLlama, un seul repli CoinGecko', () => {
  const h = harness({ fetch: (_u, _p, _n, clock) => { clock.now += 8000; throw new Error('Timeout: https://coins.llama.fi'); } });
  registry(h, 95);
  const r = h.c.NativePriceStore.refreshIfDue({ nowMs: NOW });
  assert.equal(r.written, 0); assert.equal(r.reason, 'HTTP_FAILED');
  assert.equal(h.calls.length, 2, 'un lot DefiLlama puis un seul repli CoinGecko');
  assert.match(h.calls[1].url, /api\.coingecko\.com/);
  assert.ok(r.ms <= 2 * 8000 + 50, String(r.ms));
  assert.ok(r.ms <= h.c.NativePriceStore.CONFIG.WATCHDOG_BUDGET_MS, 'les deux expirations tiennent dans le budget du watchdog');
  assert.deepEqual(clone(h.c.NativePriceStore.load().entries), {});
});

test('budget : watchdog proche de sa borne => aucune requete lancee, magasin et date de passage inchanges', () => {
  const h = harness({ fetch: url => response(200, llamaBody(url, NOW / 1000)) });
  registry(h, 95);
  const r = h.c.NativePriceStore.refreshIfDue({ nowMs: NOW, budgetMs: 5000 });
  assert.equal(r.reason, 'BUDGET'); assert.equal(r.http, 0); assert.equal(h.calls.length, 0);
  assert.equal(h.c.NativePriceStore.load().refreshedAt, 0, 'un passage non tente ne repousse pas le suivant');
});

test('budget : le second lot n est pas lance si le temps restant ne couvre plus un delai complet', () => {
  const h = harness({ fetch: (url, _p, _n, clock) => { clock.now += 8000; return response(200, llamaBody(url, NOW / 1000 - 60)); } });
  registry(h, 95);
  const r = h.c.NativePriceStore.refreshIfDue({ nowMs: NOW, budgetMs: 12000 });
  assert.equal(h.calls.length, 1); assert.equal(r.reason, 'BUDGET_PARTIAL');
  assert.equal(r.written, 60, 'seul le premier lot, deja recu, est integre');
});

test('watchdog : 16_REFRESH borne le rafraichissement ; le drainage garde son plafond de 180 s', () => {
  const src = read('16_REFRESH.gs');
  assert.match(src, /NativePriceStore\.refreshIfDue\(\{\s*nowMs:\s*nowMs,\s*budgetMs:\s*NativePriceStore\.CONFIG\.WATCHDOG_BUDGET_MS\s*\}\)/);
  const h = harness();
  const B = h.c.NativePriceStore.CONFIG.WATCHDOG_BUDGET_MS;
  const T = h.c.NativePriceStore.CONFIG.HTTP_TIMEOUT_MS;
  assert.ok(B <= 20000 && B >= 2 * (T + 1000), String(B));
  // Drainage LIVE : min(300000 - ecoule - 30000, 180000). Avec le pire cas prix (B),
  // le plafond de 180 s reste atteint tant que la sonde du Recap dure moins de 70 s.
  const drain = elapsedProbe => Math.min(300000 - (B + elapsedProbe) - 30000, 180000);
  assert.equal(drain(70000), 180000);
  assert.ok(300000 - 30000 < 360000, 'borne interne < limite d execution de 6 min');
});

// ---------------------------------------------------------------------------
// 2) Provenance des replis natifs
// ---------------------------------------------------------------------------
function flareCfg(h, mutate) {
  const cfg = clone(h.c._FLARE.getConfig());
  if (mutate) mutate(cfg);
  return cfg;
}
const llamaDown = url => /llama\.fi/.test(url) ? response(404, {}) : response(500, {});
const compute = (h, cfg) => h.c.PriceManager.computePriceEur({ contract: 'native', symbol: 'FLR' }, 'native@flare', null, 0.9, {}, {}, {}, NOW, null, {}, cfg);

test('provenance : repli CoinGecko servi par L1 sans date => prix valorise mais observation non attestee (null)', () => {
  const h = harness({ fetch: llamaDown });
  const cfg = flareCfg(h, x => { delete x.CHAIN.NATIVE_PRICE_CONTRACT; });
  h.l1.set(h.c._pxL1Key('CG', cfg, 'flare-networks'), JSON.stringify({ u: 0.025 }));
  const eur = compute(h, cfg);
  assert.ok(eur > 0);
  assert.deepEqual(clone(h.c.PriceManager._lastPriceMeta), { src: 'COINGECKO', observedAt: null });
});

test('provenance : repli CoinGecko recu en direct, sans date source => non atteste, jamais l heure de la requete', () => {
  const h = harness({ fetch: url => /coingecko/.test(url) ? response(200, { 'flare-networks': { usd: 0.03 } }) : llamaDown(url) });
  const cfg = flareCfg(h, x => { delete x.CHAIN.NATIVE_PRICE_CONTRACT; });
  const eur = compute(h, cfg);
  assert.ok(Math.abs(eur - 0.027) < 1e-12);
  assert.deepEqual(clone(h.c.PriceManager._lastPriceMeta), { src: 'COINGECKO', observedAt: null });
});

test('provenance : repli proxy GeckoTerminal (L1 sans date) => non atteste', () => {
  const h = harness({ fetch: llamaDown });
  const cfg = flareCfg(h);
  const proxy = h.c.Addr.normalize(cfg.CHAIN.NATIVE_PRICE_CONTRACT);
  h.l1.set(h.c._pxL1Key('GT', cfg, proxy), JSON.stringify({ u: 0.021 }));
  assert.ok(compute(h, cfg) > 0);
  assert.deepEqual(clone(h.c.PriceManager._lastPriceMeta), { src: 'GT_PROXY', observedAt: null });
});

test('provenance : repli proxy DexScreener (L1 sans date) => non atteste', () => {
  const h = harness({ fetch: llamaDown });
  const cfg = flareCfg(h, x => { delete x.CHAIN.GT_NETWORK; });
  const proxy = h.c.Addr.normalize(cfg.CHAIN.NATIVE_PRICE_CONTRACT);
  h.l1.set(h.c._pxL1Key('DEX', cfg, proxy), JSON.stringify({ u: 0.022, s: 'WFLR' }));
  assert.ok(compute(h, cfg) > 0);
  assert.deepEqual(clone(h.c.PriceManager._lastPriceMeta), { src: 'DEX_PROXY', observedAt: null });
});

test('provenance : Llama recu en direct sans timestamp => observation non attestee (plus d heure de requete)', () => {
  const h = harness({ fetch: url => /llama\.fi/.test(url) ? response(200, { coins: { 'coingecko:flare-networks': { price: 0.025 } } }) : response(500, {}) });
  const cfg = flareCfg(h);
  assert.ok(compute(h, cfg) > 0);
  assert.deepEqual(clone(h.c.PriceManager._lastPriceMeta), { src: 'LLAMA', observedAt: null });
  const l1 = JSON.parse(h.l1.get(h.c._pxL1Key('LLAMA', cfg, 'coingecko:flare-networks')));
  assert.equal(l1.t, null);
});

test('provenance : Llama recu en direct avec timestamp source => date source conservee (comportement inchange)', () => {
  const h = harness({ fetch: url => /llama\.fi/.test(url) ? response(200, { coins: { 'coingecko:flare-networks': { price: 0.025, timestamp: NOW / 1000 - 300 } } }) : response(500, {}) });
  assert.ok(compute(h, flareCfg(h)) > 0);
  assert.deepEqual(clone(h.c.PriceManager._lastPriceMeta), { src: 'LLAMA', observedAt: NOW - 300000 });
});

test('provenance : toutes les sources echouent => null (UNKNOWN), jamais zero', () => {
  const h = harness({ fetch: () => response(500, {}) });
  const eur = compute(h, flareCfg(h));
  assert.equal(eur, null);
});

// ---------------------------------------------------------------------------
// 3) Persistance au scan (code reel de 11_EVM_ENGINE, bloc prix natif)
// ---------------------------------------------------------------------------
function nativeApplyBlock() {
  const src = read('11_EVM_ENGINE.gs').replace(/\r\n/g, '\n');
  const a = src.indexOf(' if (natAsset) {\n var pNat = PriceManager.computePriceEur(');
  const b = src.indexOf(' // Token prices', a);
  assert.ok(a > 0 && b > a, 'bloc prix natif introuvable');
  return src.slice(a, b);
}
function runApply(meta, pNat) {
  // F1 elargi : etat de scan avec provenance FX (fixee par getFxRateStrict en production).
  const state = { nowMs: NOW, fxRate: 0.9, fxFresh: true, fxObservedAt: NOW - MIN, priceMap: { 'native@flare': 0.02, native: 0.02 }, priceTsMap: { 'native@flare': NOW - 200 * MIN, native: NOW - 200 * MIN }, attemptTsMap: {}, timer: null, assets: [] };
  const natAsset = { contract: 'native', symbol: 'FLR' };
  const c = { state, natAsset, config: { KEYS: { NATIVE_PRICE: 'native@flare' } }, priceUsdMap: {}, budget: {}, applied: 0,
    Num: { isValidPositive: v => typeof v === 'number' && isFinite(v) && v > 0 },
    PriceManager: { computePriceEur() { this._lastPriceMeta = meta; return pNat; }, _lastPriceMeta: null } };
  vm.createContext(c);
  // Fonction reelle de 10A quand elle existe (candidat) ; absente du LIVE, ou le bloc ne l'utilise pas.
  const fxEff = read('10A_BASE_ENGINE.gs').replace(/\r\n/g, '\n').match(/BaseEngine\.fxEffectiveTs = function[\s\S]*?\n};/);
  if (fxEff) { vm.runInContext('var BaseEngine = {};\n' + fxEff[0], c); }
  vm.runInContext(nativeApplyBlock(), c);
  return { state, natAsset };
}

test('scan : prix de repli non atteste => valorise pour ce scan, ni prix ni date persistes comme frais', () => {
  const { state, natAsset } = runApply({ src: 'COINGECKO', observedAt: null }, 0.027);
  assert.equal(natAsset.price_eur, 0.027);
  assert.equal(state.priceTsMap.native, NOW - 200 * MIN);
  assert.equal(state.priceTsMap['native@flare'], NOW - 200 * MIN);
  assert.equal(state.priceMap.native, 0.02);
});

test('scan : observation attestee => persistee avec sa date source, jamais nowMs', () => {
  const { state } = runApply({ src: 'LLAMA', observedAt: NOW - 300000 }, 0.0225);
  assert.equal(state.priceTsMap.native, NOW - 300000);
  assert.equal(state.priceMap.native, 0.0225);
});
