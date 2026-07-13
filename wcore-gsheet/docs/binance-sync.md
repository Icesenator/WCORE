# Binance Sync

## Objectif

Synchroniser les positions Binance dans l'onglet `CEX - Binance` sans SyncWith.

Script : `src/36_BINANCE_SYNC.gs`.

## Architecture

Binance bloque les IP Google Apps Script. Le script passe donc par le relais Railway multi-CEX `cex-relay` :

- Apps Script appelle le relais avec `BINANCE_RELAY_URL` + `BINANCE_RELAY_TOKEN` stockes dans `UserProperties`.
- Le relais signe les requetes Binance avec les secrets Railway.
- Apps Script ne stocke pas le secret Binance.
- Domaine actif : `https://cex-relay-production.up.railway.app`.

## Setup

```javascript
SET_BINANCE_RELAY(url, token)
```

Valeur actuelle attendue pour `url` : `https://cex-relay-production.up.railway.app`.

Les anciens helpers `SET_BINANCE_API_KEYS()` / `CLEAR_BINANCE_API_KEYS()` restent dans le code, mais le flux actif utilise le relais Railway.

## Mise a jour

```javascript
UPDATE_BINANCE_SPOT()
```

La fonction ecrit `CEX - Binance` avec trois sources :

- `spot`
- `earn-flexible`
- `earn-locked`

Le relais normalise les stablecoins :

- `USDC` + `TUSD` -> `USDT`
- `EUR` + `EURI` -> `EURC`

## Checkboxes manuelles

- `CEX - Binance!A1` (v4.15.107+) ecrit `QUEUED: <ts> BINANCE` en `B1` et pousse
  un job dans la queue one-shot (`CEX_MANUAL_JOB_QUEUE`); le worker
  `CEX_MANUAL_REFRESH_WORKER` l'execute ~1s plus tard.
- Au succes, `B1` devient le timestamp final et les rows sont reecrites avec le meme timestamp.
- Transitoire (timeout Spreadsheets / quota / `BUSY`) : `B1 = RETRY n/2: ...`, requeue auto, retry a +60s.
- `Portefeuille Crypto V2!U2` batch-enqueue le bloc CEX crypto : `BITPANDA_CRYPTO` (crypto seul depuis v4.15.115, pas `CEX - Bitpanda Fiat`), `BINANCE`, `BITFINEX`, `BYBIT`, `COINBASE`, `OKX`, `KRAKEN`. Statut visible en `V2`.

Ne pas remettre de checkbox legacy `AC2` ni dans `Action Rebalancing` ni dans `Portefeuille Crypto Details V2`.

## Triggers

Le flux courant est centralise :

- `CEX_HOURLY_REFRESH()` met a jour Binance avec les autres CEX toutes les 4h (`everyHours(4)`, v4.15.114).
- Les refresh manuels passent par la queue one-shot (voir `docs/cex-sync.md`). `BITPANDA_REFRESH_WATCHDOG()` est `LEGACY_DISABLED`.
- `WCORE_AUTO_HEAL` supprime les anciens triggers `UPDATE_BINANCE_SPOT` / `BINANCE_REFRESH_WATCHDOG` s'ils existent encore.

`INSTALL_BINANCE_SYNC_TRIGGER()` est legacy et ne doit pas etre utilise pour le setup courant.

## Statut

```javascript
BINANCE_SYNC_STATUS()
BINANCE_TRIGGER_STATUS()
DIAG_BINANCE_API()
```
