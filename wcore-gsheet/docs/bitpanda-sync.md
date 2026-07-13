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
- unknown

Important : l'API Bitpanda `/asset-wallets` peut exposer les stocks/actions dans des sous-buckets variables selon le compte. Le bucket `action` est fusionne dans `CEX - Bitpanda Stocks`; l'ancien onglet `Bitpanda Spot Action` n'est plus utilise.

## Mise a jour

Fonction principale :

```javascript
UPDATE_BITPANDA_SPOT()
```

Elle ecrit les onglets existants :

- `CEX - Bitpanda Crypto`
- `CEX - Bitpanda Commodity`
- `CEX - Bitpanda Fiat`
- `CEX - Bitpanda Stocks`

L'utilisateur a un seul compte Bitpanda. Il n'y a pas de `BITPANDA_ACTION_API_KEY` et plus d'onglet `Bitpanda Spot Action`; les lignes `action` exposees par l'API sont fusionnees dans `CEX - Bitpanda Stocks`.

Fonctions de refresh ciblees :

```javascript
UPDATE_BITPANDA_STOCKS_FIAT()
UPDATE_BITPANDA_CRYPTO_FIAT()
```

- `UPDATE_BITPANDA_STOCKS_FIAT()` ecrit seulement `CEX - Bitpanda Stocks` et `CEX - Bitpanda Fiat`.
- `UPDATE_BITPANDA_CRYPTO_FIAT()` ecrit seulement `CEX - Bitpanda Crypto` et `CEX - Bitpanda Fiat`.
- Ces fonctions fetchent l'API Bitpanda une fois, mais evitent de reecrire les onglets non concernes.

## Checkboxes manuelles

Les `onEdit` simples ne peuvent pas faire de `UrlFetchApp` (et sont no-op depuis
v4.15.112). L'installable `MASTER_ON_EDIT` decoche, ecrit `QUEUED: ...` et
pousse un job dans la queue one-shot; `CEX_MANUAL_REFRESH_WORKER` execute ~1s
plus tard (voir `docs/cex-sync.md`).

- `Portefeuille Action!T2` -> jobs `BITPANDA_STOCKS_FIAT` (`CEX - Bitpanda Stocks` + `CEX - Bitpanda Fiat`). Statut en `U2`.
- `Portefeuille Crypto V2!U2` -> jobs `BITPANDA_CRYPTO` (crypto SEUL depuis v4.15.115 — pas de refresh `CEX - Bitpanda Fiat`), `BINANCE`, `BITFINEX`, `BYBIT`, `COINBASE`, `OKX`, `KRAKEN`. Statut en `V2`.
- `A1` de `CEX - Bitpanda Crypto` -> `UPDATE_BITPANDA_CRYPTO_FIAT()` (crypto + fiat); `A1` de `CEX - Bitpanda Stocks`/`Fiat` -> `UPDATE_BITPANDA_STOCKS_FIAT()`.

`CEX - Bitpanda Commodity` n'est touche que par le refresh global `UPDATE_BITPANDA_SPOT()`.

## Triggers

Le flux courant est centralise :

- `CEX_HOURLY_REFRESH()` : trigger `everyHours(4)` (v4.15.114) qui met a jour les 6 CEX.
- Refresh manuels : queue one-shot `CEX_MANUAL_REFRESH_WORKER` (`BITPANDA_REFRESH_WATCHDOG()` est `LEGACY_DISABLED`).
- `WCORE_AUTO_HEAL` installe ces triggers et supprime les anciens triggers horaires individuels + watchdogs 1 min.

Ne pas reinstaller de triggers horaires individuels pour `UPDATE_*_SPOT()`.

## Statut

Lire le dernier statut :

```javascript
BITPANDA_SYNC_STATUS()
```
