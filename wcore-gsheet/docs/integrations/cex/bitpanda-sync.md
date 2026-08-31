---
type: reference
project: gsheet
status: active
---
# Bitpanda Sync Replacement for SyncWith

## Objectif

Remplacer progressivement les imports SyncWith des onglets Bitpanda par Apps Script + API Bitpanda officielle.

Script : `src/35_BITPANDA_SYNC.gs`.

## API Key

Stocker la cle API dans `ScriptProperties`, jamais dans une cellule :

```javascript
SET_BITPANDA_API_KEY("...")
```

Pour supprimer la cle :

```javascript
CLEAR_BITPANDA_API_KEYS()
```

## Diagnostic

Avant de remplacer SyncWith, lancer :

```javascript
DIAG_BITPANDA_API()
```

Le diagnostic retourne les counts et samples pour :

- crypto
- commodity
- fiat
- stocks
- equities
- action
- unknown

Important : l'API Bitpanda `/asset-wallets` peut exposer les stocks/actions dans des sous-buckets variables selon le compte. Le bucket `action` est fusionne dans `CEX - Bitpanda Stocks`; l'ancien onglet `Bitpanda Spot Action` n'est plus utilise.

## Onglets (v4.16.x — consolidation)

Depuis la consolidation Fiat/Stocks, Bitpanda n'alimente plus que **deux** feuilles CEX :

- `CEX - Bitpanda Crypto` — crypto + stablecoins euro normalises : `EURC`/`EURCV` → `EURC` (ligne unique).
- `CEX - Bitpanda Stocks` — actions + **tous les fiats** (EUR, USD, CHF, GBP, TRY, PLN, HUF, CZK, NOK, SEK, DKK, RON, BGN).

Les feuilles `CEX - Bitpanda Fiat` et `CEX - Bitpanda Commodity` ont ete **supprimees** et ne doivent pas etre recreees. Les commodities sont exclues du flux.

### Produits actions : legacy vs equity_security (`-LEG`)

`/asset-wallets` expose deux produits actions : l'ancien `security.stock` (ticker nu, ex `GOOGL`) et le nouveau `equity_security`. Quand les deux coexistent pour un meme titre, on garde **deux lignes** dans `CEX - Bitpanda Stocks` :

- legacy → ticker nu (`GOOGL`)
- `equity_security` → suffixe `-LEG` (`GOOGL-LEG`)

Un titre present uniquement en `equity_security` garde le ticker nu (ex `BRKB`). Le pricing et la formule `Vérif` resolvent sur le ticker de base (suffixe retire).

## Mise a jour

Fonction principale :

```javascript
UPDATE_BITPANDA_SPOT()
```

Elle ecrit uniquement `CEX - Bitpanda Crypto` (les stocks/fiats sont geres par `UPDATE_BITPANDA_STOCKS_FIAT`).

Fonctions de refresh ciblees :

```javascript
UPDATE_BITPANDA_STOCKS_FIAT()
UPDATE_BITPANDA_CRYPTO()
```

- `UPDATE_BITPANDA_STOCKS_FIAT()` ecrit seulement `CEX - Bitpanda Stocks` (stocks + equities `-LEG` + fiats).
- `UPDATE_BITPANDA_CRYPTO()` ecrit seulement `CEX - Bitpanda Crypto` (crypto + EURC/EURCV → EURC).
- Ces fonctions fetchent l'API Bitpanda une fois, mais evitent de reecrire les onglets non concernes.

## Checkboxes manuelles

Les `onEdit` simples ne peuvent pas faire de `UrlFetchApp` (et sont no-op depuis
v4.15.112). L'installable `MASTER_ON_EDIT` decoche, ecrit `QUEUED: ...` et
pousse un job dans la queue one-shot; `CEX_MANUAL_REFRESH_WORKER` execute ~1s
plus tard (voir [l'architecture CEX](cex-sync.md)).

- `Portefeuille Action!T2` -> jobs `BITPANDA_STOCKS_FIAT` (`CEX - Bitpanda Stocks`) **+** `KRAKEN_STOCKS` (`CEX - Kraken Stocks`). Statut en `U2`.
- `Portefeuille Crypto!U2` -> bloc crypto CEX : `BITPANDA_CRYPTO` (crypto seul), `BINANCE`, `BITFINEX`, `BYBIT`, `COINBASE`, `OKX`, `KRAKEN`. Statut en `V2`.
- `A1` de `CEX - Bitpanda Crypto` -> `UPDATE_BITPANDA_CRYPTO()` (crypto seul); `A1` de `CEX - Bitpanda Stocks` -> `UPDATE_BITPANDA_STOCKS_FIAT()`.

Aucun onglet Fiat/Commodity n'est plus ecrit par les refresh manuels ni globaux.

## Triggers

- `UPDATE_BITPANDA_SPOT` et `UPDATE_BITPANDA_STOCKS_FIAT` ont chacun un trigger horaire dedie.
- Les refresh manuels passent par `CEX_MANUAL_REFRESH_WORKER`; `BITPANDA_REFRESH_WATCHDOG()` reste `LEGACY_DISABLED`.
- La rotation 15 minutes concerne uniquement Binance, Bybit, Coinbase et OKX.

Ne pas reinstaller `CEX_HOURLY_REFRESH` ni les watchdogs legacy.

## Statut

Lire le dernier statut :

```javascript
BITPANDA_SYNC_STATUS()
```
