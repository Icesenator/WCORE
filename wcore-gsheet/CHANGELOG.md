# GSheet Changelog

## 2026-07-13 — v4.15.159 : Portefeuille Action formatting sous filtre actif

- **Cause racine** : `REPAIR_STOCK_PORTFOLIO_FORMATS()` appliquait les formats avec `SpreadsheetApp.getRange(...).setNumberFormat(...)` pendant que le filtre de `Portefeuille Action` etait actif. Les lignes masquees par le filtre pouvaient conserver des formats bruts (`#,##0.00`, `0.00`) au lieu des formats visibles (`€`, `%`, alignements). Quand le filtre etait modifie, les lignes reapparaissaient avec une mise en forme non harmonieuse.
- **Second effet** : plusieurs regles de mise en forme conditionnelle s'arretaient a l'ancienne borne `1063`, alors que le filtre live couvre `A2:S5004`.
- **Fix permanent** : `REPAIR_STOCK_PORTFOLIO_FORMATS()` suspend maintenant le filtre actif, sauvegarde ses criteres, applique les formats sur toute la plage geree, et recrée le filtre avec ses criteres. `_stockPortfolioExtendConditionalFormats_()` etend les regles conditionnelles existantes jusqu'a la ligne cible.
- **Invariant** : `UPDATE_STOCK_PORTFOLIO()` ne repare pas implicitement le layout et ne touche pas aux formats pendant les refreshs normaux; seule la fonction de reparation explicite peut le faire.
- **Validation** : `tests/stock-portfolio-sheet-layout.test.js` couvre la suspension/recreation du filtre et l'extension des conditional formats. Verification live: formats homogenes sur `Portefeuille Action!A29:T40`, conditional formats etendus a `5004`, filtre restaure sur `A2:S5004`.

## 2026-07-01 — v4.15.107-114 : queue CEX one-shot (remplace le watchdog 1 min)

Refonte du refresh manuel CEX pour arrêter la saturation triggers/quota observée
sur la page Exécutions (workers concurrents, `MASTER_ON_EDIT` 50-75s, timeouts
`Service Spreadsheets`).

- **Queue one-shot** : cocher `A1` CEX / `Portefeuille Crypto!AC2` / `Action Rebalancing!Z1` n'exécute plus le refresh dans `MASTER_ON_EDIT`. Le handler décoche, écrit un statut visible `QUEUED: <ts> <kinds>` (B1 / AD2 / AA1) et pousse un job dans `CEX_MANUAL_JOB_QUEUE` (ScriptProperties). Un trigger one-shot `CEX_MANUAL_REFRESH_WORKER` (after 1s) dépile un job par run.
- **`BITPANDA_REFRESH_WATCHDOG` et watchdogs Binance/Bitfinex/Bybit → `LEGACY_DISABLED`** : plus aucun poller 1 min. L'auto-heal ne les installe plus et les supprime.
- **Locks par connecteur** : `CEX_ACQUIRE_LOCK(name)` / `CEX_RELEASE_LOCK(name)` (lease ScriptProperties 90s) remplacent le `LockService.getScriptLock()` global qui rendait tous les `UPDATE_*_SPOT` BUSY sous charge.
- **Lease worker (v4.15.114)** : `CEX_WORKER_LEASE` (TTL 5 min). `_cexEnsureManualWorkerTrigger_` ne supprime que les triggers *pending* — une instance déjà en cours ne peut pas être annulée. Observé 2026-07-01 : deux workers concurrents (177s + 58s) faisaient des read-modify-write concurrents sur la queue. Une instance excédentaire se replanifie à +60s et retourne `WORKER_BUSY`.
- **Batch enqueue (v4.15.114)** : `_cexEnqueueManualJobs_(jobs)` — 1 écriture queue + 1 statut par cellule + 1 seul ensure trigger pour N jobs. Avant : AC2 = 6× (`getProjectTriggers` + delete + create), d'où `MASTER_ON_EDIT` à 50-75s.
- **Retry transitoire (v4.15.114)** : `_cexIsTransientResult_` (`timed out`, `Service Spreadsheets`, `Service invoked too many times`, `internal error`, `BUSY`) → requeue automatique (max 2, `RETRY n/2: ...` visible) + worker replanifié à +60s pour laisser passer la fenêtre de saturation. Observé : `CEX - Bybit!B1 = ERROR Service Spreadsheets timed out` pendant que pricing worker + recovery sweep + double worker tenaient le document.
- **Cadence auto CEX 4h** : `CEX_HOURLY_REFRESH` passe de 1h/30min à `everyHours(4)` — dernier palier GAS sous le seuil stale watchdog `WD_STALE_I1_HOURS=5h` (GAS `everyHours` n'accepte que 1/2/4/6/8/12).
- **`onEdit` simple no-op (v4.15.112)** : seul l'installable `MASTER_ON_EDIT` traite les edits (le simple trigger timeoutait en doublon).
- **`WCORE_CEX_TRIGGER_CLEANUP_FORCE()` allégé** : supprime les anciens triggers CEX/watchdogs, réinstalle `MASTER_ON_EDIT` + `CEX_HOURLY_REFRESH(4h)`, sans lancer `WCORE_AUTO_HEAL` (timeoutait dans 17_LISTING).
- **`BaseEngine.cexBusyStatus`** : pendant un job CEX manuel (`CEX_MANUAL_ACTIVE_UNTIL_MS`), les `*_REFRESH_STATUS` on-chain retournent `[BUSY:CEX] <ts cache>` au lieu de lancer un live scan concurrent.
- **Tests de garde** : `tests/cex-refresh-load-guard.test.js` + `tests/action-rebalancing-direct-refresh.test.js` (queue, lease, batch, retry, cadence, watchdogs désactivés, onEdit no-op). `npm test` complet OK (2971 fonctions).
- **Post-push requis** : run `WCORE_CEX_TRIGGER_CLEANUP_FORCE()` une fois depuis l'éditeur pour basculer le trigger `CEX_HOURLY_REFRESH` existant vers 4h.
- **v4.15.115 — AC2 crypto only** : `Portefeuille Crypto!AC2` queue désormais `BITPANDA_CRYPTO` (bucket crypto seul, nouveau `UPDATE_BITPANDA_CRYPTO()`) au lieu de `BITPANDA_CRYPTO_FIAT` — pas besoin de rafraîchir `CEX - Bitpanda Fiat` depuis AC2. Le `A1` de `CEX - Bitpanda Crypto` garde crypto+fiat.
- **v4.15.116 — drain budget + statut lisible** : `CEX_MANUAL_REFRESH_WORKER` traite désormais toute la queue dans un budget de 3 min (au lieu d'1 job/run). Avec un one-shot GAS à granularité ~1 min, AC2 prenait 10-20 min avant — désormais 1-2 runs (~3-6 min). Statut `AD2`/`AA1` : `BINANCE OK: <ts>` au lieu du JSON brut.
- **v4.15.116 — anti-gel `[BUSY:CEX]`** : `_wd_needsRefresh_` reconnaît `[BUSY:CEX]` dans `I1` et re-pulse avec cooldown 10 min. Avant : I1 non parsable → `needsPulse:false` permanent → wallets gelés.
- **v4.15.117 — `B1` canonique restauré** : `_cexWriteManualJobStatus_` ré-écrit `B1` au timestamp de `D3` après succès. Évite les `B1 = RETRY 1/2` coincés quand le job avait en fait passé. `CEX_MANUAL_ACTIVE_UNTIL_MS` raccourcie à 90s (au lieu de 10 min) pour que les wallets on-chain reprennent leur scan vite.
- **v4.15.118 — trigger 1 min safety net** : `CEX_MANUAL_REFRESH_WORKER` est installé en **trigger récurrent `everyMinutes(1)`** par l'auto-heal, le cleanup force et le self-heal. Les one-shot `after(1s)` ratent silencieusement sous saturation. Drain fiable à 100%. Si la queue est vide, le trigger est un no-op (`NO_JOB`).
- **v4.15.118 — retry `WORKER_BUSY` à +15s + lease 2 min** : un worker excédentaire ne reste pas bloqué ; le lease expire en 2 min et le suivant reprend.

## 2026-06-29 — v4.15.104 : per-cell auto-link Portefeuille Crypto Details

- **Bridging watchdog-pulse gap** : `_setDetailsChainHyperlinks_` ne s'exécutait qu'aux pulses watchdog (5-30 min). Toute ligne ajoutée par le pipeline CEX ou ledger entre deux pulses restait sans lien (ex: `Ledger - Beam` ligne 341).
- **`_bpDetailsAutoLink_(e)` dans `17_LISTING.gs`** : sur chaque edit user de la colonne E de `Portefeuille Crypto Details`, set le RichTextValue avec le `gid` du sheet correspondant. Si le sheet n'existe pas, pose un RichTextValue sans lien.
- **Câblé dans `WCORE_ON_EDIT` (`16_REFRESH.gs`)** : appelé après les handlers CEX (`BITPANDA/BINANCE/BITFINEX/BYBIT/COINBASE/OKX_ON_EDIT`) et avant le check A1.
- **Effet** : tous les nouveaux onglets ajoutés (ou lignes ajoutées) sont auto-linkés dès qu'un user édite la cellule E correspondante, sans attendre un pulse watchdog.
- **Validation** : `validate:static` OK (2937 functions), bulk re-link via API Sheets pour 709 cellules de `Portefeuille Crypto Details!E:E` vers leurs `gid` respectifs (4 cellules non-linkées car valeurs `Node` / `Node - One Plus` qui ne matchent aucun onglet — comportement normal).

## 2026-06-29 — v4.15.103 : self-heal CEX time-based triggers (gotcha v4.15.61)

- **Cause racine** : après plusieurs `clasp push` rapprochés, les triggers time-based (`BITPANDA_REFRESH_WATCHDOG`, `BINANCE_REFRESH_WATCHDOG`, `BITFINEX_REFRESH_WATCHDOG`, `BYBIT_REFRESH_WATCHDOG`, `CEX_HOURLY_REFRESH`) tournent avec un OAuth token périmé. Le trigger est "présent" (count=1) mais ne peut plus s'exécuter avec les permissions complètes. `clasp run` indisponible (pas d'EXECUTION_API) → aucun moyen programmatique de run `WCORE_AUTO_HEAL_FORCE`.
- **Symptôme** : B1 des onglets CEX stuck à un ancien `REQUEST: <timestamp>`, données figées, click AC2/Z1 ne déclenche aucun refresh.
- **Fix permanent** : `_bpEnsureCexTriggers_()` dans `35_BITPANDA_SYNC.gs` qui **delete + recreate systématiquement** les 5 triggers CEX (count=1 ne suffit pas à prouver qu'un trigger est vivant — il faut capturer le fresh auth user).
- **Câblé dans les 4 onEdits CEX** : `BITPANDA_ON_EDIT`, `BINANCE_ON_EDIT`, `BITFINEX_ON_EDIT`, `BYBIT_ON_EDIT` appellent `_bpEnsureCexTriggers_()` après le check A1/AC2.
- **`BP_REINSTALL_CEX_TRIGGERS()` exposé** : fonction user-facing, runnable depuis l'editor Apps Script pour forcer un re-install (logique identique au self-heal).
- **Fix `CEX_HOURLY_REFRESH`** : GAS n'accepte pas `everyMinutes(60)` — GAS restrictions = `{1, 5, 10, 15, 30}`. Changé en `everyHours(1)` via la table `_BP_CEX_TRIGGERS_TO_HEAL` qui distingue `unit: "minutes"` vs `unit: "hours"`.
- **Effet** : un seul click sur n'importe quel A1 CEX (Bitpanda Crypto, Binance, Bitfinex, Bybit) ré-autorise automatiquement les 5 triggers CEX avec le fresh auth user. Plus de stuck watchdog permanent.
- **Validation** : `validate:static` OK (2936 → 2937 functions), push v4.15.103 OK, B1 `CEX - Bitpanda Crypto` repassé à `2026-06-29 20:43:10` après click AC2 (data `updated_at` = `20:43`).
- **Mode d'emploi** : si les triggers meurent à nouveau, soit click n'importe quel A1 CEX (self-heal auto), soit run `BP_REINSTALL_CEX_TRIGGERS` dans l'editor.

## 2026-06-29 — Renommage live `CEX - Bitpanda` → `CEX - Bitpanda Crypto` (Portefeuille Crypto Details)

- **Bug** : 136 cellules de `Portefeuille Crypto Details!E:E` portaient le libellé `CEX - Bitpanda` (sans suffixe). Or, le sheet CEX réel est `CEX - Bitpanda Crypto` (distingué de `CEX - Bitpanda Fiat`, `CEX - Bitpanda Stocks`, `CEX - Bitpanda Commodity`). La formule VLOOKUP colonne H (`=VLOOKUP(C2;'CEX - Bitpanda Crypto'!A:B;2;FALSE)`) résolvait par recherche exacte, donc `CEX - Bitpanda` (sans suffixe) retournait toujours une erreur ou 0.
- **Fix** : renommé live via Google Sheets API (batchUpdate avec 136 updateCells) : cellule exacte `CEX - Bitpanda` → `CEX - Bitpanda Crypto`. Liens hypertexte de la colonne E re-générés via `_setDetailsChainHyperlinks_`.
- **Note** : `CEX - Bitpanda Fiat` n'apparaît PAS dans `Portefeuille Crypto Details` par design (la fiat n'est pas un asset à tracker là-bas, normal).

## 2026-06-29 — v4.15.102 : re-fix auto-heal B1/J1 frozen

- **Cause** : le watchdog `BITPANDA_REFRESH_WATCHDOG` était lui-même mort avec OAuth stale (gotcha v4.15.61), donc le re-install auto-heal des triggers ledger ne pouvait plus se déclencher.
- **Fix** : await le self-heal via run `BP_REINSTALL_CEX_TRIGGERS` depuis l'editor Apps Script, suivi de `_ensureLedgerCache_(true)` pour re-lier toutes les cellules E de `Portefeuille Crypto Details`.
