# ByBit EU Sync

## Objectif

Tenter d'integrer le wallet ByBit EU (domicilie Autriche/MIAT/MiCA) dans
l'onglet `CEX - Bybit` comme on a deja Bitpanda / Binance / Bitfinex.

Script : `src/38_BYBIT_SYNC.gs`.

## Etat au 2026-06-15

- **Operationnel via relais Railway `cex-relay`** : `https://cex-relay-production.up.railway.app`.
- Apps Script stocke uniquement `BYBIT_RELAY_URL` + `BYBIT_RELAY_TOKEN` dans `UserProperties` via `SET_BYBIT_RELAY(url, token)`.
- Les secrets Bybit EU restent cote Railway (`BYBIT_API_KEY`, `BYBIT_API_SECRET`).
- Le relais appelle `api.bybit.eu` depuis Railway EU West, puis retourne les soldes normalises a GAS.
- Comptes lus : `UNIFIED` + `FUND` fusionnes dans l'onglet `CEX - Bybit`.
- Soldes confirmes a l'integration : `USDT`, `CC`, `LINK`, `EURC`, `BTC`.
- Version code : `BYBIT_SYNC_VERSION = "4.15.95"`.
- `UPDATE_BYBIT_SPOT()` retry 3 fois les erreurs transitoires de `UrlFetchApp.fetch()` vers le relais.
- `CEX - Bybit!A1` est route via `MASTER_ON_EDIT` et utilise la queue CEX one-shot (v4.15.107+) : `B1=QUEUED: <ts> BYBIT`, execution par `CEX_MANUAL_REFRESH_WORKER` ~1s plus tard, puis timestamp final en `B1` au succes.
- Transitoire (timeout Spreadsheets / quota / `BUSY`) : `B1 = RETRY n/2: ...`, requeue automatique (max 2), retry a +60s.

## Etat au 2026-06-14

- Endpoint EU confirme : `https://api.bybit.eu` (CloudFront bloque
  `api.bybit.com` depuis l'IP Apps Script : HTTP 403 `Amazon CloudFront
  distribution is configured to block access from your country`).
- Le SDK officiel `tiagosiebler/bybit-api` injecte automatiquement
  `x-referer: Cg000971` quand `apiRegion: "EU"` (consulte dans
  `src/util/requestUtils.ts` et `src/util/BaseRestClient.ts` du repo).
- Version code historique : `BYBIT_SYNC_VERSION = "4.15.89"`, header EU ajoute en conformite SDK.

## Bloqueurs confirmes pour la voie directe GAS

1. **ByBit EU ne permet PAS la creation de cle API systeme personnelle.**
   L'UI EU force le parcours `Connect to Third-Party Applications`.
   Le formulaire `type=system` repond :
   `La creation d'une Cle API a cette fin n'est pas prise en charge sur
   le site actuel.`
2. **Les cles tierces (Gainium, Siebly SDKs, Finestel, Bothub Trade EU,
   Wick Hunter EU, HaasOnline, SIGNUM EU, Botty EU) sont liees a
   l'infrastructure du partenaire.** Test reel avec cle `Siebly SDKs` :
   `retCode:10010 Unmatched IP, please check your API key's bound IP
   addresses.` Meme avec `x-referer: Cg000971`, l'IP Apps Script
   n'est pas whitelistee. Le header seul ne contourne pas la
   restriction.
3. **`api.bybit.com` est bloque par CloudFront depuis l'IP Google
   Apps Script** (HTTP 403). Seul `api.bybit.eu` repond publiquement
   (`/v5/market/time` HTTP 200).
4. **`clasp run` reste inutilisable** (EXECUTION_API non deploye sur le
   projet Apps Script) - voir gotchas AGENTS.md. Les validations passent
   par la spreadsheet / `safe-push`.

## Recherche "app tierce avec API/export" (2026-06-14)

| App | Statut | API publique / export exploitable par WCORE ? |
| --- | --- | --- |
| `Gainium.io EU` | "Connect to Third-Party Applications" via UI Bybit, IP whitelisting auto. Repo GitHub `Gainium/exchange-connector-sh` (NestJS, MIT) mais c'est leur connecteur interne - pas d'API portfolio publique. | Non - API non documentee publiquement. |
| `Siebly SDKs` | Cle tierce testee. Maintient plusieurs SDKs Bybit/OKX/Bitget/... (NPM `bybit-api` v4.6.4, ~22 980 downloads/sem). | Non - cle IP-locked, IP Apps Script refuse. |
| `Finestel` | "ByBit EU integration built for European traders". Positionnement asset management / copy trading / white label, pas API portfolio publique. | Non - pas d'API export. |
| `Wick Hunter EU` | Bots DCA/grid automatises. Positionnement bots de trading, pas API portfolio. | Non. |
| `HaasOnline` | TradeServer Cloud + HaasScript. Bots, dashboard personnalise. Pas d'API portfolio publique. | Non. |
| `Botty EU` | Page quasi vide. | Non. |
| `SIGNUM EU` | Pas de page produit publique accessible. | Inconnu. |
| `Bothub Trade EU` | Pas de page produit publique accessible. | Inconnu. |

## Piste la plus prometteuse : `Tax API` Bybit EU

Bybit EU a un produit dedie `Tax API` (`https://www.bybit.eu/en-EU/tax-api`)
documente comme alternative aux cles API personnelles pour les usages
fiscaux/portfolio.

- Documentation Blockpit (2026-04-27) :
  `How to import data via Bybit EU API key?` - utilise le menu footer
  `Tax API` du site Bybit EU, cree une `Create a New Tax API`
  (System-generated API Keys), renouvelable tous les 3 mois.
- `Synced Balance` (chiffre officiel Blockpit) : **"All Account Balances
  supported"** - exactement ce que WCORE cherche pour `CEX - Bybit`.
- Acces reserve aux `System-generated API Keys` -> pas forcement
  soumis a l'IP whitelist stricte des cles tierces (a verifier en
  pratique).
- Statut actuel : **a tester** par l'utilisateur. Si la cle Tax API
  fonctionne depuis Apps Script (meme contrainte IP probable), c'est la
  voie la plus propre.

## Tests effectues localement

- `node tests/bybit-signature.test.js` : OK (signature HMAC Bybit conforme
  a l'exemple officiel).
- `node scripts/validate-static.js` : OK (2570 fonctions globales).
- Endpoint `GET https://api.bybit.eu/v5/account/wallet-balance` avec cle
  Siebly SDKs + x-referer Cg000971 : `retCode:10010 Unmatched IP`.
- `GET https://api.bybit.eu/v5/market/time` (public) : HTTP 200.
- `GET https://api.bybit.com/v5/market/time` depuis GAS : HTTP 403
  CloudFront (deja documente v4.15.87).

## Setup actuel

```javascript
SET_BYBIT_RELAY("https://cex-relay-production.up.railway.app", "<relay-token>")
SETUP_BYBIT_SHEET()
```

Les triggers actifs sont installes par `WCORE_AUTO_HEAL` : `CEX_HOURLY_REFRESH()` (`everyHours(4)` depuis v4.15.114) pour l'auto; les demandes manuelles passent par la queue one-shot `CEX_MANUAL_REFRESH_WORKER` (`BITPANDA_REFRESH_WATCHDOG()` est `LEGACY_DISABLED`). `INSTALL_BYBIT_SYNC_TRIGGER()` est legacy et ne doit pas etre utilise pour le setup courant.

Diagnostics :

```javascript
DIAG_BYBIT_API()
UPDATE_BYBIT_SPOT()
BYBIT_SYNC_STATUS()
BYBIT_TRIGGER_STATUS()
```

Note : `BYBIT_SYNC_STATUS()` ecrit dans `ScriptProperties`. Si le stockage global GAS est sature, l'ecriture du statut peut etre skippee sans bloquer l'ecriture de l'onglet.

## Portefeuille Crypto Details V2

Bybit est agrege dans `Portefeuille Crypto Details V2` via le libelle `CEX - Bybit`
en colonne E. Les soldes (colonne H = Libre) utilisent des formules SUMIFS :

```
=SUMIFS('CEX - Bybit'!B:B;'CEX - Bybit'!A:A;C<row>;'CEX - Bybit'!C:C;"spot")
```

5 lignes branchees le 2026-06-15 : BTC, USDT, CC, LINK, EURC. Avant cette date,
les valeurs etaient saisies en dur et ne se mettaient jamais a jour.
Voir `docs/cex-sync.md` pour l'architecture commune CEX.

## Connexions

- `src/38_BYBIT_SYNC.gs` - connecteur GAS, version `4.15.95`.
- `railway-relay/server.js` - endpoint `GET /bybit?token=...` du relais `cex-relay`.
- `tests/bybit-signature.test.js` - test HMAC SHA-256 Bybit V5.
- `docs/cex-sync.md` - architecture commune des 6 connecteurs CEX.
- AGENTS.md - section "Gotchas Bybit EU" / "Connecteurs CEX".
- Spreadsheet : `1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4`,
  onglet `CEX - Bybit`.
