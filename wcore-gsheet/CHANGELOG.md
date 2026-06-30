# GSheet Changelog

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
