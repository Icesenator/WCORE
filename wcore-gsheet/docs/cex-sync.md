# CEX Sync - Architecture commune

Document transverse aux connecteurs CEX de WCORE : Bitpanda, Binance,
Bitfinex, Bybit, Coinbase, OKX. Pour les details specifiques a chaque exchange, voir
`docs/bitpanda-sync.md`, `docs/binance-sync.md`, `docs/bitfinex-sync.md`,
`docs/bybit-eu-sync.md`.

## Onglets et connecteurs

| Onglet | Script | Acces API | Secrets |
| --- | --- | --- | --- |
| `CEX - Bitpanda Crypto` / `Fiat` / `Stocks` / `Commodity` | `src/35_BITPANDA_SYNC.gs` | Direct (IP GAS OK) | `ScriptProperties` |
| `CEX - Binance` | `src/36_BINANCE_SYNC.gs` | Relais Railway `cex-relay` (IP GAS bloquee 451) | Railway |
| `CEX - Bitfinex` | `src/37_BITFINEX_SYNC.gs` | Direct (IP GAS OK) | `UserProperties` + `DocumentProperties` |
| `CEX - Bybit` | `src/38_BYBIT_SYNC.gs` | Relais Railway `cex-relay` (api.bybit.eu geo-bloque GAS) | Railway |
| `CEX - Coinbase` | `src/39_COINBASE_SYNC.gs` | Relais Railway `cex-relay` (signature CDP ES256 cote Node) | Railway |
| `CEX - OKX` | `src/40_OKX_SYNC.gs` | Relais Railway `cex-relay` (my.okx.com, signature HMAC + passphrase cote Node) | Railway |

Refresh horaire: `CEX_HOURLY_REFRESH()` (trigger 1h, garanti par WCORE_AUTO_HEAL)
met a jour les 6 CEX. Les anciens triggers horaires individuels (`UPDATE_*_SPOT`)
sont supprimes par l'auto-heal au profit de ce trigger central.
Renommage v4.15.98: tous les onglets CEX sont prefixes `CEX - ` (au lieu de
`* Crypto` / `Bitpanda Spot *`).

Structure des onglets CEX (identique) :
`A=cryptocoin_symbol, B=balance, C=source, D=updated_at`.
Ligne 1 = `A1` checkbox refresh + `B1` timestamp/diagnostic.
Ligne 2 = en-tetes. Lignes 3+ = donnees.

## Flux de refresh manuel uniforme (v4.15.92+)

Tous les CEX partagent le meme flux, base sur des helpers communs definis
dans `35_BITPANDA_SYNC.gs` :

- `CEX_SET_MANUAL_REQUEST(sheet, flagProp)` : pose le flag + ecrit `B1=REQUEST: <ts>`.
- `CEX_GET_SPREADSHEET()` : ouvre la spreadsheet (active ou par ID).
- `CEX_HAS_MANUAL_REQUEST(ss, sheetName, flagProp)` : vrai si flag Properties OU `B1` commence par `REQUEST:`.
- `CEX_CLEAR_MANUAL_REQUEST(flagProp)` : efface le flag (Script + User Properties).
- `CEX_RUN_MANUAL_UPDATE(ss, sheetName, label, updateFn)` : execute le refresh, gere BUSY/erreur visible en `B1`.

Sequence quand l'utilisateur coche `A1` sur un onglet CEX :

1. `WCORE_ON_EDIT()` (16_REFRESH.gs) route vers le handler du CEX
   (`BITPANDA_ON_EDIT` / `BINANCE_ON_EDIT` / `BITFINEX_ON_EDIT` / `BYBIT_ON_EDIT` / `COINBASE_ON_EDIT` / `OKX_ON_EDIT`).
2. Le handler decoche `A1` et ecrit `B1 = REQUEST: <timestamp>` (visible).
3. Le watchdog central `BITPANDA_REFRESH_WATCHDOG()` (trigger 1 min) detecte la
   demande via `B1=REQUEST:` et lance `UPDATE_<CEX>_SPOT()`.
4. Succes : `B1` devient le timestamp final, les rows sont reecrites avec le meme timestamp.
5. `BUSY` (lock concurrent) : `B1` reste `REQUEST: BUSY retry <ts>` -> retry au cycle suivant.
   Si les rows ont quand meme ete rafraichies, `B1` est restaure au timestamp des rows.
6. Erreur : `B1` affiche le diagnostic (`<CEX> ERROR: ...`).

### Pourquoi `B1=REQUEST` et pas seulement les Properties

Les `ScriptProperties` peuvent etre satures (quota 500KB) et les `UserProperties`
ne sont pas fiables entre contextes de trigger. Le flag visible `B1` est lu par
le time-trigger independamment des Properties -> robuste et observable.

## Watchdog central unique (v4.15.85)

`BITPANDA_REFRESH_WATCHDOG()` est le SEUL watchdog CEX. Il traite :

- les onglets Bitpanda (`A1`),
- les cellules de refresh groupe (`Action Rebalancing!Z1`, `Portefeuille Crypto!AC2` incluant Coinbase),
- les demandes manuelles `CEX - Binance!A1`, `CEX - Bitfinex!A1`, `CEX - Bybit!A1`, `CEX - Coinbase!A1`, `CEX - OKX!A1`.

L'auto-heal (`16B_AUTO_HEAL.gs`, spec `v4.15.85`) installe
`BITPANDA_REFRESH_WATCHDOG` (1 min) et SUPPRIME les watchdogs individuels legacy
(`BINANCE_REFRESH_WATCHDOG`, `BITFINEX_REFRESH_WATCHDOG`, `BYBIT_REFRESH_WATCHDOG`)
pour eviter les conflits de lock (BUSY).

Filet de securite : `ACTIVITY_WATCHDOG()` (27_ACTIVITY_REFRESH.gs) appelle aussi
`BITPANDA_REFRESH_WATCHDOG()` en tete de run, au cas ou le trigger 1 min serait
absent/stale apres un push.

## Relais Railway `cex-relay`

Binance, Bybit, Coinbase et OKX passent par le relais Railway multi-CEX (region EU West) :

- Domaine : `https://cex-relay-production.up.railway.app`.
- Endpoints : `GET /health`, `GET /binance?token=...`, `GET /bybit?token=...`, `GET /coinbase?token=...`, `GET /okx?token=...`, `POST /binance/account`.
- Secrets CEX cote Railway uniquement; GAS n'envoie que le `RELAY_TOKEN`.
- Setup GAS : `SET_BINANCE_RELAY(url, token)` et `SET_BYBIT_RELAY(url, token)`. Coinbase peut utiliser `SET_COINBASE_RELAY(url, token)`, mais retombe aussi sur le relais Bybit/Binance existant si configure.
- Source : `railway-relay/` (package `wcore-cex-relay`).

## Integration Portefeuille Crypto Details

L'onglet `Portefeuille Crypto Details` agrege wallets on-chain ET positions CEX.

- Colonne `E` (`Position :`) = libelle : `Ledger - X`, `Binance Web3 Wallet - X`
  (on-chain) ou `CEX - Bitpanda` / `CEX - Binance` / `CEX - Bitfinex` / `CEX - Bybit`.
- Colonne `H` (Libre), `I` (Flex), `J` (Lock), `K` (Total = somme), `L` (Valorisation).

### Wallets on-chain (formule generique)

```
=SUMPRODUCT((INDIRECT("'"&E&"'!A:A")=E)*1; (INDIRECT("'"&E&"'!D:D")=G)*1; INDIRECT("'"&E&"'!E:E"))
```

`INDIRECT` sur le libelle E (= nom d'onglet exact), match sur A=chain + D=contract.

### Positions CEX (formules SUMIFS dediees)

Le libelle `CEX - X` differe du nom d'onglet (`X Crypto`), et la structure de
colonnes CEX differe des onglets on-chain. On garde donc une formule SUMIFS
dediee par CEX (choix d'uniformisation : robuste, zero risque).

| CEX | Colonne H (Libre) |
| --- | --- |
| Bitpanda | `=VLOOKUP(C;'CEX - Bitpanda Crypto'!A:B;2;FALSE)` |
| Binance | `=SUMIFS('CEX - Binance'!B:B;'CEX - Binance'!A:A;C;'CEX - Binance'!C:C;"spot")` (+ `I`=earn-flexible, `J`=earn-locked) |
| Bitfinex | `=SUMIFS('CEX - Bitfinex'!B:B;'CEX - Bitfinex'!A:A;C;'CEX - Bitfinex'!C:C;"spot")` |
| Bybit | `=SUMIFS('CEX - Bybit'!B:B;'CEX - Bybit'!A:A;C;'CEX - Bybit'!C:C;"spot")` |
| Coinbase | `=SUMIFS('CEX - Coinbase'!B:B;'CEX - Coinbase'!A:A;C;'CEX - Coinbase'!C:C;"spot")` |
| OKX | `=SUMIFS('CEX - OKX'!B:B;'CEX - OKX'!A:A;C;'CEX - OKX'!C:C;"spot")` |

Bybit a ete branche en formules SUMIFS le 2026-06-15 (5 lignes : BTC, USDT, CC,
LINK, EURC) — auparavant les valeurs etaient saisies en dur et ne se mettaient
jamais a jour.

### CEX sans connecteur

`CEX - Coinbase` est formule depuis `CEX - Coinbase` depuis v4.15.96.
`CEX - OKX` est formule depuis `CEX - OKX` depuis v4.15.97.

## Recap Portfolio

Les onglets CEX sont inclus en affichage seul dans le Recap
(`_isLedgerLike_`, `_wd_isCexSheet_` dans 16_REFRESH.gs / 17_LISTING.gs).
Le watchdog on-chain (B1 pulse) les ignore : leur refresh passe par le
watchdog CEX central.

## Gotchas cles

- Ne JAMAIS reintroduire les watchdogs CEX individuels en parallele du central
  (conflits de lock -> BUSY permanent).
- Bitfinex : cles dans `DocumentProperties` (lisible par triggers). Si
  `CEX - Bitfinex!B1` affiche `Missing BITFINEX_API_KEY/...`, relancer
  `SET_BITFINEX_API_KEYS(...)` une fois.
- `clasp run` / `scripts.run` indisponibles (EXECUTION_API non accessible au
  service account). Verification CEX via lecture spreadsheet (service account gsheets).
- Renommer un onglet CEX casse : formules Details, code GAS (`*_SYNC_CONFIG.SHEET`),
  Recap, flux `B1=REQUEST`. Ne pas renommer sans migration coordonnee complete.
