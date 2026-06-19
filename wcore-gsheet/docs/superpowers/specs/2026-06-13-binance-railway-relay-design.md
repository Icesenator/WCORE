# Relais Binance sur Railway — Design

Date: 2026-06-13
Statut: valide (en attente revue spec)

## Contexte

Binance bloque les IP datacenter Google (Apps Script) avec HTTP 451
("restricted location"). Le connecteur `36_BINANCE_SYNC.gs` est correct mais ne
peut pas appeler Binance directement. Solution: un relais HTTP heberge sur
Railway (IP non bloquee) qui signe les requetes et renvoie les soldes.

## Architecture

```
Apps Script UPDATE_BINANCE_SPOT
   | GET https://<app>.up.railway.app/binance?token=RELAY_TOKEN
   v
Railway (Node/Express)
   | signe HMAC-SHA256 avec BINANCE_API_KEY/SECRET (vars Railway)
   | appelle Spot + Earn flexible + Earn locked
   v
api.binance.com -> JSON agrege -> Apps Script -> onglet "Binance Spot Crypto"
```

Le secret Binance ne quitte jamais Railway. Apps Script ne connait que
`RELAY_URL` + `RELAY_TOKEN`.

## Projet relais (`wcore-gsheet/railway-relay/`)

Node + Express, un seul endpoint.

### Fichiers
- `package.json` — deps: `express`. Node >=18 (fetch natif, crypto natif).
- `server.js` — serveur Express, endpoint `/binance` + `/health`.
- `.gitignore` — `node_modules`, `.env`.
- `.env.example` — documente les variables (sans valeurs).
- `README.md` — instructions deploiement `railway`.

### Variables d'environnement (Railway)
- `BINANCE_API_KEY` — cle API Binance (lecture seule).
- `BINANCE_API_SECRET` — secret HMAC Binance.
- `RELAY_TOKEN` — jeton partage long (genere aleatoirement) exige par le relais.
- `PORT` — fourni par Railway automatiquement.

### Endpoint `GET /health`
- Repond `{ ok: true }` (pas d'auth) pour les checks Railway.

### Endpoint `GET /binance`
- Auth: query `?token=` doit egaler `RELAY_TOKEN` (sinon 401). Comparaison
  a temps constant.
- Actions:
  1. Spot: `GET /api/v3/account` signe -> `balances[].free + locked`, exclut 0.
  2. Earn flexible: `GET /sapi/v1/simple-earn/flexible/position` (pagine).
  3. Earn locked: `GET /sapi/v1/simple-earn/locked/position` (pagine).
- Reponse JSON:
  ```json
  {
    "ok": true,
    "ts": "2026-06-13T...",
    "spot":          [["BTC", 0.5], ["ETH", 2.0]],
    "earn-flexible": [["BTC", 0.3]],
    "earn-locked":   [["ETH", 1.0]]
  }
  ```
- Erreurs: `{ ok:false, error:"..." }` + HTTP 502 si Binance echoue; 401 si
  token invalide.
- Signature: `crypto.createHmac("sha256", secret).update(qs).digest("hex")`,
  header `X-MBX-APIKEY`, `recvWindow=60000`, `timestamp=Date.now()`.

## Modifs Apps Script (`36_BINANCE_SYNC.gs`)

- Nouvelles UserProperties: `BINANCE_RELAY_URL`, `BINANCE_RELAY_TOKEN`.
- Setup: `SET_BINANCE_RELAY(url, token)` (UserProperties).
- `_binFetchBuckets_` reecrit: au lieu d'appeler Binance directement, fait
  UN appel `GET {RELAY_URL}/binance?token={RELAY_TOKEN}` et mappe la reponse
  vers `{ spot, "earn-flexible", "earn-locked" }` (chaque item `[symbol, amount]`).
- Les fonctions de signature locale (`_binSign_`, `_binSignedGet_`,
  `_binFetchSpot_`, `_binFetchEarn_`) deviennent inutiles cote GAS: supprimees
  pour eviter la confusion (le relais signe). `SET_BINANCE_API_KEYS` conserve
  (compat) mais le chemin nominal passe par le relais.
- `DIAG_BINANCE_API` appelle le relais et reporte le detail (y compris erreur
  relais/au-dela).
- Reste inchange: ecriture onglet, refresh checkbox A1, triggers.

## Securite

- Secret Binance uniquement dans Railway (vars chiffrees).
- `RELAY_TOKEN` = 48+ caracteres aleatoires; transmis a Apps Script via le
  meme mecanisme bootstrap (UserProperties), jamais dans une cellule/depot.
- Le relais n'accepte que GET, ne fait que de la lecture (l'API key Binance est
  en lecture seule de toute facon).
- CORS non requis (appel serveur-a-serveur depuis Apps Script).
- Cle/secret Binance fournis dans le chat = a revoquer/regenerer; les nouvelles
  valeurs seront mises directement dans Railway (pas dans le chat).

## Hors scope

- Cache cote relais (Apps Script gere deja le cache via l'onglet).
- Rate limiting avance (usage perso, faible volume).
- Autres comptes Binance (Funding/Margin/Futures).
