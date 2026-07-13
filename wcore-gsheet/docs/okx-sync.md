# OKX Sync

Connecteur OKX pour WCORE. Alimente l'onglet `CEX - OKX` via le relais Railway
multi-CEX `cex-relay`. Source : `src/40_OKX_SYNC.gs`.

## Pourquoi un relais

L'IP Apps Script est bloquée/geo-filtrée par OKX. Le relais Railway (EU West)
signe et exécute les requêtes ; Apps Script ne stocke que l'URL + token du relais.

## Host EEA obligatoire

- Host : `https://my.okx.com` (variable relais `OKX_BASE_URL`, défaut `my.okx.com`).
- `www.okx.com` retourne `code 50119 "API key doesn't exist"` quand le compte est
  sur l'entité **EEA**. Toujours vérifier le domaine de login OKX (ex: `my.okx.com`)
  avant de choisir le host.

## Signature

- HMAC-SHA256, encodé base64.
- Prehash : `timestamp + method + requestPath + body` (timestamp ISO
  `YYYY-MM-DDTHH:mm:ss.sssZ`).
- Headers : `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP`,
  `OK-ACCESS-PASSPHRASE`.
- **3 secrets requis** : clé API + secret + passphrase. Le "nom de clé API"
  (libellé, ex `GSHEET`) n'est PAS la passphrase.

## Comptes lus

- Trading : `GET /api/v5/account/balance` (détails par devise).
- Funding : `GET /api/v5/asset/balances`.
- Les deux sont fusionnés et normalisés.

## Variables Railway

| Variable | Description |
|----------|-------------|
| `OKX_API_KEY` | Clé API OKX (lecture seule) |
| `OKX_API_SECRET` | Secret HMAC OKX |
| `OKX_API_PASSPHRASE` | Passphrase API OKX |
| `OKX_BASE_URL` | Optionnel, défaut `https://my.okx.com` |

Jamais dans GAS, ni dans une cellule, ni dans le repo.

## Setup GAS

```javascript
SET_OKX_RELAY("https://cex-relay-production.up.railway.app", "<RELAY_TOKEN>")
```

Fallback relais Bybit/Binance si `OKX_RELAY_*` absents.

## Normalisation des symboles

- USD / USDC / TUSD / DAI -> `USDT`
- EUR / EURC / EURI / EURT -> `EURC`

## Refresh

- Manuel : `CEX - OKX!A1` (checkbox) -> watchdog central -> `UPDATE_OKX_SPOT()`.
- Groupe : `Portefeuille Crypto V2!U2` inclut OKX.
- Auto : `CEX_HOURLY_REFRESH()` (trigger `everyHours(4)` depuis v4.15.114, auto-heal).

## Endpoint vide accepté

`/okx` retourne `{ ok:true, spot:[] }` si aucun solde positif (ne throw pas),
pour ne pas casser l'onglet ni les formules Details (fallback manuel préservé).

## Diagnostic

- `DIAG_OKX_API()` (GAS).
- Direct relais : `GET /okx?token=RELAY_TOKEN`.

## Gotchas

- `code 50119 "API key doesn't exist"` = mauvais host (utiliser `my.okx.com`
  pour comptes EEA), PAS une clé invalide.
- Un faux `spot=0 ok=true` peut masquer un `401` si le code avale l'erreur d'auth.
  En cas de doute, vérifier le `code`/`msg` OKX réel (ex: endpoint debug temporaire).
