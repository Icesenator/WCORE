// v4.16.70 - STALE_IS_NOT_FRESH / UNKNOWN_IS_NOT_ZERO (BONSAI/RBF 2026-10-29).
//
// Apres le correctif des pools Uniswap V3 vides (71cd60f), l'API ne renvoyait
// plus de prix pour BONSAI et RBF, mais le GSheet reaffichait l'ancien faux
// prix : la fusion gardait price_eur et l'entree priceMap du token rescanne.
// Ces tests verrouillent le contrat :
// - un token rescanne sans prix devient inconnu (null, jamais 0) ;
// - son entree priceMap/priceTsMap est retiree, quelle que soit la casse ;
// - un prix "cache-stale" de l'API garde son marqueur et son horodatage reel ;
// - un vrai prix frais efface le marqueur stale.
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
  "_webScanTokenIsStale_", "_webScanIsScamToken_",
  "_webScanBlockedSet_", "_webScanPriorityTokenSet_", "_webScanMergeAsset_",
  "_webScanNeutralizePrice_", "_webScanMergedTotal_", "_webScanDropUnpricedMapKeys_",
  "_webScanMergeWithExistingCache_", "_webScanConvertToWalletCache_",
];

const ctx = {
  console, Math, JSON, Date, Object, Array, String, Number, isFinite, parseInt, parseFloat,
  GSHEET_WEB_MAX_TOKEN_PRICE_EUR: 1e6,
  GSHEET_WEB_MAX_TOKEN_VALUE_EUR: 1e7,
  CFG_CACHE_WALLET: 64,
  GSHEET_WEB_SCAN_VERSION: "test",
  Format: { now: () => new Date().toISOString(), datetime: (t) => new Date(t).toISOString() },
  _webScanChainKey_: () => "BASE",
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "04E_FX_METADATA.gs"), "utf8"), ctx);
for (const n of NAMES) vm.runInContext(extract(n), ctx);

const BONSAI = "0x474f4cb764df9da079d94052fed39625c147c12c";
const RBF = "0x15de59489de5e7f240d72f787dc4a292b8199339";
const RBF_SHEET = "0x15De59489de5e7F240D72F787dC4a292b8199339";
const OLD_TS = Date.now() - 3 * 24 * 3600 * 1000;

const payload = (tokens) => ({
  ok: true, chain: "BASE", chainName: "Base", vm: "EVM",
  native: { symbol: "ETH", balance: 0.002, priceEur: 2074, valueEur: 4.148 },
  tokens, blockedContracts: [], errors: [], degraded: true, fxRate: 0.9, scanMs: 10,
});
const convert = (p) => ctx._webScanConvertToWalletCache_(p, { CACHE_VERSION: 64 }, "");

const existing = () => ({
  assets: [
    { contract: "native", symbol: "ETH", name: "ETH", balance: 0.002, price_eur: 2070, value_eur: 4.14 },
    { contract: BONSAI, symbol: "BONSAI", name: "Bonsai", balance: 1491.775, price_eur: 0.01073570875, value_eur: 16.01526192 },
    { contract: RBF, symbol: "RBF", name: "Robots.Farm", balance: 670.285899, price_eur: 0.000604689417, value_eur: 0.4053147895 },
  ],
  priceMap: { native: 2070, [BONSAI]: 0.01073570875, [RBF_SHEET]: 0.000604689417 },
  priceTsMap: { native: OLD_TS, [BONSAI]: OLD_TS, [RBF_SHEET]: OLD_TS },
  balanceTsMap: { native: OLD_TS, [BONSAI]: OLD_TS, [RBF]: OLD_TS },
  updatedAt: OLD_TS,
  usd_to_eur_rate: 0.9,
});

test("BONSAI/RBF rescannes sans prix : inconnus, jamais l'ancien prix ni 0", () => {
  const incoming = convert(payload([
    { contract: BONSAI, symbol: "BONSAI", name: "Bonsai", decimals: 18, balance: 1491.775, priceEur: null, valueEur: null, flags: ["NO_PRICE"] },
    { contract: RBF, symbol: "RBF", name: "Robots.Farm", decimals: 18, balance: 670.285899, priceEur: null, valueEur: null, flags: ["NO_PRICE"] },
  ]));
  const merged = ctx._webScanMergeWithExistingCache_(existing(), incoming);
  assert.notStrictEqual(merged, null);
  for (const c of [BONSAI, RBF]) {
    const a = merged.assets.find((x) => x.contract.toLowerCase() === c);
    assert.ok(a, `${c} doit rester liste (solde connu)`);
    assert.strictEqual(a.price_eur, null, "UNKNOWN_IS_NOT_ZERO : prix inconnu, pas l'ancien");
    assert.strictEqual(a.value_eur, null, "FINANCIAL_FALSE_ZERO=FORBIDDEN");
  }
  const priceKeys = Object.keys(merged.priceMap).map((k) => k.toLowerCase());
  const tsKeys = Object.keys(merged.priceTsMap).map((k) => k.toLowerCase());
  assert.ok(!priceKeys.includes(BONSAI) && !priceKeys.includes(RBF), "priceMap ne doit plus ressusciter l'ancien prix");
  assert.ok(!tsKeys.includes(BONSAI) && !tsKeys.includes(RBF));
  assert.strictEqual(merged.priceMap.native, 2074, "le natif frais reste");
});

test("prix cache-stale de l'API : marque et horodate a sa date reelle", () => {
  const staleTs = Date.now() - 2 * 3600 * 1000;
  const incoming = convert(payload([
    { contract: BONSAI, symbol: "BONSAI", name: "Bonsai", decimals: 18, balance: 1491.775, priceEur: 0.0016, valueEur: 2.3868, priceSource: "cache-stale", priceStale: true, priceTs: staleTs, flags: ["STALE_PRICE"] },
  ]));
  const asset = incoming.assets.find((x) => x.contract === BONSAI);
  assert.strictEqual(asset.price_stale, true);
  assert.strictEqual(asset.price_ts, staleTs);
  assert.strictEqual(incoming.priceTsMap[BONSAI], staleTs, "STALE_IS_NOT_FRESH : pas d'horodatage 'maintenant'");
  const merged = ctx._webScanMergeWithExistingCache_(existing(), incoming);
  const m = merged.assets.find((x) => x.contract === BONSAI);
  assert.strictEqual(m.price_stale, true);
  assert.strictEqual(m.price_eur, 0.0016);
});

test("le marqueur STALE_PRICE seul (sans priceStale) suffit", () => {
  const incoming = convert(payload([
    { contract: RBF, symbol: "RBF", name: "Robots.Farm", decimals: 18, balance: 670.285899, priceEur: 0.00000035, valueEur: 0.000234600065, flags: ["STALE_PRICE"] },
  ]));
  assert.strictEqual(incoming.assets.find((x) => x.contract === RBF).price_stale, true);
});

test("un prix frais efface le marqueur stale precedent", () => {
  const old = existing();
  old.assets[1].price_stale = true;
  old.assets[1].price_ts = OLD_TS;
  const incoming = convert(payload([
    { contract: BONSAI, symbol: "BONSAI", name: "Bonsai", decimals: 18, balance: 1491.775, priceEur: 0.00162, valueEur: 2.4167, priceSource: "gt-batch" },
  ]));
  const merged = ctx._webScanMergeWithExistingCache_(old, incoming);
  const m = merged.assets.find((x) => x.contract === BONSAI);
  assert.strictEqual(m.price_eur, 0.00162);
  assert.strictEqual(m.price_stale, undefined);
  assert.strictEqual(m.price_ts, undefined);
  assert.ok(merged.priceTsMap[BONSAI] > OLD_TS);
});

test("API ancienne (sans priceStale) : comportement inchange pour un prix present", () => {
  const incoming = convert(payload([
    { contract: BONSAI, symbol: "BONSAI", name: "Bonsai", decimals: 18, balance: 1491.775, priceEur: 0.00162, valueEur: 2.4167 },
  ]));
  const a = incoming.assets.find((x) => x.contract === BONSAI);
  assert.strictEqual(a.price_eur, 0.00162);
  assert.strictEqual(a.price_stale, undefined);
});
