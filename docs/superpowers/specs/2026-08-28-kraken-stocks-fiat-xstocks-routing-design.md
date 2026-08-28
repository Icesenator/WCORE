---
title: Routage fiat + xStocks Kraken vers CEX - Kraken Stocks, conversion SKHYx et renames SKHY/SMSN/BRKB
date: 2026-08-28
project: WCORE
status: implemented
---

# Routage fiat + xStocks Kraken vers `CEX - Kraken Stocks`, conversion SKHYx et renames SKHY/SMSN/BRKB

## Objectif

L'utilisateur va financer un compte Kraken en euros puis acheter des xStocks (dont SK Hynix). Il faut que :

1. Le **fiat EUR** déposé chez Kraken apparaisse dans `CEX - Kraken Stocks` (et **plus** dans `CEX - Kraken Crypto`).
2. **Tous les xStocks Kraken** (NVDAx, AAPLx, SKHYx, …) apparaissent dans `CEX - Kraken Stocks`, normalisés vers le symbole canonique WCORE (ex. `SKHYx` → `SKHY`).
3. Les **cryptos** Kraken restent dans `CEX - Kraken Crypto` (comportement actuel).
4. Le fiat EUR Kraken alimente la **ligne Euro cash** de `Portefeuille Action Details`.
5. Les symboles canoniques sont renommés pour un `Portefeuille Action` plus propre : `KRX:000660` → `SKHY`, `KRX:005930` → `SMSN`, `NYSE:BRK.B` → `BRKB`.

Aucun USD ne sera présent sur le compte : le fiat géré est l'**EUR uniquement**.

Ce spec étend `docs/superpowers/specs/2026-08-27-kraken-stocks-onglet-design.md` (création de l'onglet + stub fail-safe) : il remplace le stub `UPDATE_KRAKEN_STOCKS_FIAT()` par un vrai sync, ajoute la conversion de sous-jacent pour SK Hynix, et renomme les canoniques.

## Contexte vérifié

- `41_KRAKEN_SYNC.gs` : `UPDATE_KRAKEN_SPOT()` écrit **tout** le solde `/0/private/Balance` dans `CEX - Kraken Crypto` (y compris fiat et xStocks). `KRAKEN_SYMBOL_ALIASES` mappe `ZEUR`/`EUR` → `EURC` et `ZUSD`/`USD` → `USDT`. `UPDATE_KRAKEN_STOCKS_FIAT()` est un stub read-only.
- `35_BITPANDA_SYNC.gs` sert de référence : `UPDATE_BITPANDA_STOCKS_FIAT()` écrit fiat + stocks dans `CEX - Bitpanda Fiat` / `CEX - Bitpanda Stocks` ; `_cexComputeAndAppendTotal_` valorise `EUR` à 1.0 (ligne 1625-1628) et indexe les prix stocks depuis `Portefeuille Action`.
- `42_STOCK_PORTFOLIO.gs` :
  - `_stockPortfolioSpotQtyFormula_(sheetRow)` (l.587) fait déjà un VLOOKUP vers `'CEX - Bitpanda Stocks'!A:B` puis fallback `'CEX - Kraken Stocks'!A:B` (avec alias canoniques).
  - `_stockPortfolioEurSpotFormula_(sheetRow)` (l.631) lit `BCPEUR`/`EUR` dans les 4 onglets Bitpanda, moins EURC en Crypto Details, moins Budget. Ne lit pas Kraken.
- `wcore-web/apps/api/src/stocks/mappings.ts` :
  - `BITPANDA_SECURITIES` a déjà `HYXS: stock("KRX:000660", ["000660.KS"], ["HYXS"], "KRW")`, `SSU`/`SMSN: stock("KRX:005930", ...)`, `BRK`/`BRKB`/`BRK.B`/`BRK-B: stock("NYSE:BRK.B", ...)`.
  - `krakenStockCanonicalSymbol()` (l.201) résout un xStock Kraken via les `yahooTickers`/`bitpandaAliases` des mappings (pattern `${cu}X`), sinon retire le `x` final.
  - Test existant : `kraken-stocks-alias.test.ts` (`GOOGLx` → `GOOG`, `JPMx` → `JPM`).

## Architecture retenue

### 1. API — conversion `SKHYx` → `SKHY` et renames canoniques (`mappings.ts`)

- **SK Hynix** : `HYXS: stock("KRX:000660", ...)` → `HYXS: stock("SKHY", ["000660.KS"], ["HYXS", "SKHY", "SKHYx"], "KRW")` ; override `TOP_MARKET_CAP_OVERRIDES["000660.KS"]`.
- **Samsung** : `SSU`/`SMSN: stock("KRX:005930", ...)` → `stock("SMSN", ["005930.KS"], ["SSU", "SMSN"], "KRW", { unitsPerReceipt: 25 })` ; override `TOP_MARKET_CAP_OVERRIDES["005930.KS"]`.
- **Berkshire** : `BRK`/`BRKB`/`BRK.B`/`BRK-B: stock("NYSE:BRK.B", ...)` → `stock("BRKB", ["BRK-B", "NYSE:BRK.B"], ["BRKB", "BRK.B", "BRK-B", "BRK", "NYSE:BRK.B"], "USD")`.
- **Berkshire A** : ajout `"BRK-A": stock("BRKA", ["BRK-A"], [], "USD")` dans `TOP_MARKET_CAP_OVERRIDES`.
- Tests : `top-market-cap.test.ts` + `kraken-stocks-alias.test.ts` mis à jour.

### 2. GSheet — routage des buckets (`41_KRAKEN_SYNC.gs`)

- Étendre `KRAKEN_SYNC_CONFIG` :
  - `FIAT_SYMBOLS = ["EUR"]` (devise fiat gérée ; extensible, pas d'USD attendu).
  - `XSTOCK_CANONICAL = { "SKHY": "SKHY", "SKHYX": "SKHY" }` (conversions spéciales sous-jacent différent).
- Modifier `KRAKEN_SYMBOL_ALIASES` : `ZEUR`→`EUR`, `EUR`→`EUR` (au lieu de `EURC`) ; `ZUSD`/`USD`→`USD` (au lieu de `USDT`) pour que le fiat soit reconnu comme tel et quitte l'onglet Crypto.
- `_krakenFetchBuckets_` : après normalisation, classifier chaque ligne :
  - fiat (`EUR`, ou `USD` si un jour présent) → bucket `fiat` ;
  - xStock (symbole se terminant par `X`, ou présent dans `XSTOCK_CANONICAL`) → bucket `xstocks` ;
  - sinon → bucket `crypto` (inchangé).
- Nouvelle fonction `_krakenCanonicalStockSymbol_(symbol)` : normalise un xStock Kraken vers le symbole canonique WCORE :
  - applique `XSTOCK_CANONICAL` (sur la forme avec ou sans `x`) ;
  - sinon retire le suffixe `x` final (ex. `NVDAx` → `NVDA`) ;
  - par défaut, laisse le symbole tel quel.
- `UPDATE_KRAKEN_STOCKS_FIAT()` : remplace le stub — fetch des buckets, prend `fiat` + `xstocks` (normalisés via `_krakenCanonicalStockSymbol_`), écrit dans `CEX - Kraken Stocks` (structure `A1` checkbox / `B1` horodatage / ligne 2 en-têtes / lignes données / `_cexComputeAndAppendTotal_`), garde le trigger horaire.
- `UPDATE_KRAKEN_SPOT()` : n'écrit **plus que le bucket crypto** dans `CEX - Kraken Crypto` (le fiat et les xStocks en sont exclus).

### 3. GSheet — ligne Euro cash (`42_STOCK_PORTFOLIO.gs`)

- `_stockPortfolioEurSpotFormula_` : ajouter `VLOOKUP("EUR"; 'CEX - Kraken Stocks'!A:B)` multiplié par le prix de la ligne (EUR = 1) en plus des 4 onglets Bitpanda. Aucun USD à gérer.

### 4. GSheet — alias et formules (`35_BITPANDA_SYNC.gs`, `34_TOP_MARKETCAP.gs`, `44_XSTOCKS_SOLANA.gs`)

- `BP_AR_ALIASES` : `BRKB`→`BRKB`, `SSU`/`SMSN`→`SMSN` (au lieu de `NYSE:BRK.B` / `KRX:005930`).
- `CEX_STOCK_ALIASES` : `["BRKB","BRKB"]`, `["SSU","SMSN"]`, `["SMSN","SMSN"]`.
- `_topMcBitpandaAlias1Formula_` : `SMSN`/`SSU` au lieu de `KRX:005930`.
- `_topMcBitpandaAlias2Formula_` : `SMSN`→`SSU` au lieu de `KRX:005930`→`SMSN`.
- `_topMcBitpandaQtyFormula_` : `IF(A{row}="SMSN";25;1)` au lieu de `KRX:005930`.
- `_xstocksBitpandaCanonicalAliases_` : `BRK`/`BRKB`/`BRK.B`/`BRK-B`→`BRKB`, `SSU`/`SMSN`→`SMSN`.

### 5. Auto-heal et structure

- `16B_AUTO_HEAL.gs` surveille déjà `CEX - Kraken Crypto` et `UPDATE_KRAKEN_STOCKS_FIAT` (listes managed/required). Aucun changement attendu hors vérification.
- `_cexBuildVerifFormula_` fonctionne pour tout onglet CEX (pointe vers `Portefeuille Action Details` E:C) : la ligne `SKHY`/`SMSN`/`BRKB` de `CEX - Kraken Stocks` matchera la ligne correspondante de Details.

### 6. Tests

- **API (TS)** `kraken-stocks-alias.test.ts` : `SKHYx`/`SKHY`→`SKHY`, `SSU`/`SMSN`→`SMSN`, `NYSE:BRK.B`/`BRK-B`/`BRKB`→`BRKB`, inconnu → inchangé.
- **API (TS)** `top-market-cap.test.ts` : `mapTopMarketCapTicker("000660.KS")`→`SKHY`, `getBitpandaAliases("SKHY")`→`["HYXS","SKHY","SKHYx"]`, `getBitpandaAliases("SMSN")`→`["SSU","SMSN"]`, `getBitpandaAliases("BRKB")`→`["BRKB","BRK.B","BRK-B","BRK","NYSE:BRK.B"]`, `getBitpandaSecurity("SMSN").canonicalTicker`→`SMSN`, `mapTopMarketCapTicker("BRK-B").canonicalTicker`→`BRKB`.
- **API (TS)** `stock-service.test.ts` : clés cache `stock:price:SKHY:*` (au lieu de `KRX:000660`).
- **API (TS)** `market-cap/presentation.test.ts` : `canonicalTicker`/`symbol` `BRKB`.
- **API (TS)** `cache-keys.test.ts` : `stock:price:SMSN:*`.
- **GSheet (JS)** `kraken-stocks.test.js` : adapter le test du stub (devenu fonctionnel) ; tester la classification fiat/xStocks/crypto, `_krakenCanonicalStockSymbol_`, la présence de `CEX - Kraken Stocks` dans `_stockPortfolioEurSpotFormula_`.
- **GSheet (JS)** `stock-portfolio-sheet-layout.test.js`, `cex-info-total.test.js`, `cex-bulk-canonical.test.js`, `top-marketcap-currency-fallback.test.js` : régression.
- **validate:static** : OK (3118 fonctions).

## Erreurs et cas limites

- **Format exact du symbole Kraken pour les xStocks inconnu** : la classification par suffixe `X` couvre les formes `xxx`/`xxxX` ; `XSTOCK_CANONICAL` couvre explicitement SK Hynix (avec et sans `x`). Les symboles non reconnus restent en crypto ou tel quel (jamais de fail).
- **`EUR` dans `CEX - Kraken Crypto`** : plus aucune ligne fiat n'y est écrite ; le TOTAL de l'onglet Crypto baissera du montant fiat (comportement voulu). Les éventuelles lignes EURC/EUR historiques sont purgées par le prochain `_cexComputeAndAppendTotal_` (clear A1:G).
- **Prix des lignes `SKHY`/`SMSN`/`BRKB`** : reste celui de Bitpanda (`000660.KS`/`005930.KS` KRW, `BRK-B` USD). La position xStock Kraken sera valorisée à ce prix (approximation acceptée : même société, forte corrélation, instruments distincts).
- **Vérif / recoupement** : `CEX - Kraken Stocks` aura des lignes `SKHY`/`SMSN`/`BRKB` consolidées ; si le compte Kraken contient un xStock et Bitpanda la cotation, les deux alimentent la même ligne Details (somme des quantités) — c'est l'agrégation souhaitée.
- **Berkshire `NYSE:BRK.B`** : ajouté explicitement dans `yahooTickers` et `bitpandaAliases` pour que `krakenStockCanonicalSymbol("NYSE:BRK.B")` résolve vers `BRKB` (sinon le `.` empêchait la correspondance).

## Hors périmètre

- Migration live de l'onglet spreadsheet (faite au 27/08).
- Gestion du fiat USD (absent du compte).
- Autres conversions de sous-jacents xStocks (GOOGLx → GOOG déjà couvert ; seules les conversions non triviales à venir seront ajoutées à `XSTOCK_CANONICAL`/`BITPANDA_SECURITIES`).
