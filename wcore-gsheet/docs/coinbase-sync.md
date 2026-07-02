# Coinbase Sync

Connecteur Coinbase pour WCORE. Alimente l'onglet `CEX - Coinbase` via le relais
Railway multi-CEX `cex-relay`. Source : `src/39_COINBASE_SYNC.gs`.

## Pourquoi un relais

Les clés Coinbase CDP (Advanced Trade) exigent une signature **JWT ES256**
(ECDSA P-256). Apps Script ne sait pas signer ES256 de façon fiable, donc la
signature est faite côté Node dans le relais Railway (`/coinbase`), qui convertit
la signature DER renvoyée par `crypto.sign` en format JOSE (`derToJose`).

Apps Script ne stocke que l'URL + le token du relais ; les secrets Coinbase
restent dans Railway.

## API

- Host : `https://api.coinbase.com`
- Endpoint : `GET /api/v3/brokerage/accounts` (pagination via `cursor`)
- JWT claims : `iss=cdp`, `sub=<keyName>`, `uri="GET api.coinbase.com/api/v3/brokerage/accounts"`,
  `nbf`, `exp=nbf+120`. Header : `alg=ES256`, `kid=<keyName>`, `nonce`.
  **Pas** de claim `aud`.
- Le `uri` du JWT ne contient que le **path** (sans query string).

## Variables Railway

| Variable | Description |
|----------|-------------|
| `COINBASE_API_KEY_NAME` | Nom complet de la clé CDP : `organizations/{org}/apiKeys/{id}` |
| `COINBASE_PRIVATE_KEY` | Clé privée EC PEM (`-----BEGIN EC PRIVATE KEY-----...`), `\n` acceptés |

Jamais dans GAS, ni dans une cellule, ni dans le repo.

## Setup GAS

```javascript
SET_COINBASE_RELAY("https://cex-relay-production.up.railway.app", "<RELAY_TOKEN>")
```

Fallback : si `COINBASE_RELAY_URL/TOKEN` sont absents, `_cbGetRelay_()` retombe
sur le relais Bybit puis Binance déjà configuré (un seul `RELAY_TOKEN` partagé).

## Normalisation des symboles

- `RONIN -> RON`
- USD / USDC / TUSD / EUR-stables -> `USDT`
- EUR / EURC / EURI / EURS -> `EURC`

## Refresh

- Manuel : `CEX - Coinbase!A1` (checkbox) -> `B1=QUEUED: ...` -> queue one-shot
  `CEX_MANUAL_REFRESH_WORKER` -> `UPDATE_COINBASE_SPOT()` (v4.15.107+).
- Groupe : `Portefeuille Crypto!AC2` inclut Coinbase.
- Auto : `CEX_HOURLY_REFRESH()` (trigger `everyHours(4)` depuis v4.15.114, auto-heal).

## Diagnostic

- `DIAG_COINBASE_API()` (GAS, via relais).
- Direct relais : `GET /coinbase?token=RELAY_TOKEN` -> `{ ok, ts, spot: [[sym, bal], ...] }`.

## Gotchas

- Coinbase renvoie `RONIN` (normalisé en `RON` dans le relais).
- Le remplissage de l'onglet via API REST (service account) ne pose pas la
  checkbox `A1` ; seul `_cbWriteSheet_` (GAS) ou un `setDataValidation` explicite
  la garantit.
