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

Refresh automatique: `CEX_HOURLY_REFRESH()` (trigger `everyHours(4)` depuis
v4.15.114, garanti par WCORE_AUTO_HEAL) met a jour les 6 CEX. Cadence 4h =
dernier palier GAS sous le seuil stale watchdog `WD_STALE_I1_HOURS=5h`
(`everyHours` n'accepte que 1/2/4/6/8/12). Les anciens triggers horaires
individuels (`UPDATE_*_SPOT`) sont supprimes par l'auto-heal au profit de ce
trigger central.
Renommage v4.15.98: tous les onglets CEX sont prefixes `CEX - ` (au lieu de
`* Crypto` / `Bitpanda Spot *`).

Structure des onglets CEX (identique) :
`A=cryptocoin_symbol, B=balance, C=source, D=updated_at`.
Ligne 1 = `A1` checkbox refresh + `B1` timestamp/diagnostic.
Ligne 2 = en-tetes. Lignes 3+ = donnees.

## Flux de refresh manuel : queue one-shot (v4.15.107-115)

Le poller 1 min (`BITPANDA_REFRESH_WATCHDOG` + variantes) est SUPPRIME
(`LEGACY_DISABLED`). Tous les refresh manuels passent par une queue de jobs
one-shot definie dans `35_BITPANDA_SYNC.gs` :

- `CEX_QUEUE_OR_MARK_MANUAL_JOB(sheet, flagProp, label, updateFn, e)` : point
  d'entree des `A1` CEX (via chaque `*_ON_EDIT`).
- `_cexEnqueueManualJobs_(jobs)` : enqueue BATCH — 1 ecriture
  `CEX_MANUAL_JOB_QUEUE` (ScriptProperties) + 1 statut par cellule + 1 seul
  ensure du trigger worker. Utilise par `Z1` (2 jobs) et `AC2` (6 jobs).
- `CEX_MANUAL_REFRESH_WORKER` : **trigger récurrent `everyMinutes(1)`** (v4.15.118)
  installé par l'auto-heal. Les one-shot `after(1s)` ratent silencieusement sous
  saturation (granularité ~1 min, drops visibles) — un recurring 1 min est
  fiable. **Drain budget** : traite toute la queue dans un budget de 3 min par
  run (au lieu d'1 job), retry transitoire 2s + `Utilities.sleep`, lease
  `CEX_WORKER_LEASE` TTL 2 min. Retry `WORKER_BUSY` à +15s. No-op si queue vide.
- `_cexRunManualJob_(job)` : execute le job; erreurs transitoires
  (`Service Spreadsheets timed out`, quota, `BUSY`) -> requeue automatique
  (max 2 retries, statut visible `RETRY n/2: ...`).
- `CEX_MANUAL_REFRESH_WORKER_FORCE()` : draine la queue depuis l'editeur.
- `CEX_MANUAL_ACTIVE_UNTIL_MS` : pose pendant 90s (v4.15.117) ; `BaseEngine.cexBusyStatus`
  fait retourner `[BUSY:CEX] <ts cache>` aux `*_REFRESH_STATUS` on-chain. Le
  watchdog re-pulse avec cooldown 10 min un onglet resté en `[BUSY:CEX]`
  (v4.15.116 — sans ce cas, `I1` non parsable = `needsPulse:false` permanent).
- **B1 canonique** (v4.15.117) : `_cexWriteManualJobStatus_` ré-écrit `B1` au
  timestamp de `D3` après succès. Plus de `B1 = RETRY 1/2` coincé après un job
  qui a en fait passé.

Sequence quand l'utilisateur coche `A1` sur un onglet CEX :

1. `MASTER_ON_EDIT` (installable; le simple `onEdit` est no-op depuis v4.15.112)
   route vers le handler du CEX (`BITPANDA_ON_EDIT` / `BINANCE_ON_EDIT` /
   `BITFINEX_ON_EDIT` / `BYBIT_ON_EDIT` / `COINBASE_ON_EDIT` / `OKX_ON_EDIT`).
2. Le handler decoche `A1`, ecrit `B1 = QUEUED: <ts> <kind>` et enqueue le job.
3. `CEX_MANUAL_REFRESH_WORKER` (one-shot ~1s plus tard) execute le job.
4. Succes : `B1` devient le timestamp final, rows reecrites au meme timestamp.
5. Transitoire (timeout Spreadsheets / quota / BUSY) : `B1 = RETRY n/2: ...`,
   requeue automatique, retry a +60s.
6. Erreur definitive : `B1` affiche le diagnostic (`ERROR: ...`).

Cellules de refresh groupe (batch enqueue) :

- `Action Rebalancing!Z1` -> jobs `TOP_MARKETCAP` + `BITPANDA_STOCKS_FIAT`
  (statut dans `AA1`).
- `Portefeuille Crypto!AC2` -> jobs `BITPANDA_CRYPTO` (crypto seul — pas de
  refresh `CEX - Bitpanda Fiat` depuis v4.15.115) + `BINANCE` + `BITFINEX` +
  `BYBIT` + `COINBASE` + `OKX` (statut dans `AD2`).

Verrous : chaque connecteur a son lock logique `CEX_ACQUIRE_LOCK(name)` /
`CEX_RELEASE_LOCK(name)` (lease ScriptProperties 90s). Ne PAS revenir au
`LockService.getScriptLock()` global : il est tenu par watchdog/pricing/cache et
rendait tous les `UPDATE_*_SPOT` BUSY en permanence.

Pourquoi cette architecture : l'ancien couple `B1=REQUEST` + poller 1 min
saturait les Executions (watchdog permanent + gros refresh dans MASTER_ON_EDIT
= 50-75s + double execution). La queue rend le clic instantane, l'execution
differree de ~1s, et le statut visible a chaque etape.

## Relais Railway `cex-relay`

Binance, Bybit, Coinbase et OKX passent par le relais Railway multi-CEX (region EU West) :

- Domaine : `https://cex-relay-production.up.railway.app`.
- Endpoints legacy Apps Script : `GET /binance?token=...`, `GET /bybit?token=...`, `GET /coinbase?token=...`, `GET /okx?token=...`.
- Endpoints web multi-user : `POST /binance/account`, `POST /bybit/account`, `POST /coinbase/account`, `POST /okx/account`.
- Endpoint pricing stocks web : `POST /stock/prices`.
- Secrets CEX cote Railway uniquement pour les endpoints legacy; GAS n'envoie que le `RELAY_TOKEN`. Les endpoints web multi-user recoivent les cles read-only de l'utilisateur depuis l'API web, jamais depuis le navigateur.
- Setup GAS : `SET_BINANCE_RELAY(url, token)`, `SET_BYBIT_RELAY(url, token)`, `SET_COINBASE_RELAY(url, token)`, `SET_OKX_RELAY(url, token)`. Coinbase/OKX retombent aussi sur le relais Bybit/Binance existant si configure.
- Source : `railway-relay/` (package `wcore-cex-relay`).

## Integration Portefeuille Crypto Details

L'onglet `Portefeuille Crypto Details` agrege wallets on-chain ET positions CEX.

- Colonne `E` (`Position :`) = libelle : `Ledger - X`, `Binance Web3 Wallet - X`
  (on-chain) ou `CEX - Bitpanda` / `CEX - Binance` / `CEX - Bitfinex` / `CEX - Bybit` / `CEX - Coinbase` / `CEX - OKX`.
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

### Connecteurs Coinbase / OKX

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
