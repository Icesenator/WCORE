// v4.16.83 - Regression: un payload degrade MAIS VALIDE ne doit pas etre ecarte.
//
// Contexte B3 (2026-09-29): les 2 endpoints de B3 sont chez thirdweb, qui
// renvoie HTTP 429 depuis l'IP de sortie Railway. L'API renvoie alors un
// payload `degraded: true` dont les `errors[]` sont des 429, MAIS dont le
// solde natif est correct et price (0,003242262221363933 ETH / 2376,45 EUR).
//
// Le GSheet preservait ce cache ancien (prix 2362,77 EUR, date du 2026-09-24)
// et affichait un "DONNEES FIGEES" alors que la donnee etait disponible :
// le signal etait un faux positif.
//
// Ces tests verrouillent le contrat de `_webScanMergeWithExistingCache_` :
// quand le payload degrade porte un solde natif utile, la fusion doit
// aboutir (chemin SEUR : met a jour le natif ET preserve les anciens actifs).
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "..", "src", "41_GSHEET_WEB_SCAN.gs");
const src = fs.readFileSync(SRC, "utf8");

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
  "_webScanHasUsefulAssets_", "_webScanAssetFromNative_", "_webScanIsScamToken_",
  "_webScanBlockedSet_", "_webScanPriorityTokenSet_", "_webScanMergeAsset_",
  "_webScanNeutralizePrice_", "_webScanMergedTotal_", "_webScanMergeWithExistingCache_",
  "_webScanConvertToWalletCache_", "_webScanShouldPreserveExistingCache_",
];

const ctx = {
  console, Math, JSON, Date, Object, Array, String, Number, isFinite, parseInt, parseFloat,
  GSHEET_WEB_MAX_TOKEN_PRICE_EUR: 1e6,
  GSHEET_WEB_MAX_TOKEN_VALUE_EUR: 1e7,
  CFG_CACHE_WALLET: 64,
  GSHEET_WEB_SCAN_VERSION: "test",
  Format: { now: () => new Date().toISOString(), datetime: (t) => new Date(t).toISOString() },
  _webScanChainKey_: (c) => String((c && c.CHAIN && (c.CHAIN.KEY || c.CHAIN.NAME)) || "B3"),
};
vm.createContext(ctx);
for (const n of NAMES) vm.runInContext(extract(n), ctx);

const RATE_LIMITED = [
  "https://b3.rpc.thirdweb.com: HTTP 429",
  "https://8333.rpc.thirdweb.com: HTTP 429",
];

// Payload reel B3 /api/scan : balance correcte, 429 sur la decouverte de tokens.
const b3Payload = (balance, priceEur) => ({
  ok: true, chain: "B3", chainName: "B3", vm: "EVM",
  timestamp: new Date().toISOString(),
  native: { symbol: "ETH", balance, priceEur, valueEur: balance * priceEur },
  tokens: [], blockedContracts: [], totalValueEur: balance * priceEur,
  errors: RATE_LIMITED, degraded: true, fxRate: 0.88, scanMs: 287,
  cacheStats: { hits: 0, misses: 0, stale: 0, skipped: 0 },
});

const existingCache = {
  assets: [{ contract: "native", symbol: "ETH", name: "ETH", balance: 0.003242262221363933, price_eur: 2362.774678918826, value_eur: 7.660735079053806 }],
  priceMap: { native: 2362.774678918826 },
  priceTsMap: { native: 1798070000000 },
  balanceTsMap: { native: 1798070000000 },
  updatedAt: 1798070000000,
  usd_to_eur_rate: 0.88,
};

const convert = (p) => ctx._webScanConvertToWalletCache_(p, { CACHE_VERSION: 64 }, "");

test("payload degrade mais valide (429 only) : la fusion aboutit et rafraichit le prix", () => {
  const payload = b3Payload(0.003242262221363933, 2376.446963091263);
  const incoming = convert(payload);

  // la conversion doit conserver le solde ET le prix
  assert.strictEqual(incoming.assets[0].contract, "native");
  assert.ok(incoming.assets[0].balance > 0, "le solde natif doit etre preserve");
  assert.strictEqual(incoming.assets[0].price_eur, 2376.446963091263);

  // 429 seul ne doit PAS faire ecarter la donnee: la fusion est le chemin seur
  const merged = ctx._webScanMergeWithExistingCache_(existingCache, incoming);
  assert.notStrictEqual(merged, null, "la fusion ne doit pas renvoyer null sur un natif utile");
  assert.strictEqual(merged.assets.length, 1);
  assert.strictEqual(merged.assets[0].price_eur, 2376.446963091263, "le prix frais doit remplacer l'ancien");
});

test("la fusion preserve les tokens existants quand le payload n'en renvoie aucun", () => {
  const payload = b3Payload(0.003242262221363933, 2376.446963091263);
  const incoming = convert(payload);
  // un ancien cache porte aussi un token ERC-20, absent du payload degrade
  const rich = {
    ...existingCache,
    assets: [
      ...existingCache.assets,
      { contract: "0xabc", symbol: "FOO", name: "Foo", balance: 5, price_eur: 2, value_eur: 10 },
    ],
  };
  const merged = ctx._webScanMergeWithExistingCache_(rich, incoming);
  assert.notStrictEqual(merged, null, "la fusion doit aboutir");
  const keys = merged.assets.map((a) => a.contract);
  assert.ok(keys.includes("native"), "le natif doit rester");
  assert.ok(keys.includes("0xabc"), "le token preexistant ne doit PAS etre perdu");
});

test("un payload degrade SANS solde (native a 0) reste ecarte : garde anti-regression", () => {
  const payload = b3Payload(0, null);
  payload.native.valueEur = 0;
  const incoming = convert(payload);
  assert.strictEqual(ctx._webScanHasUsefulAssets_(incoming), false, "un natif a 0 n'est pas utile");
  assert.strictEqual(
    ctx._webScanMergeWithExistingCache_(existingCache, incoming),
    null,
    "sans solde utile la fusion doit refuser (le cache ancien est preserve)"
  );
});
