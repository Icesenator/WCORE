# Plan de split des hotspots WCORE

Généré post-audit v4.15.13. **Ne pas exécuter sans validation user.**

## Hotspots identifiés

| Fichier | Lignes | KB | Raison |
|---|---|---|---|
| `09_BUDGET.gs` | 1067 | 155.7 | 10 namespaces imbriqués + configs verbeuses |
| `13_DIAGNOSTIC.gs` | 2015 | 105.1 | Diag généraliste pas encore splitté |
| `27_ACTIVITY_REFRESH.gs` | 2020 | 65.2 | 4 clusters indépendants |

## Finding collatéral

**`BUDGET_VERSION = "4.12.13"`** dans `09_BUDGET.gs:31` — stale depuis 26+ versions. À bumper à v4.15.13 au prochain patch (peut être fait sans split).

## Proposition de split

### 09_BUDGET.gs → 09A/09B/09C
- `09A_BUDGET_CONFIG.gs` : `ExecutionPhase`, `BudgetProfiles` (config stable)
- `09B_BUDGET_TRACKING.gs` : `ChainExecStats`, `BudgetStats`, `ChainBudgetStats`, `BudgetTracker`
- `09C_BUDGET_CONTROL.gs` : `DynamicBudget`, `AdaptiveThrottle`, `RotationManager`, `CLEAR_BUDGET_CACHE`

### 13_DIAGNOSTIC.gs → 13D/13E
Déjà partiellement splitté (13A, 13B, 13C). Reste :
- `13D_DIAG_PROPERTIES.gs` : `LIST_SCRIPT_PROPERTIES_KEYS`, `LIST_COSMOS_CACHE_KEYS`
- `13E_DIAG_SHEETCACHE.gs` : `DIAG_SHEETCACHE_*`, `DIAG_SNAPSHOT`, `DIAG_CHAIN_EXEC_STATS`
- `13F_DIAG_DECIMALS.gs` : `DIAG_DECIMALS`, `REPAIR_DECIMALS`, `DIAG_BALANCE_TIMESTAMPS`, `GET_SYSTEM_HEALTH`

### 27_ACTIVITY_REFRESH.gs → 27A/27B/27C/27D
- `27A_ACTIVITY_CONFIG.gs` : `ACTIVITY_CONFIG`, `calculateRefreshInterval` (dead helper)
- `27B_NONCE_FETCHERS.gs` : `fetchEvmNonce*`, `fetchSvmSignatureBatch`, `fetchCosmosSequenceBatch`
- `27C_RPC_LOOKUP.gs` : `BUILD_RPC_LOOKUP`, `SHOW_RPC_LOOKUP`, `INIT_ALL_NONCES`
- `27D_ACTIVITY_WATCHDOG.gs` : `ACTIVITY_REFRESH_STATUS`, `TEST_NONCE_FETCH`, `ACTIVITY_WATCHDOG`, triggers install/uninstall

## Contraintes

1. **Ordre alphabétique de chargement GAS** : 09A → 09B → 09C préserve l'ordre attendu (09A avant 09_SIMPLE_ROTATION).
2. **IIFEs et top-level assignments** : si les objets s'initialisent à partir d'autres au moment du chargement, splitter peut casser la séquence. À vérifier dépendances par module.
3. **Pas de closure partagée** entre fichiers GAS — chaque fichier recrée son scope global.
4. **Références croisées** : si `DynamicBudget` utilise `BudgetProfiles.NORMAL`, 09C référencie 09A → OK car 09A chargé avant.

## Coût-bénéfice

| Aspect | Verdict |
|---|---|
| Lisibilité | +++ pour 27_, ++ pour 13_, + pour 09_ |
| Risque régression | Moyen (ordre chargement, faux split sur IIFE) |
| Effort | 1-2h par fichier (extraction + safe-push + test live) |
| Gain runtime | Zéro (chargement GAS identique) |

## Recommandation

Commencer par **27_ACTIVITY_REFRESH.gs** car le plus indépendant (4 clusters sans dépendance interne entre eux). Ensuite 13_ (déjà en partie splitté, extension naturelle). **Éviter 09_BUDGET.gs** sans test exhaustif : les namespaces s'entrelacent.

**Bump `BUDGET_VERSION` 4.12.13 → 4.15.13** sans attendre le split (patch trivial).
