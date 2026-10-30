// v4.16.70 - Fraicheur des prix de bout en bout (BONSAI/RBF, Base).
//
// Contrat verrouille :
// - un token rescanne qui revient SANS prix valide devient INCONNU (price/value null)
//   et ses entrees priceMap/priceTsMap disparaissent, quelle que soit la casse ;
// - un prix "dernier connu" de l'API (priceStale / flag STALE_PRICE) est stocke avec
//   price_stale et la date de son observation, jamais l'heure du scan ;
// - un prix frais efface le marqueur ; une API ancienne (sans champ) ne change rien ;
// - le plafond 6 h de la v4.16.69 ne neutralise pas un prix stale encore dans sa
//   fenetre, mais neutralise un prix conserve plus vieux que 6 h.
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "41_GSHEET_WEB_SCAN.gs"), "utf8");

function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} doit exister dans 41_GSHEET_WEB_SCAN.gs`);
  const bodyStart = src.indexOf("{", start);
  let depth = 0;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`${name}: corps non ferme`);
}

const NAMES = [
  "_webScanNum_", "_webScanFirstNum_", "_webScanAssetKey_", "_webScanClone_",
  "_webScanHasUsefulAssets_", "_webScanAssetFromNative_", "_webScanAssetFromToken_",
  "_webScanTokenIsStale_", "_webScanPriceTs_", "_webScanIsScamToken_",
  "_webScanBlockedSet_", "_webScanPriorityTokenSet_", "_webScanMergeAsset_",
  "_webScanNeutralizePrice_", "_webScanMergedTotal_", "_webScanMergeWithExistingCache_",
  "_webScanDropUnpricedMapKeys_", "_webScanConvertToWalletCache_",
];

const ctx = {
  console, Math, JSON, Date, Object, Array, String, Number, isFinite, parseInt, parseFloat,
  GSHEET_WEB_MAX_PRESERVED_PRICE_AGE_MS: 6 * 60 * 60 * 1000,
  GSHEET_WEB_MAX_TOKEN_PRICE_EUR: 1e9,
  GSHEET_WEB_MAX_TOKEN_VALUE_EUR: 1e12,
  CFG_CACHE_WALLET: 64,
  GSHEET_WEB_SCAN_VERSION: "test",
  Format: { now: () => new Date().toISOString(), datetime: (t) => new Date(t).toISOString() },
  _webScanChainKey_: () => "BASE",
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "04E_FX_METADATA.gs"), "utf8"), ctx);
for (const n of NAMES) vm.runInContext(extract(n), ctx);

const HOUR = 60 * 60 * 1000;
const BONSAI = "0x474f4cb764df9da079d94052fed39625c147c12c";
const RBF = "0x15de59489de5e7f240d72f787dc4a292b8199339";
const BONSAI_MIXED = "0x474F4cb764DF9da079d94052FED39625c147C12c";
const RBF_MIXED = "0x15DE59489de5E7f240d72F787dc4A292b8199339";

const payload = (tokens, extra = {}) => ({
  ok: true, chain: "BASE", chainName: "Base", vm: "EVM",
  timestamp: new Date().toISOString(),
  native: { symbol: "ETH", balance: 0.002, priceEur: 2074, valueEur: 4.148 },
  tokens, blockedContracts: [], totalValueEur: 0,
  errors: [], degraded: true, fxRate: 0.8966, scanMs: 100,
  ...extra,
});
const convert = (p) => ctx._webScanConvertToWalletCache_(p, { CACHE_VERSION: 64 }, "");
const token = (contract, symbol, balance, priceEur, extra = {}) => ({
  contract, symbol, name: symbol, decimals: 18, balance, priceEur,
  valueEur: priceEur == null ? null : balance * priceEur, ...extra,
});
const find = (cache, symbol) => cache.assets.find((a) => a.symbol === symbol);

function existingWithFakePrices() {
  const now = Date.now();
  return {
    assets: [
      { contract: "native", symbol: "ETH", name: "ETH", balance: 0.002, price_eur: 2074, value_eur: 4.148 },
      { contract: BONSAI, symbol: "BONSAI", name: "Bonsai Token", balance: 1491.775, price_eur: 0.01073570875, value_eur: 16.0152 },
      { contract: RBF, symbol: "RBF", name: "Robots.Farm", balance: 670.285899, price_eur: 0.000604689417, value_eur: 0.4053 },
    ],
    // Cles de l'API avec leur casse d'origine.
    priceMap: { native: 2074, [BONSAI_MIXED]: 0.01073570875, [RBF_MIXED]: 0.000604689417 },
    priceTsMap: { native: now - HOUR, [BONSAI_MIXED]: now - HOUR, [RBF_MIXED]: now - HOUR },
    balanceTsMap: { native: now - HOUR },
    updatedAt: now - HOUR,
    usd_to_eur_rate: 0.8966,
  };
}

test("BONSAI/RBF rescannes sans prix : INCONNU, priceMap/priceTsMap purges en casse mixte", () => {
  const incoming = convert(payload([
    token(BONSAI, "BONSAI", 1491.775, null),
    token(RBF, "RBF", 670.285899, null),
  ]));
  const merged = ctx._webScanMergeWithExistingCache_(existingWithFakePrices(), incoming);
  assert.notStrictEqual(merged, null);
  for (const sym of ["BONSAI", "RBF"]) {
    const a = find(merged, sym);
    assert.ok(a, `${sym} reste liste (le solde est reel)`);
    assert.strictEqual(a.price_eur, null, `${sym} : l'ancien prix ne doit pas revenir`);
    assert.strictEqual(a.value_eur, null, `${sym} : pas de valeur sans prix (jamais 0)`);
    assert.ok(a.balance > 0, `${sym} : le solde n'est pas mis a zero`);
  }
  for (const k of [BONSAI_MIXED, RBF_MIXED, BONSAI, RBF]) {
    assert.ok(!(k in merged.priceMap), `priceMap ne doit plus contenir ${k}`);
    assert.ok(!(k in merged.priceTsMap), `priceTsMap ne doit plus contenir ${k}`);
  }
  assert.strictEqual(merged.priceMap.native, 2074, "le natif rescanne garde son prix");
  assert.ok(Math.abs(merged.scanStats.totalValueEur - 4.148) < 1e-9, "le total exclut les prix inconnus");
});

test("prix stale de l'API : price_stale + horodatage d'observation (pas l'heure du scan)", () => {
  const observedAt = Date.now() - 2 * HOUR;
  const asset = ctx._webScanAssetFromToken_(token(BONSAI, "BONSAI", 10, 0.00162, { priceStale: true, priceTs: observedAt }));
  assert.strictEqual(asset.price_stale, true);
  assert.strictEqual(asset.price_ts, observedAt);
  const cache = convert(payload([token(BONSAI, "BONSAI", 10, 0.00162, { priceStale: true, priceTs: observedAt })]));
  const key = Object.keys(cache.priceTsMap).find((k) => k.toLowerCase() === BONSAI);
  assert.ok(key, "le prix stale reste dans priceMap/priceTsMap");
  assert.strictEqual(cache.priceTsMap[key], observedAt, "priceTsMap porte la date d'observation");
  // horodatage en secondes accepte
  const inSeconds = ctx._webScanAssetFromToken_(token(BONSAI, "BONSAI", 10, 0.00162, { priceStale: true, priceTs: Math.floor(observedAt / 1000) }));
  assert.strictEqual(inSeconds.price_ts, Math.floor(observedAt / 1000) * 1000);
});

test("flag STALE_PRICE seul (contrat ChainScan) : prix marque stale, sans horodatage invente", () => {
  const asset = ctx._webScanAssetFromToken_(token(RBF, "RBF", 670, 0.00000037, { flags: ["STALE_PRICE"] }));
  assert.strictEqual(asset.price_stale, true);
  assert.strictEqual(asset.price_ts, undefined);
  const unknown = ctx._webScanAssetFromToken_(token(RBF, "RBF", 670, null, { priceStale: true }));
  assert.strictEqual(unknown.price_stale, undefined, "pas de marqueur stale sans prix");
});

test("un prix frais efface le marqueur stale d'un cache existant", () => {
  const existing = existingWithFakePrices();
  existing.assets[1].price_stale = true;
  existing.assets[1].price_ts = Date.now() - 3 * HOUR;
  const incoming = convert(payload([token(BONSAI, "BONSAI", 1491.775, 0.00162)]));
  const merged = ctx._webScanMergeWithExistingCache_(existing, incoming);
  const a = find(merged, "BONSAI");
  assert.strictEqual(a.price_eur, 0.00162);
  assert.strictEqual(a.price_stale, undefined);
  assert.strictEqual(a.price_ts, undefined);
});

test("API ancienne (sans priceStale ni flags) : comportement inchange, prix date du scan", () => {
  const before = Date.now();
  const cache = convert(payload([token(BONSAI, "BONSAI", 10, 0.00162)]));
  const a = find(cache, "BONSAI");
  assert.strictEqual(a.price_eur, 0.00162);
  assert.strictEqual(a.price_stale, undefined);
  const key = Object.keys(cache.priceTsMap).find((k) => k.toLowerCase() === BONSAI);
  assert.ok(cache.priceTsMap[key] >= before, "prix frais date de l'heure du scan");
});

test("plafond 6 h : un prix stale dans sa fenetre n'est pas neutralise", () => {
  const observedAt = Date.now() - 2 * HOUR;
  const incoming = convert(payload([token(BONSAI, "BONSAI", 1491.775, 0.00162, { priceStale: true, priceTs: observedAt })]));
  const merged = ctx._webScanMergeWithExistingCache_(existingWithFakePrices(), incoming);
  const a = find(merged, "BONSAI");
  assert.strictEqual(a.price_eur, 0.00162, "le prix stale reste affiche");
  assert.strictEqual(a.price_stale, true);
  const key = Object.keys(merged.priceTsMap).find((k) => k.toLowerCase() === BONSAI);
  assert.strictEqual(merged.priceTsMap[key], observedAt);
  assert.strictEqual(merged.scanStats.webMergeExpiredPrices, undefined);
});

test("plafond 6 h : un prix conserve (token absent du scan) de plus de 6 h est neutralise, un recent garde", () => {
  const now = Date.now();
  const existing = existingWithFakePrices();
  existing.priceTsMap[BONSAI_MIXED] = now - 7 * HOUR;
  existing.priceTsMap[RBF_MIXED] = now - HOUR;
  // Ni BONSAI ni RBF dans le payload : ils sont conserves depuis le cache.
  const incoming = convert(payload([]));
  const merged = ctx._webScanMergeWithExistingCache_(existing, incoming);
  const bonsai = find(merged, "BONSAI");
  const rbf = find(merged, "RBF");
  assert.strictEqual(bonsai.price_eur, null, "prix conserve de 7 h : neutralise");
  assert.strictEqual(bonsai.value_eur, null);
  assert.ok(bonsai.balance > 0);
  assert.ok(!(BONSAI_MIXED in merged.priceMap) && !(BONSAI_MIXED in merged.priceTsMap), "entrees expirees purgees en casse mixte");
  assert.strictEqual(merged.scanStats.webMergeExpiredPrices, 1);
  // Cle priceTsMap en casse mixte et horodatage d'1 h : le prix conserve reste.
  assert.strictEqual(rbf.price_eur, 0.000604689417, "prix conserve recent (cle en casse mixte) : garde");
  assert.strictEqual(merged.priceMap[RBF_MIXED], 0.000604689417);
});
