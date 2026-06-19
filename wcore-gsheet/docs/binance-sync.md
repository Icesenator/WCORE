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

- `CEX - Binance!A1` ecrit `REQUEST: ...` en `B1`, puis le watchdog CEX central
  (`BITPANDA_REFRESH_WATCHDOG()`) traite la demande.
- Au succes, `B1` devient le timestamp final et les rows sont reecrites avec le meme timestamp.
- En cas de `BUSY`, `B1` reste en `REQUEST: BUSY retry ...` et le cycle suivant retry.
- `Portefeuille Crypto!AC2` pose le flag CEX commun via `BITPANDA_ON_EDIT()`, traite par `BITPANDA_REFRESH_WATCHDOG()` : refresh `CEX - Bitpanda Crypto`, `CEX - Bitpanda Fiat` et `CEX - Binance`.

Ne pas mettre la checkbox `AC2` dans `Action Rebalancing` ni dans `Portefeuille Crypto Details`.

## Triggers

```javascript
INSTALL_BINANCE_SYNC_TRIGGER()
```

Legacy seulement. Le flux manuel standard est centralise par `BITPANDA_REFRESH_WATCHDOG()`.

Installe :

- `UPDATE_BINANCE_SPOT()` toutes les heures.
- `BINANCE_REFRESH_WATCHDOG()` chaque minute.

Le refresh `Portefeuille Crypto!AC2` utilise le watchdog Bitpanda car il coordonne Bitpanda + Binance en une seule action utilisateur.

## Statut

```javascript
BINANCE_SYNC_STATUS()
BINANCE_TRIGGER_STATUS()
DIAG_BINANCE_API()
```
