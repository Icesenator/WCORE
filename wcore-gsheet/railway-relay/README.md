# wcore-cex-relay

Relais HTTP signe multi-CEX pour WCORE (Apps Script + web). Contourne les
blocages IP/geo datacenter Google :
- Binance renvoie HTTP 451 aux IP Apps Script.
- `api.bybit.eu` (CloudFront) geo-bloque les IP Apps Script (HTTP 403).
- Coinbase CDP utilise une signature JWT ES256 plus fiable cote Node que GAS.
- OKX utilise une signature HMAC + passphrase, centralisee dans le relais.

Heberge sur Railway (region EU West, IP non bloquee).

Domaine actif : `https://cex-relay-production.up.railway.app`.

## Endpoints

- `GET /health` -> `{ ok: true }` (pas d'auth).
- `GET /binance?token=RELAY_TOKEN` -> soldes Binance Spot + Earn:
  ```json
  {
    "ok": true,
    "ts": "...",
    "spot": [["BTC", 0.5]],
    "earn-flexible": [["BTC", 0.3]],
    "earn-locked": [["ETH", 1.0]]
  }
  ```
- `GET /bybit?token=RELAY_TOKEN` -> soldes Bybit EU (UNIFIED + FUND fusionnes,
  stablecoins normalises) :
  ```json
  {
    "ok": true,
    "ts": "...",
    "spot": [["USDT", 0.09], ["EURC", 12.69], ["BTC", 0.0002]]
  }
  ```
- `GET /coinbase?token=RELAY_TOKEN` -> soldes Coinbase Advanced Trade/CDP
  (accounts brokerage, stablecoins normalises) :
  ```json
  {
    "ok": true,
    "ts": "...",
    "spot": [["BTC", 0.01], ["EURC", 12.34]]
  }
  ```
- `GET /okx?token=RELAY_TOKEN` -> soldes OKX trading + funding (stablecoins
  normalises) :
  ```json
  {
    "ok": true,
    "ts": "...",
    "spot": [["USDT", 1.23], ["BTC", 0.01]]
  }
  ```
- `POST /binance/account` -> flux multi-user (WCORE web), cles user signees ici.
- `POST /bybit/account` -> flux multi-user (WCORE web), cles user signees ici,
  symboles exacts non fusionnes.

## Variables Railway

| Variable | Description |
|----------|-------------|
| `BINANCE_API_KEY` | Cle API Binance (lecture seule) |
| `BINANCE_API_SECRET` | Secret HMAC Binance |
| `BYBIT_API_KEY` | Cle API Bybit EU (Tax API, lecture seule) |
| `BYBIT_API_SECRET` | Secret HMAC Bybit |
| `COINBASE_API_KEY_NAME` | Nom complet de la cle API Coinbase CDP (`organizations/.../apiKeys/...`) |
| `COINBASE_PRIVATE_KEY` | Cle privee EC PEM Coinbase (`\\n` acceptes dans Railway) |
| `OKX_API_KEY` | Cle API OKX lecture seule |
| `OKX_API_SECRET` | Secret HMAC OKX |
| `OKX_API_PASSPHRASE` | Passphrase API OKX |
| `OKX_BASE_URL` | Optionnel, defaut `https://my.okx.com` (EEA). `www.okx.com` -> code 50119 |
| `RELAY_TOKEN` | Jeton partage (48+ chars aleatoires) exige par tous les endpoints auth |
| `PORT` | Fourni automatiquement par Railway |

## Deploiement (CLI)

```bash
cd railway-relay
railway link        # selectionner le projet WCORE
railway up          # build + deploy
railway variables   # verifier/definir les variables
railway domain      # generer l'URL publique
```

## Securite

- Les secrets CEX (Binance, Bybit, Coinbase, OKX) ne quittent jamais Railway.
- Apps Script n'envoie que `RELAY_TOKEN`.
- Les cles API doivent etre en lecture seule.
