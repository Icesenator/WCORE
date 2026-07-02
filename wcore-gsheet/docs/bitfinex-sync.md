# Bitfinex Sync

## Objectif

Synchroniser les positions Bitfinex (wallet spot = "exchange") dans l'onglet
`CEX - Bitfinex` sans SyncWith.

Script : `src/37_BITFINEX_SYNC.gs`.

## Architecture

Contrairement a Binance (HTTP 451 sur les IP datacenter Google), **Bitfinex ne
bloque PAS l'IP Apps Script**. On appelle donc l'API officielle v2 directement,
sans relais (comme Bitpanda).

- API auth v2 : `POST /v2/auth/r/wallets`.
- Signature **HMAC-SHA384** (pas SHA256) du payload `/api/{path}{nonce}{body}`.
- Headers : `bfx-nonce`, `bfx-apikey`, `bfx-signature`.
- `nonce` strictement croissant (microsecondes : `Date.now() * 1000`).

## Setup

Cles stockees dans `UserProperties` + `DocumentProperties`, jamais dans une cellule :

```javascript
SET_BITFINEX_API_KEYS("apiKey", "apiSecret")
```

Les time-triggers lisent `DocumentProperties`. Si `CEX - Bitfinex!B1` affiche
`Missing BITFINEX_API_KEY/BITFINEX_API_SECRET`, relancer `SET_BITFINEX_API_KEYS(...)`
une fois depuis l'editeur Apps Script.

Pour supprimer :

```javascript
CLEAR_BITFINEX_API_KEYS()
```

## Diagnostic

```javascript
DIAG_BITFINEX_API()
```

Retourne le count et un sample du bucket `spot`.

## Mise a jour

```javascript
UPDATE_BITFINEX_SPOT()
```

Ecrit l'onglet `CEX - Bitfinex`. Seul le wallet **exchange** (spot) est
synchronise. Les wallets `funding` (lending) et `margin` sont ignores
(`BITFINEX_SYNC_CONFIG.WALLET_TYPES`).

Format de reponse Bitfinex :
`[WALLET_TYPE, CURRENCY, BALANCE, UNSETTLED_INTEREST, AVAILABLE_BALANCE, ...]`.
On utilise `BALANCE` (total, index 2).

## Aliases devises

Bitfinex utilise des codes courts/historiques. `BITFINEX_SYMBOL_ALIASES`
normalise les tickers crypto vers leur forme canonique (cumul si collision) :

- `ATO` -> `ATOM`
- `DOG` -> `DOGE`
- `IOT` / `MIOTA` -> `IOTA`
- `*F0` (derivatives settle) -> sous-jacent

## Consolidation stables / fiat

Comme Binance et Bitpanda, on regroupe les stablecoins et fiat
(`BITFINEX_STABLE_MAP`, applique apres les alias) :

- USD et stables USD -> `USDT` : `USD`, `UST`, `USDC`/`UDC`, `TUSD`, `USTF0`
- EUR et stables EUR -> `EURC` : `EUR`, `EURT`/`EUT`, `EURS`/`EUS`, `EURI`, `EUTF0`

Les soldes des codes consolides sont cumules sur la ligne cible (`USDT` / `EURC`).

## Checkboxes manuelles

- `CEX - Bitfinex!A1` (v4.15.107+) ecrit `QUEUED: <ts> BITFINEX` en `B1` et pousse
  un job dans la queue one-shot; `CEX_MANUAL_REFRESH_WORKER` l'execute ~1s plus
  tard. En cas d'erreur definitive, `B1` affiche le diagnostic visible.
- Au succes, `B1` devient le timestamp final et les rows sont reecrites avec le meme timestamp.
- Transitoire (timeout Spreadsheets / quota / `BUSY`) : `B1 = RETRY n/2: ...`, requeue auto, retry a +60s.
- `Portefeuille Crypto!AC2` batch-enqueue le bloc CEX crypto : `BITPANDA_CRYPTO`
  (crypto seul depuis v4.15.115), `BINANCE`, `BITFINEX`, `BYBIT`, `COINBASE`,
  `OKX` en une seule action utilisateur. Statut en `AD2`.

## Triggers

Le flux courant est centralise :

- `CEX_HOURLY_REFRESH()` met a jour Bitfinex avec les autres CEX toutes les 4h (`everyHours(4)`, v4.15.114).
- Les refresh manuels passent par la queue one-shot (voir `docs/cex-sync.md`). `BITPANDA_REFRESH_WATCHDOG()` est `LEGACY_DISABLED`.
- `WCORE_AUTO_HEAL` supprime les anciens triggers `UPDATE_BITFINEX_SPOT` / `BITFINEX_REFRESH_WATCHDOG` s'ils existent encore.

`INSTALL_BITFINEX_SYNC_TRIGGER()` est legacy et ne doit pas etre utilise pour le setup courant.

## Statut

```javascript
BITFINEX_SYNC_STATUS()
BITFINEX_TRIGGER_STATUS()
DIAG_BITFINEX_API()
```
