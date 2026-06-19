# FX Cascade - EUR/USD multi-source consensus

> Document focalise sur la cascade FX (EUR per 1 USD) mise en place le 2026-06-17.
> Source unique de la convention `priceEur = priceUsd * fxRate` (cf. `packages/core/src/pricing/cascade.ts`).

## Objectif

Remplacer le `0.92` hardcoded (et la version web `1.08` dans 4 engines) par une cascade
temps-reel multi-sources avec consensus median, **sans aucun fallback fixe**.

## Sources (4, ordre canonique identique web/gsheet)

| # | Source | URL | Unite native | Conversion |
|---|--------|-----|--------------|------------|
| 1 | Frankfurter | `https://api.frankfurter.app/latest?from=EUR&to=USD` | 1 EUR = X USD | `1 / X` -> EUR/USD |
| 2 | open.er-api.com | `https://open.er-api.com/v6/latest/USD` | 1 USD = X EUR | direct |
| 3 | Coinbase | `https://api.coinbase.com/v2/exchange-rates?currency=USD` | 1 USD = X EUR | direct (rate en string) |
| 4 | DefiLlama EURC | `https://coins.llama.fi/prices/current/coingecko:euro-coin` | 1 EURC = X USD | `1 / X` -> EUR/USD |

Toutes les sources sont free, sans cle, sans auth.

## Consensus (`consensusRate`)

- **>= 3 sources reussies** : **mediane** (rejette outliers)
- **2 sources reussies** : moyenne si delta < 5%, sinon throw `2 sources disagree by X%`
- **1 source reussie** : retour direct
- **0 source reussie** : **throw** `FX cascade: only 0 source(s) succeeded, need 1`
  - **Aucun fallback fixe** (la valeur 0.92 historique etait une corruption silencieuse)

## Cache

Cle registre : `cacheKey("fxEurUsd", {})` = `fx:eur:usd` (web) / `FX_EUR_USD` (gsheet).
TTL : 1h en memoire + Redis optionnel (web). Invalidable via version stamp.

## Cross-runtime telemetry

### Web (`/api/price/fx`)

Chaque appel a `/api/price/fx` self-publie sa valeur dans `fx_telemetry:web` (TTL 2h).

### Gsheet (`FxRate._postTelemetry_`)

Apres chaque fetch cascade reussi, gsheet POST `{rate, ts, sources, runtime:"gsheet"}` a
`/api/gsheet/fx-telemetry` (auth via `x-gsheet-token`).

### Endpoint de diagnostic (`/api/diag/fx-parity`)

GET public, retourne :
```json
{
  "ok": true,            // drift <= 2%
  "web": { rate, ts, ageMs, sources },
  "gsheet": { rate, ts, ageMs, sources } | null,
  "drift": 0.0039,        // 0.39% (|web-gsheet| / max)
  "tolerance": 0.02,
  "alert": 0.05
}
```

Codes de sortie `requiresCsrfOriginCheck` exclut `/api/gsheet/*` (auth par token, pas cookie).

## Tests

### Unit (26 tests, `packages/core/src/fx.test.ts`)
- 4 sources : parse correct (avec inversion pour Frankfurter/DefiLlama)
- Cascade : 1/2/3/4 sources, throw si 0
- Consensus : median, moyenne si delta < 5%, throw si delta >= 5%
- Cache hit, forceRefresh, timeout
- `isValidRate` rejette <=0, >=100, NaN

### Cross-runtime spec (9 tests, `wcore-gsheet/scripts/fx-cascade-spec.test.cjs`)
- Source lists identiques (memes 4 noms, memes URLs)
- Cascade identique pour memes mocks : 4/2/1/0 sources, outlier, fail-fast, inversion

### Cross-runtime live (`wcore-web/scripts/test-fx-parity.cjs`)
- Hit `/api/price/fx` puis `/api/diag/fx-parity`
- Exit 0 si drift <= 2%, 1 si 2-5%, 2 si > 5% ou 404
- Utilise env `WEB_API_URL`, `FX_TOLERANCE`, `FX_ALERT`

### Fallback test (`wcore-gsheet/scripts/gsheet-fx-telemetry.cjs`)
- Lit le FX affiche dans `Ledger - Ethereum` (INFO_FX row) via service account gsheets
- POST a `/api/gsheet/fx-telemetry` pour populer la telemetrie sans attendre un scan
- Utile en dev/local quand on ne peut pas trigger un scan gsheet

## Version stamp (gsheet)

`FxRate._CURRENT_VERSION = "4.15.50"` est stamp dans :
- Memory cache (`FxRate._cachedVersion`)
- L1 CacheService (`CacheManager.l1Set` value = `"<rate>|<version>"`)
- Force un fresh fetch apres deploy (evite d'attendre 1h de TTL)

Bumper `_CURRENT_VERSION` a chaque deploy gsheet qui change la cascade.

## Problemes connus / dette

- **Scan resultats caches avec ancien FX** : quand on deploy un nouveau code FX, les
  scan results (Redis `scan:v2:*`) sont encore caches avec l'ancien FX. Symptome :
  ETH sur Ethereum scan a 1623.96 EUR (FX 0.918) alors que WBTC a 143 EUR (FX 0.855).
  Fix : `WALLET_SCAN_CACHE_VERSION` bump ou forceRefresh sur les chains concernees.
  Ou attendre que les caches resultats expirent (5min scan TTL).

- **CSRF : gsheet routes exclues** : `requiresCsrfOriginCheck` exclut `/api/gsheet/*`
  depuis le fix du 2026-06-17. Si on ajoute de nouvelles routes gsheet, le prefix
  reste exclu automatiquement (wildcard `/api/gsheet/`).

- **Telemetry drift > 5%** : si `test-fx-parity.cjs` exit 2, c'est un vrai bug. Causes
  possibles : une source specifique qui retourne une valeur aberrante (outlier
  pas rejete par median), un bug dans `1 / usdPerEur` pour Frankfurter/DefiLlama,
  ou un cache stale.

## Fichiers

**Web** :
- `packages/core/src/fx.ts` (refactored)
- `packages/core/src/fx.test.ts` (26 tests)
- `apps/api/src/plugins/gsheet.ts` (endpoint telemetry + parity)
- `apps/api/src/plugins/chains.ts` (self-telemetry sur /api/price/fx)
- `apps/api/src/server-helpers.ts` (CSRF exclut /api/gsheet/*)
- `scripts/test-fx-parity.cjs`

**Gsheet** :
- `src/04C_CACHE_GLOBAL.gs` v4.15.50 (cascade + version stamp + _postTelemetry_)
- `src/10_OUTPUT.gs`, `src/15_COSMOS_ENGINE.gs`, `src/FOGO.gs`, `src/26_OPTIMIZATIONS.gs`
  (callers durcis avec try/catch + suppression fallback 0.86/0.92)
- `scripts/fx-cascade-spec.cjs` + `.test.cjs` (parity spec)
- `scripts/gsheet-fx-telemetry.cjs` (fallback test)
