# xStocks Solana GSheet Implementation Plan

> **Plan initial (historique)** : le design et le routage on été partiellement retravaillés en production. Sur `master`, le registre API `xstocks-registry.ts`, le format de cache `xm` et la consolidation finale décrits ici ne correspondent pas au code fusionné (voir `wcore-gsheet/src/44_XSTOCKS_SOLANA.gs` et `wcore-gsheet/src/42_STOCK_PORTFOLIO.gs` pour l'état réel). Ne pas réexécuter tel quel ; garder comme référence de conception.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intégrer les xStocks Solana détenus sur le wallet Ledger dans un pipeline actions WCORE `Ledger - Solana Action` → `Portefeuille Action Details` → `Portefeuille Action`, sans second scan Solana ni double comptage Crypto/Action.

**Architecture:** Le web-scan Solana reste l’unique lecture onchain. L’API WCORE enrichit les tokens Solana avec le registre public xStocks et leur multiplier ; Apps Script persiste ce metadata dans le cache packed (`xm`) puis projette le même cache vers deux sorties exclusives. `Ledger - Solana Crypto` conserve A:G + `Vérif` H + I1/J1. `Ledger - Solana Action` conserve A:G + `Vérif` H, miroir I1/J1 depuis Crypto, et expose quantité brute/multiplier en K:L. La quantité ajustée utilisée par Details reste en E.

**Tech Stack:** Google Apps Script (`.gs`), Google Sheets API, Node.js tests (`node:test`), TypeScript/Fastify, cache WCORE, API publique xStocks v2.

---

## Structure des fichiers

### Créations

- `wcore-web/apps/api/src/xstocks/xstocks-registry.ts` — client public xStocks, validation, pagination, index Solana par mint et cache last-good.
- `wcore-web/apps/api/src/xstocks/xstocks-registry.test.ts` — tests parsing, pagination, multiplier et conservation last-good.
- `wcore-gsheet/src/44_XSTOCKS_SOLANA.gs` — classification pure, projections Crypto/Action, setup/migration des feuilles et refresh de `Portefeuille Action Details`.
- `wcore-gsheet/tests/xstocks-solana-classification.test.js` — tests du routage exclusif et du multiplier.
- `wcore-gsheet/tests/xstocks-solana-sheets.test.js` — gardes structurelles, formules et scan unique.
- `wcore-gsheet/tests/action-portfolio-details.test.js` — tests du builder Details et de la consolidation Action.

### Modifications

- `wcore-web/apps/api/src/plugins/gsheet.ts` — enrichissement du résultat `/api/gsheet/scan` Solana et support des symboles actions demandés.
- `wcore-web/apps/api/src/plugins/gsheet.test.ts` — tests de route/enrichissement.
- `wcore-web/apps/api/src/server.ts` — injection du registre xStocks et propagation de `symbols` au provider actions.
- `wcore-web/apps/api/src/stocks/stock-portfolio.ts` — inclusion des actions xStocks demandées hors univers classé.
- `wcore-web/apps/api/src/stocks/stock-portfolio.test.ts` — tests des symboles demandés.
- `wcore-gsheet/src/SOLANA.gs` — fonctions cache projetées Crypto/Action, sans second `SOLANA_REFRESH_STATUS`.
- `wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs` — copie de `token.xstock` vers l’asset cache.
- `wcore-gsheet/src/04B_CACHE_WALLET.gs` — pack/unpack d’une map `xm` `{ mint: [xstockSymbol, underlyingSymbol, multiplier] }`.
- `wcore-gsheet/tests/web-scan-adapter.test.js` — conservation du metadata xStocks après conversion cache.
- `wcore-gsheet/tests/packed-wallet-cache.test.js` — round-trip de `xm`.
- `wcore-gsheet/src/16_REFRESH.gs` — checkbox Action redirigée vers le Ledger Crypto source.
- `wcore-gsheet/src/17_LISTING.gs` — hyperliens pour les deux feuilles Details.
- `wcore-gsheet/src/35_BITPANDA_SYNC.gs` — `Vérif` Stocks fondé sur `Portefeuille Action Details`.
- `wcore-gsheet/src/42_STOCK_PORTFOLIO.gs` — lecture des symboles xStocks, appel API enrichi et Total € basé sur Details.
- `wcore-gsheet/tests/stock-portfolio-sheet-layout.test.js` — nouvelle formule Total €.
- `wcore-gsheet/tests/crypto-v2-dependency-migration.test.js` — garde du nouveau `Vérif` actions.
- `wcore-gsheet/tests/listing-links.test.js` — hyperliens Crypto + Action Details.

---

### Task 1: Registre public xStocks Solana côté API

**Files:**
- Create: `wcore-web/apps/api/src/xstocks/xstocks-registry.ts`
- Create: `wcore-web/apps/api/src/xstocks/xstocks-registry.test.ts`

- [ ] **Step 1: Écrire les tests rouges du registre**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { XstocksRegistry } from "./xstocks-registry.js";

const AAPL_MINT = "XsFakeAaplMint111111111111111111111111111";

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

test("indexe uniquement les deployments Solana par mint", async () => {
  const calls: string[] = [];
  const registry = new XstocksRegistry({
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("/AAPLx/multiplier")) return response({ multiplier: 1.02 });
      return response({
        nodes: [{
          symbol: "AAPLx",
          name: "Apple xStock",
          underlyingSymbol: "AAPL",
          deployments: [
            { network: "solana", address: AAPL_MINT },
            { network: "ethereum", address: "0xabc" },
          ],
        }],
        page: { currentPage: 1, hasNextPage: false },
      });
    },
  });

  const item = await registry.findSolanaMint(AAPL_MINT);
  assert.deepEqual(item, {
    mint: AAPL_MINT,
    xstockSymbol: "AAPLx",
    underlyingSymbol: "AAPL",
    name: "Apple xStock",
    multiplier: 1.02,
  });
  assert.equal(await registry.findSolanaMint("0xabc"), null);
  assert.equal(calls.filter((url) => url.includes("/multiplier")).length, 1);
});

test("conserve le dernier registre valide si le refresh échoue", async () => {
  let fail = false;
  const registry = new XstocksRegistry({
    ttlMs: 0,
    fetchImpl: async (url) => {
      if (fail) throw new Error("network down");
      if (String(url).includes("/AAPLx/multiplier")) return response({ multiplier: 1 });
      return response({ nodes: [{ symbol: "AAPLx", name: "Apple", underlyingSymbol: "AAPL", deployments: [{ network: "solana", address: AAPL_MINT }] }], page: { currentPage: 1, hasNextPage: false } });
    },
  });
  assert.ok(await registry.findSolanaMint(AAPL_MINT));
  fail = true;
  assert.ok(await registry.findSolanaMint(AAPL_MINT));
});
```

- [ ] **Step 2: Exécuter le test et constater l’échec**

Run: `pnpm --dir wcore-web exec tsx --test apps/api/src/xstocks/xstocks-registry.test.ts`

Expected: FAIL avec `Cannot find module './xstocks-registry.js'`.

- [ ] **Step 3: Implémenter le registre minimal**

```ts
export interface SolanaXstock {
  mint: string;
  xstockSymbol: string;
  underlyingSymbol: string;
  name: string;
  multiplier: number;
}

interface RegistryDeps {
  fetchImpl?: typeof fetch;
  ttlMs?: number;
  baseUrl?: string;
}

export class XstocksRegistry {
  private readonly fetchImpl: typeof fetch;
  private readonly ttlMs: number;
  private readonly baseUrl: string;
  private cache = new Map<string, SolanaXstock>();
  private loadedAt = 0;

  constructor(deps: RegistryDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.ttlMs = deps.ttlMs ?? 6 * 60 * 60 * 1000;
    this.baseUrl = deps.baseUrl ?? "https://api.xstocks.fi/api/v2";
  }

  async findSolanaMint(mint: string): Promise<SolanaXstock | null> {
    await this.refreshIfNeeded();
    return this.cache.get(String(mint ?? "").trim()) ?? null;
  }

  private async refreshIfNeeded(): Promise<void> {
    if (this.cache.size && Date.now() - this.loadedAt < this.ttlMs) return;
    try {
      const assets: Array<Record<string, unknown>> = [];
      let page = 1;
      let hasNextPage = true;
      while (hasNextPage) {
        const res = await this.fetchImpl(`${this.baseUrl}/public/assets?page=${page}`);
        if (!res.ok) throw new Error(`xStocks assets HTTP ${res.status}`);
        const body = await res.json() as { nodes?: Array<Record<string, unknown>>; page?: { hasNextPage?: boolean } };
        assets.push(...(body.nodes ?? []));
        hasNextPage = body.page?.hasNextPage === true;
        page += 1;
      }
      const next = new Map<string, SolanaXstock>();
      for (const asset of assets) {
        const symbol = String(asset.symbol ?? "").trim();
        const underlyingSymbol = String(asset.underlyingSymbol ?? "").trim().toUpperCase();
        if (!symbol || !underlyingSymbol) continue;
        const deployments = Array.isArray(asset.deployments) ? asset.deployments as Array<Record<string, unknown>> : [];
        const solana = deployments.find((deployment) => /solana/i.test(String(deployment.network ?? deployment.chain ?? "")));
        const mint = String(solana?.address ?? solana?.contractAddress ?? "").trim();
        if (!mint) continue;
        const multiplierRes = await this.fetchImpl(`${this.baseUrl}/public/assets/${encodeURIComponent(symbol)}/multiplier`);
        if (!multiplierRes.ok) continue;
        const multiplierBody = await multiplierRes.json() as Record<string, unknown>;
        const multiplier = Number(multiplierBody.multiplier ?? multiplierBody.value);
        if (!Number.isFinite(multiplier) || multiplier <= 0) continue;
        next.set(mint, { mint, xstockSymbol: symbol, underlyingSymbol, name: String(asset.name ?? symbol), multiplier });
      }
      if (next.size) {
        this.cache = next;
        this.loadedAt = Date.now();
      }
    } catch (error) {
      if (!this.cache.size) throw error;
    }
  }
}
```

- [ ] **Step 4: Exécuter le test**

Run: `pnpm --dir wcore-web exec tsx --test apps/api/src/xstocks/xstocks-registry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add wcore-web/apps/api/src/xstocks/xstocks-registry.ts wcore-web/apps/api/src/xstocks/xstocks-registry.test.ts
git commit -m "feat(api): add Solana xStocks registry"
```

---

### Task 2: Enrichir le scan Solana sans modifier le moteur SVM

**Files:**
- Modify: `wcore-web/apps/api/src/plugins/gsheet.ts:36-50,78-97,963-974`
- Modify: `wcore-web/apps/api/src/plugins/gsheet.test.ts`
- Modify: `wcore-web/apps/api/src/server.ts:424-460`

- [ ] **Step 1: Ajouter un test rouge d’enrichissement**

Ajouter dans `gsheet.test.ts` un provider de registre et un `scanRunner` retournant `AAPLx`, puis vérifier que le token reçoit `xstock` :

```ts
assert.deepEqual(body.tokens[0].xstock, {
  xstockSymbol: "AAPLx",
  underlyingSymbol: "AAPL",
  rawBalance: 0.5,
  multiplier: 1.02,
  adjustedBalance: 0.51,
});
```

Ajouter aussi un token au symbole `AAPLx` mais avec un mint inconnu et vérifier `body.tokens[1].xstock === undefined`.

- [ ] **Step 2: Exécuter le test rouge**

Run: `pnpm --dir wcore-web exec tsx --test apps/api/src/plugins/gsheet.test.ts`

Expected: FAIL car `xstocksRegistry` et `xstock` n’existent pas.

- [ ] **Step 3: Étendre les types et enrichir uniquement après le scan**

Ajouter à `GsheetPluginOptions` :

```ts
xstocksRegistry?: { findSolanaMint: (mint: string) => Promise<import("../xstocks/xstocks-registry.js").SolanaXstock | null> };
```

Ajouter une fonction pure/asynchrone appelée sur le résultat sanitizé :

```ts
async function enrichSolanaXstocks(result: GsheetScanResult, registry: NonNullable<GsheetPluginOptions["xstocksRegistry"]>): Promise<GsheetScanResult> {
  if (String(result.chain).toUpperCase() !== "SOLANA") return result;
  const tokens = await Promise.all((result.tokens ?? []).map(async (token) => {
    const row = token as Record<string, unknown>;
    const mint = String(row.contract ?? row.address ?? "").trim();
    const match = mint ? await registry.findSolanaMint(mint) : null;
    if (!match) return token;
    const rawBalance = Number(row.balance);
    return {
      ...row,
      xstock: {
        xstockSymbol: match.xstockSymbol,
        underlyingSymbol: match.underlyingSymbol,
        rawBalance,
        multiplier: match.multiplier,
        adjustedBalance: Number.isFinite(rawBalance) ? rawBalance * match.multiplier : null,
      },
    };
  }));
  return { ...result, tokens };
}
```

Dans la route scan, appliquer cette fonction après `sanitizeGsheetScanResult` et avant la réponse. Instancier `new XstocksRegistry()` une fois dans `server.ts`, puis l’injecter dans `gsheetPlugin`.

Persister le metadata côté GAS, car le cache packed actuel ne conserve que `[contract, balance, symbol, name, decimals]`.

Dans `_webScanAssetFromToken_` (`41_GSHEET_WEB_SCAN.gs:286-310`), copier `tokenObj.xstock` vers `asset.xstock` si `underlyingSymbol` et `multiplier` sont valides. Dans `_deflateWalletPayload_` / `_inflateWalletPayload_` (`04B_CACHE_WALLET.gs`), stocker une map compacte `xm` :

```js
// deflate
if (a.xstock && a.xstock.underlyingSymbol && Number(a.xstock.multiplier) > 0) {
  if (!out.xm) out.xm = {};
  out.xm[c] = [String(a.xstock.xstockSymbol || ""), String(a.xstock.underlyingSymbol), Number(a.xstock.multiplier)];
}
// inflate
if (compact.xm && compact.xm[c]) {
  asset.xstock = {
    xstockSymbol: compact.xm[c][0],
    underlyingSymbol: compact.xm[c][1],
    rawBalance: Number(asset.balance),
    multiplier: Number(compact.xm[c][2]),
    adjustedBalance: Number(asset.balance) * Number(compact.xm[c][2])
  };
}
```

Ajouter un test `web-scan-adapter` : un token Solana avec `xstock` produit `cache.assets[].xstock`. Ajouter un test packed : deflate/inflate conserve `xm` et reconstruit `asset.xstock`.

- [ ] **Step 4: Exécuter les tests API et cache**

Run: `pnpm --dir wcore-web exec tsx --test apps/api/src/plugins/gsheet.test.ts apps/api/src/xstocks/xstocks-registry.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add wcore-web/apps/api/src/plugins/gsheet.ts wcore-web/apps/api/src/plugins/gsheet.test.ts wcore-web/apps/api/src/server.ts
git commit -m "feat(api): enrich Solana scans with xStocks metadata"
```

---

### Task 3: Projeter un cache Solana unique vers Crypto et Action

**Files:**
- Create: `wcore-gsheet/src/44_XSTOCKS_SOLANA.gs`
- Create: `wcore-gsheet/tests/xstocks-solana-classification.test.js`
- Modify: `wcore-gsheet/src/SOLANA.gs:52-55` — wrappers `CACHED_WALLET_ASSETS_SOLANA_CRYPTO`, `CACHED_WALLET_ASSETS_SOLANA_ACTION`, `CACHED_WALLET_ASSETS_SOLANA_ACTION_META`.

- [ ] **Step 1: Écrire les tests rouges de classification**

Le test charge `44_XSTOCKS_SOLANA.gs` dans `vm` et utilise les lignes suivantes :

```js
const rows = [
  ['chain_name','token_ticker','token_name','contract_address','balance','price_eur','value_eur'],
  ['Ledger - Solana','SOL','Solana','native',1,100,100],
  ['Ledger - Solana','EURC','EURC','HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr',20,1,20],
  ['Ledger - Solana','USDC','USD Coin','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',30,0.92,27.6],
  ['Ledger - Solana','AAPLx','Apple xStock','AAPL_MINT',0.5,180,90,{ underlyingSymbol:'AAPL', rawBalance:0.5, multiplier:1.02, adjustedBalance:0.51 }],
  ['Ledger - Solana','AAPLx','Fake Apple','FAKE_MINT',2,1,2],
];
```

Vérifier :

```js
assert.deepEqual(cryptoSymbols, ['SOL', 'USDC', 'AAPLx']);
assert.deepEqual(actionSymbols, ['EURC', 'AAPL']);
assert.equal(actionAapl[4], 0.51);
assert.equal(actionEurc[4], 20);
assert.deepEqual(actionMeta[1], [0.5, 1.02]);
assert.deepEqual(actionMeta[0], [20, 1]);
```

- [ ] **Step 2: Exécuter le test rouge**

Run: `node --test wcore-gsheet/tests/xstocks-solana-classification.test.js`

Expected: FAIL car les helpers n’existent pas.

- [ ] **Step 3: Implémenter les projections pures**

Dans `44_XSTOCKS_SOLANA.gs`, définir :

```js
var XSTOCKS_SOLANA_EURC_MINT = "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr";

function _xstocksIsInfoRow_(row) {
  return !row || row[0] === "META" || String(row[1] || "").indexOf("INFO") === 0;
}

function _xstocksMetadata_(row) {
  var meta = row && row.xstock ? row.xstock : (row && row[7] && typeof row[7] === "object" ? row[7] : null);
  return meta && meta.underlyingSymbol ? meta : null;
}

function _xstocksProjectCryptoRows_(rows) {
  return (rows || []).filter(function(row, index) {
    if (index === 0 || _xstocksIsInfoRow_(row)) return true;
    var mint = String(row[3] || "");
    return mint !== XSTOCKS_SOLANA_EURC_MINT && !_xstocksMetadata_(row);
  }).map(function(row, index) {
    var copy = row.slice(0, 7);
    if (index > 0 && !_xstocksIsInfoRow_(copy)) copy[0] = "Ledger - Solana Crypto";
    return copy;
  });
}

function _xstocksProjectActionRows_(rows) {
  var out = [["chain_name","token_ticker","token_name","contract_address","balance","price_eur","value_eur"]];
  (rows || []).forEach(function(row, index) {
    if (index === 0 || _xstocksIsInfoRow_(row)) return;
    var mint = String(row[3] || "");
    var meta = _xstocksMetadata_(row);
    if (mint === XSTOCKS_SOLANA_EURC_MINT) {
      out.push(["Ledger - Solana Action","EURC","EURC",mint,Number(row[4]) || 0,1,Number(row[4]) || 0]);
      return;
    }
    if (!meta) return;
    var adjusted = Number(meta.adjustedBalance);
    var price = Number(row[5]);
    out.push(["Ledger - Solana Action",String(meta.underlyingSymbol).toUpperCase(),row[2],mint,adjusted,price > 0 ? price : "",price > 0 && adjusted >= 0 ? adjusted * price : ""]);
  });
  return out;
}

function _xstocksProjectActionMeta_(rows) {
  var out = [["raw_balance","multiplier"]];
  (rows || []).forEach(function(row, index) {
    if (index === 0 || _xstocksIsInfoRow_(row)) return;
    var mint = String(row[3] || "");
    var meta = _xstocksMetadata_(row);
    if (mint === XSTOCKS_SOLANA_EURC_MINT) { out.push([Number(row[4]) || 0, 1]); return; }
    if (!meta) return;
    out.push([Number(meta.rawBalance), Number(meta.multiplier)]);
  });
  return out;
}
```

Les wrappers `CACHED_WALLET_ASSETS_SOLANA_CRYPTO`, `CACHED_WALLET_ASSETS_SOLANA_ACTION` et `CACHED_WALLET_ASSETS_SOLANA_ACTION_META` appellent tous `_SOLANA.getCachedWalletAssets(a)` puis projettent le résultat. Aucun wrapper Action ne doit appeler `_SOLANA.getRefreshStatus` ou `_webScanWallet_`. Le spill Action reste 7 colonnes A:G ; K2 reçoit uniquement le spill 2 colonnes brut/multiplier.

- [ ] **Step 4: Exécuter le test**

Run: `node --test wcore-gsheet/tests/xstocks-solana-classification.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add wcore-gsheet/src/44_XSTOCKS_SOLANA.gs wcore-gsheet/src/SOLANA.gs wcore-gsheet/tests/xstocks-solana-classification.test.js
git commit -m "feat(gsheet): split Solana cache into crypto and action views"
```

---

### Task 4: Setup/migration des deux Ledgers avec un seul refresh

**Files:**
- Modify: `wcore-gsheet/src/44_XSTOCKS_SOLANA.gs`
- Modify: `wcore-gsheet/src/16_REFRESH.gs:274-291,683-715`
- Create: `wcore-gsheet/tests/xstocks-solana-sheets.test.js`

- [ ] **Step 1: Écrire les gardes rouges**

Vérifier dans le test :

```js
assert.match(xstocksSource, /setName\("Ledger - Solana Crypto"\)/);
assert.match(xstocksSource, /CACHED_WALLET_ASSETS_SOLANA_CRYPTO/);
assert.match(xstocksSource, /CACHED_WALLET_ASSETS_SOLANA_ACTION_META/);
assert.doesNotMatch(extractFunction('SETUP_XSTOCKS_SOLANA_SHEETS'), /WALLET_REGISTRY/);
assert.doesNotMatch(extractFunction('CACHED_WALLET_ASSETS_SOLANA_ACTION'), /getRefreshStatus|_webScanWallet_/);
assert.match(refreshSource, /Ledger - Solana Action/);
assert.match(refreshSource, /Ledger - Solana Crypto/);
```

- [ ] **Step 2: Exécuter le test rouge**

Run: `node --test wcore-gsheet/tests/xstocks-solana-sheets.test.js`

Expected: FAIL.

- [ ] **Step 3: Implémenter `SETUP_XSTOCKS_SOLANA_SHEETS`**

La fonction doit :

1. prendre un document lock ;
2. renommer uniquement la feuille live `Ledger - Solana` en `Ledger - Solana Crypto` avec `sheet.setName`, ce qui laisse Google réécrire automatiquement les formules dépendantes ;
3. dupliquer cette feuille en `Ledger - Solana Action` si elle n’existe pas ;
4. remplacer `A2` du Crypto par `=CACHED_WALLET_ASSETS_SOLANA_CRYPTO(address;J1)` ;
5. conserver `I1 = SOLANA_REFRESH_STATUS(...)` uniquement sur Crypto ;
6. poser sur Action `I1='Ledger - Solana Crypto'!I1` et `J1='Ledger - Solana Crypto'!J1` ;
7. poser `A2 = CACHED_WALLET_ASSETS_SOLANA_ACTION(address;'Ledger - Solana Crypto'!J1)` ;
8. poser `K2 = CACHED_WALLET_ASSETS_SOLANA_ACTION_META(address;'Ledger - Solana Crypto'!J1)` ;
9. remplir `H3:H1000` avec la même formule stricte que le Ledger classique, mais ciblant `Portefeuille Action Details` ;
10. définir les formats E:G et K:L numériques sans toucher I1/J1.

Dans `WCORE_ON_EDIT`, intercepter `Ledger - Solana Action!A1=TRUE` avant le handler Ledger générique : écrire le timestamp dans `Ledger - Solana Crypto!B1`, réinitialiser Action A1, puis sortir. Étendre `FORCE_RESCAN_LEDGERS` pour que la clé `Solana` cible `Ledger - Solana Crypto`.

- [ ] **Step 4: Exécuter les gardes**

Run: `node --test wcore-gsheet/tests/xstocks-solana-sheets.test.js wcore-gsheet/tests/watchdog-quota-guard.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add wcore-gsheet/src/44_XSTOCKS_SOLANA.gs wcore-gsheet/src/16_REFRESH.gs wcore-gsheet/tests/xstocks-solana-sheets.test.js
git commit -m "feat(gsheet): add Solana action ledger migration"
```

---

### Task 5: Construire `Portefeuille Action Details`

**Files:**
- Modify: `wcore-gsheet/src/44_XSTOCKS_SOLANA.gs`
- Modify: `wcore-gsheet/src/17_LISTING.gs:193-249`
- Modify: `wcore-gsheet/src/16_REFRESH.gs:274-280`
- Create: `wcore-gsheet/tests/action-portfolio-details.test.js`
- Modify: `wcore-gsheet/tests/listing-links.test.js`

- [ ] **Step 1: Écrire les tests rouges du builder**

Tester `_xstocksBuildActionDetailsRows_` avec une ligne Bitpanda `AAPL` et une ligne Ledger Action `AAPL`. Le résultat doit contenir deux lignes distinctes, même symbole canonique, sources conservées :

```js
assert.deepEqual(rows.map((r) => r.slice(2, 7)), [
  ['AAPL', '', 'CEX - Bitpanda Stocks', 'AAPL', ''],
  ['AAPL', '', 'Ledger - Solana Action', 'AAPLx', 'AAPL_MINT'],
]);
assert.equal(rows[0][10], 0.3);
assert.equal(rows[1][10], 0.51);
```

Vérifier aussi les headers exacts :

```js
['Top','Exe','Symbol','Price (€)','Position :','Ticker','Contract Adress','Libre','Flex','Lock','Total','Valorisation']
```

- [ ] **Step 2: Exécuter les tests rouges**

Run: `node --test wcore-gsheet/tests/action-portfolio-details.test.js wcore-gsheet/tests/listing-links.test.js`

Expected: FAIL.

- [ ] **Step 3: Implémenter setup et refresh Details**

`SETUP_STOCK_PORTFOLIO_DETAILS` crée la feuille si nécessaire et écrit les headers. `REFRESH_STOCK_PORTFOLIO_DETAILS` lit :

- `CEX - Bitpanda Stocks!A3:B` ;
- `Ledger - Solana Action!B3:J`.

Pour chaque ligne, écrire A:L avec :

```js
[
  '=IFERROR(XLOOKUP(C' + row + ';\'Portefeuille Action\'!A:A;\'Portefeuille Action\'!B:B);"")',
  '',
  symbol,
  '=IFERROR(XLOOKUP(C' + row + ';\'Portefeuille Action\'!A:A;\'Portefeuille Action\'!C:C);"")',
  source,
  sourceTicker,
  mint,
  quantity,
  0,
  0,
  '=SUM(H' + row + ':J' + row + ')',
  '=IFERROR(K' + row + '*D' + row + ';0)',
]
```

La quantité Bitpanda vient de B ; la quantité xStock vient de E (quantité ajustée). EURC Action est exclu des lignes titres et reste uniquement la trésorerie visible dans `Ledger - Solana Action`.

Généraliser `_setDetailsChainHyperlinks_` pour traiter les deux noms de feuilles. Généraliser `_bpDetailsAutoLink_` pour accepter `Portefeuille Crypto Details` et `Portefeuille Action Details`.

- [ ] **Step 4: Exécuter les tests**

Run: `node --test wcore-gsheet/tests/action-portfolio-details.test.js wcore-gsheet/tests/listing-links.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add wcore-gsheet/src/44_XSTOCKS_SOLANA.gs wcore-gsheet/src/17_LISTING.gs wcore-gsheet/src/16_REFRESH.gs wcore-gsheet/tests/action-portfolio-details.test.js wcore-gsheet/tests/listing-links.test.js
git commit -m "feat(gsheet): add stock portfolio details pipeline"
```

---

### Task 6: Alimenter l’univers/prix Action et consolider depuis Details

**Files:**
- Modify: `wcore-web/apps/api/src/plugins/gsheet.ts:47,963-974`
- Modify: `wcore-web/apps/api/src/server.ts:424-460`
- Modify: `wcore-web/apps/api/src/stocks/stock-portfolio.ts:12-19,36-78`
- Modify: `wcore-web/apps/api/src/stocks/stock-portfolio.test.ts`
- Modify: `wcore-gsheet/src/42_STOCK_PORTFOLIO.gs:67-75,413-470,585-626`
- Modify: `wcore-gsheet/tests/stock-portfolio-sheet-layout.test.js`

- [ ] **Step 1: Écrire les tests rouges API**

Étendre le builder avec `requestedSymbols: ["AAPL", "SMALL"]`. Vérifier que `SMALL`, absent des 300 lignes classées et des holdings Bitpanda, est ajouté si `heldPrices.SMALL` existe, avec `heldQuantity: 0` et `rank: null`.

- [ ] **Step 2: Exécuter le test rouge API**

Run: `pnpm --dir wcore-web exec tsx --test apps/api/src/stocks/stock-portfolio.test.ts`

Expected: FAIL car `requestedSymbols` est inconnu.

- [ ] **Step 3: Implémenter `requestedSymbols`**

Ajouter `requestedSymbols?: string[]` au builder. Après les holdings, ajouter les symboles demandés absents via le mapping actions canonique et `rowFromUnrankedHolding` avec balance `0`, afin que la ligne et le prix existent sans prétendre que l’API détient la position.

La route `/api/gsheet/stocks/portfolio` accepte désormais uniquement `fresh` et `symbols`. Normaliser `symbols` en maximum 100 tickers `[A-Z0-9.:-]{1,20}`. `server.ts` appelle `getPricesForBitpandaSymbols` pour ces symboles et les passe au builder.

- [ ] **Step 4: Écrire le test rouge GSheet**

Dans `stock-portfolio-sheet-layout.test.js`, remplacer l’attente VLOOKUP par :

```js
assert.match(matrix[1][6], /SUMIFS\('Portefeuille Action Details'!K:K/);
assert.doesNotMatch(matrix[1][6], /CEX - Bitpanda Stocks/);
```

Vérifier aussi que `_stockPortfolioFetchSnapshot_` ajoute `symbols=` depuis `_stockPortfolioReadRequestedSymbols_()`.

- [ ] **Step 5: Implémenter le flux GSheet**

Ajouter `DETAILS_SHEET_NAME: "Portefeuille Action Details"`. Lire les symboles distincts C:C de Details dont la quantité K est positive, les encoder dans la requête API, puis remplacer la formule G hors cash par :

```js
"=IFERROR(SUMIFS('Portefeuille Action Details'!K:K;'Portefeuille Action Details'!C:C;A" + sheetRow + ")*C" + sheetRow + ";0)"
```

Avant d’écrire `Portefeuille Action`, appeler `REFRESH_STOCK_PORTFOLIO_DETAILS()` afin que les symboles demandés reflètent les Ledgers actuels. Après l’écriture A:E, appeler une seconde fois `REFRESH_STOCK_PORTFOLIO_DETAILS()` pour rafraîchir les XLOOKUP de rang/prix.

La ligne EUR conserve la formule Budget/Bitpanda existante, mais ne soustrait plus l’EURC Ledger Solana depuis Crypto Details puisque cet EURC est désormais absent du portefeuille Crypto.

- [ ] **Step 6: Exécuter les tests API et GSheet**

Run: `pnpm --dir wcore-web exec tsx --test apps/api/src/stocks/stock-portfolio.test.ts apps/api/src/plugins/gsheet.test.ts`

Run: `node --test wcore-gsheet/tests/stock-portfolio-sheet-layout.test.js wcore-gsheet/tests/action-portfolio-details.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add wcore-web/apps/api/src/plugins/gsheet.ts wcore-web/apps/api/src/server.ts wcore-web/apps/api/src/stocks/stock-portfolio.ts wcore-web/apps/api/src/stocks/stock-portfolio.test.ts wcore-gsheet/src/42_STOCK_PORTFOLIO.gs wcore-gsheet/tests/stock-portfolio-sheet-layout.test.js
git commit -m "feat(portfolio): consolidate stocks through action details"
```

---

### Task 7: Vérif, migration live et validation finale

**Files:**
- Modify: `wcore-gsheet/src/35_BITPANDA_SYNC.gs:1785-1793`
- Modify: `wcore-gsheet/tests/crypto-v2-dependency-migration.test.js`
- Modify: `wcore-gsheet/CHANGELOG.md`
- Modify: `wcore-web/CHANGELOG.md`

- [ ] **Step 1: Écrire le test rouge Vérif**

```js
const stockFormula = cexContext._cexBuildVerifFormula_('CEX - Bitpanda Stocks');
assert.match(stockFormula, /'Portefeuille Action Details'!\$E:\$E/);
assert.match(stockFormula, /'Portefeuille Action Details'!\$C:\$C/);
assert.doesNotMatch(stockFormula, /'Portefeuille Action'!\$A:\$A/);
```

- [ ] **Step 2: Exécuter le test rouge**

Run: `node --test wcore-gsheet/tests/crypto-v2-dependency-migration.test.js`

Expected: FAIL.

- [ ] **Step 3: Modifier `_cexBuildVerifFormula_`**

Pour Stocks, utiliser la même sémantique stricte que Crypto Details : source E = nom CEX et symbole C = ticker ou alias canonique. Pour Fiat, conserver la logique actuelle vers `Portefeuille Action` afin de ne pas changer un comportement hors périmètre.

- [ ] **Step 4: Exécuter toutes les vérifications locales**

Run: `npm --prefix wcore-gsheet run validate:static`

Expected: PASS.

Run: `npm --prefix wcore-gsheet test`

Expected: PASS, aucun test rouge.

Run: `pnpm --dir wcore-web typecheck`

Expected: PASS.

Run: `pnpm --dir wcore-web lint`

Expected: PASS.

Run: `pnpm --dir wcore-web test:api`

Expected: PASS.

- [ ] **Step 5: Déployer l’API avant le GSheet**

Run: `powershell -File wcore-web/scripts/deploy.ps1 -Service api`

Expected: déploiement Railway réussi. Ne pas lancer un second déploiement Railway en parallèle.

- [ ] **Step 6: Déployer Apps Script**

Run: `powershell -File wcore-gsheet/safe-push.ps1`

Expected: `clasp push` réussi avec restauration de `.clasp.json`.

- [ ] **Step 7: Exécuter la migration live**

Depuis Apps Script, exécuter successivement :

```text
SETUP_XSTOCKS_SOLANA_SHEETS
SETUP_STOCK_PORTFOLIO_DETAILS
REFRESH_STOCK_PORTFOLIO_DETAILS
UPDATE_STOCK_PORTFOLIO
WCORE_AUTO_HEAL_FORCE
```

Expected :

- `Ledger - Solana` n’existe plus ;
- `Ledger - Solana Crypto` et `Ledger - Solana Action` existent ;
- les anciennes formules ont été automatiquement réécrites vers `Ledger - Solana Crypto` ;
- `Ledger - Solana Action` ne contient que EURC et les mints xStocks officiels ;
- `Portefeuille Action Details` contient les sources Bitpanda et Solana Action ;
- aucun xStock/EURC Ledger n’est compté dans `Portefeuille Crypto Details`.

- [ ] **Step 8: Vérifier la ground truth GSheet**

Lire via Sheets API :

```text
'Ledger - Solana Crypto'!A1:J30
'Ledger - Solana Action'!A1:J30
'Portefeuille Crypto Details'!A:L
'Portefeuille Action Details'!A:L
'Portefeuille Action'!A:G
```

Assertions :

1. le mint EURC `HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr` est uniquement dans Action ;
2. USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` reste uniquement dans Crypto ;
3. un mint xStock officiel possède E = quantité ajustée, K = quantité brute, L = multiplier ;
4. H affiche `V` lorsque la ligne existe dans `Portefeuille Action Details` ;
5. la somme des valeurs Crypto + Action égale l’ancien total Solana à l’écart de prix actions près, sans doublon.

- [ ] **Step 9: Documenter et mémoriser la décision validée**

Mettre à jour les deux changelogs avec les versions déployées et les résultats de tests/live. Écrire une note de référence Obsidian dédiée, puis appeler `mem0_add` avec cette note comme source ; enfin journaliser le jalon.

- [ ] **Step 10: Commit final**

Stager explicitement les fichiers du plan, jamais de répertoires entiers, après contrôle de `git status` :

```bash
git add wcore-gsheet/src/44_XSTOCKS_SOLANA.gs wcore-gsheet/src/04B_CACHE_WALLET.gs wcore-gsheet/src/16_REFRESH.gs wcore-gsheet/src/17_LISTING.gs wcore-gsheet/src/35_BITPANDA_SYNC.gs wcore-gsheet/src/41_GSHEET_WEB_SCAN.gs wcore-gsheet/src/42_STOCK_PORTFOLIO.gs wcore-gsheet/src/SOLANA.gs wcore-gsheet/tests/xstocks-solana-classification.test.js wcore-gsheet/tests/xstocks-solana-sheets.test.js wcore-gsheet/tests/action-portfolio-details.test.js wcore-gsheet/tests/web-scan-adapter.test.js wcore-gsheet/tests/packed-wallet-cache.test.js wcore-gsheet/tests/stock-portfolio-sheet-layout.test.js wcore-gsheet/tests/crypto-v2-dependency-migration.test.js wcore-gsheet/tests/listing-links.test.js wcore-gsheet/CHANGELOG.md wcore-web/apps/api/src/plugins/gsheet.ts wcore-web/apps/api/src/plugins/gsheet.test.ts wcore-web/apps/api/src/server.ts wcore-web/apps/api/src/stocks/stock-portfolio.ts wcore-web/apps/api/src/stocks/stock-portfolio.test.ts wcore-web/apps/api/src/xstocks/xstocks-registry.ts wcore-web/apps/api/src/xstocks/xstocks-registry.test.ts wcore-web/CHANGELOG.md docs/superpowers/specs/2026-08-24-xstocks-solana-gsheet-design.md docs/superpowers/plans/2026-08-24-xstocks-solana-gsheet.md
git commit -m "feat: integrate Solana xStocks into WCORE portfolios"
```

---

## Ordre de rollback

En cas d’échec live après migration :

1. désactiver uniquement les formules `Ledger - Solana Action` ;
2. conserver le cache et `Ledger - Solana Crypto` ;
3. remettre temporairement `Portefeuille Action!G` sur la formule Bitpanda précédente ;
4. renommer `Ledger - Solana Crypto` en `Ledger - Solana` via l’API Sheets, ce qui réécrit automatiquement les formules dépendantes ;
5. ne jamais supprimer le nouveau `Portefeuille Action Details` avant d’avoir vérifié qu’aucune formule ne le référence.
