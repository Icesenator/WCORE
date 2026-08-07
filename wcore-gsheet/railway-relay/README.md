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
- `GET /binance` -> soldes Binance Spot + Earn:
  ```json
  {
    "ok": true,
    "ts": "...",
    "spot": [["BTC", 0.5]],
    "earn-flexible": [["BTC", 0.3]],
    "earn-locked": [["ETH", 1.0]]
  }
  ```
- `GET /bybit` -> soldes Bybit EU (UNIFIED + FUND fusionnes,
  stablecoins normalises) :
  ```json
  {
    "ok": true,
    "ts": "...",
    "spot": [["USDT", 0.09], ["EURC", 12.69], ["BTC", 0.0002]]
  }
  ```
- `GET /coinbase` -> soldes Coinbase Advanced Trade/CDP
  (accounts brokerage, stablecoins normalises) :
  ```json
  {
    "ok": true,
    "ts": "...",
    "spot": [["BTC", 0.01], ["EURC", 12.34]]
  }
  ```
- `GET /okx` -> soldes OKX trading + funding (stablecoins
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
- `POST /coinbase/account` -> flux multi-user (WCORE web), signature CDP ES256 avec la cle utilisateur.
- `POST /okx/account` -> flux multi-user (WCORE web), signature HMAC OKX avec les secrets utilisateur.
- `POST /stock/prices` -> pricing actions/ETFs Bitpanda pour WCORE web, avec conversion FX vers EUR.

Envoyer le jeton dans un header afin qu'il ne fuite pas dans les URLs ou les logs :

```powershell
$headers = @{ "x-relay-token" = $env:RELAY_TOKEN }
Invoke-RestMethod "$env:CEX_RELAY_URL/binance" -Headers $headers

$headers = @{ Authorization = "Bearer $env:RELAY_TOKEN" }
Invoke-RestMethod "$env:CEX_RELAY_URL/stock/prices" -Method Post -Headers $headers `
  -ContentType "application/json" -Body '{"symbols":["AAPL"]}'
```

Les query strings `?token=...` restent temporairement compatibles sur les endpoints legacy, mais sont depreciees.

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

```powershell
# Depuis la racine du depot
railway link
./wcore-web/scripts/deploy.ps1 -Service cex-relay
railway variables
railway domain
```

Le script epingle le Dockerfile du relais tout en conservant la racine du monorepo comme contexte Railway.

## Securite

- Les secrets CEX (Binance, Bybit, Coinbase, OKX) ne quittent jamais Railway.
- Apps Script n'envoie que `RELAY_TOKEN`.
- Les cles API doivent etre en lecture seule.
