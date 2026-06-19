# RPC Resilience — Design (2026-05-30)

## Contexte

Trois incidents récents ont révélé des faiblesses systémiques dans la sélection et la
résilience RPC, indépendantes des chaînes concernées :

1. **CORN** — 4 RPCs configurés, 3 morts (403/404), le RPC sain en 4e position
   n'était jamais sélectionné. Cause : au cold-start, `RpcHealth.isHealthy()` retourne
   `true` pour tout RPC inconnu, donc `pickForConsensus` prenait les 3 premiers (cassés)
   et ignorait le 4e (sain).
2. **CAMP** — aucun RPC public fonctionnel. Seul `camp.cloud.blockscout.com/api/eth-rpc`
   (proxy JSON-RPC de l'explorer Blockscout) répond. Aucun champ explorer dans la config.
3. **METAL_L2** — `#ERROR!` intermittent sur `METAL_L2_REFRESH_STATUS`. La chaîne est saine
   (2 RPCs OK, exec 4,2s). Le `#ERROR!` vient du timeout 30s GAS sous saturation de la
   queue @customfunction (UrlFetchApp n'a pas de timeout fonctionnel dans GAS).

Ces trois cas pointent vers la même classe de problème : des RPCs lents/morts qui bloquent
`UrlFetchApp` et, sous charge, cascadent en timeouts → cellules `#ERROR!` ou
`NO_CACHE_WAITING_REFRESH`.

## Principes

- Code **harmonieux et universel** : aucun hack chain-specific. Le hack existant dans
  `RACE.gs` (`_RACE_blockscoutNativeFallback_`, ~90 lignes) sera supprimé au profit du
  système générique.
- Ne jamais écraser du cache valide. Les garde-fous retournent le cache existant, pas des zéros.
- Pas d'augmentation de l'empreinte mémoire ScriptProperties.
- Coût HTTP additionnel borné (sondes uniquement au cold-start, une fois par exécution).

## Section 1 — Fallback Blockscout (`/api/eth-rpc`)

### Découverte contraignante

- CAMP, CORN, METAL_L2 n'ont **aucun** champ explorer dans leur config.
- Seul RACE a `ACTIVITY_EXPLORER: { TYPE: "blockscout", BASE_URL: "https://racescan.io", ... }`.
- Tous les proxies Blockscout ne se valent pas :
  - `camp.cloud.blockscout.com/api/eth-rpc` → supporte `eth_chainId` + tout.
  - `racescan.io/api/eth-rpc` → supporte `eth_getBalance`, `eth_blockNumber`,
    `eth_getTransactionCount` mais **PAS `eth_chainId`** (retourne `result: null`).

### Design

Helper `_deriveBlockscoutRpc(config)` dans `05_RPC.gs` :

1. **Override explicite** — si `config.RPC.BLOCKSCOUT_RPC` est défini, le retourner tel quel.
2. **Auto-dérivation** — sinon, si `config.ACTIVITY_EXPLORER` existe avec
   `TYPE === "blockscout"` et `BASE_URL`, dériver `{BASE_URL}/api/eth-rpc`
   (en retirant un éventuel `/` final de `BASE_URL`).
3. Sinon retourner `null`.

Intégration dans `_getDynamicRpcsMerged(hardcodedEndpoints, config)` (`33_DYNAMIC_RPC.gs`) :

- Après le tri `[fresh, stale, blocked]`, appeler `_deriveBlockscoutRpc(config)`.
- Si un RPC Blockscout est dérivé et n'est pas déjà dans la liste, l'ajouter **en toute
  fin** (après les `blocked`) — c'est le filet de dernier recours, jamais prioritaire sur
  un vrai RPC sain.

Config concernée immédiatement :
- `CAMP.gs` — ajouter `RPC.BLOCKSCOUT_RPC: "https://camp.cloud.blockscout.com/api/eth-rpc"`
  (déjà mis en `ENDPOINTS` actuellement ; on le déplace en `BLOCKSCOUT_RPC` pour la sémantique).
- `RACE.gs` — couvert par auto-dérivation via `ACTIVITY_EXPLORER.BASE_URL`.

### Contrainte `eth_chainId`

Le health-check (`DIAG_*_RPC_HEALTH`, `13_DIAGNOSTIC.gs`) et la sonde cold-start (Section 2)
ne doivent **pas** dépendre uniquement de `eth_chainId`. Un RPC qui répond `result: null` à
`eth_chainId` mais sert correctement `eth_getBalance` (cas racescan) doit être considéré
**vivant**. Utiliser `eth_blockNumber` comme sonde de vie principale.

### Suppression du hack RACE

Supprimer de `RACE.gs` :
- `_RACE_blockscoutNativeFallback_`, `_RACE_shouldFallback_`, `_RACE_displayName_`
- Les wrappers custom `GET_WALLET_ASSETS_RACE` / `RACE_REFRESH_STATUS` qui appellent le hack
- `DIAG_RACE_BLOCKSCOUT_NATIVE`

Remplacer par les wrappers standards ChainFactory (comme les autres chaînes). RACE garde son
`ACTIVITY_EXPLORER` qui sert désormais à l'auto-dérivation du RPC Blockscout.

## Section 2 — Cold-start probe RPC

### Cause racine

`RpcHealth.isHealthy(rpc)` (`05_RPC.gs:264`) retourne `true` si l'état est inconnu
(`!h || !h.blocked`). Au premier scan d'une chaîne (aucun health data), tous les RPCs
paraissent sains. `pickForConsensus` prend alors les `count` (3) premiers dans l'ordre de
la config — donc les RPCs morts s'ils sont listés en premier.

### Design

Dans `BalanceFetcher._getNativeParallel` (`08_ASSETS.gs`) :

1. Après `RpcSelector.pickForConsensus(...)`, détecter le cas cold-start : **aucun** des
   candidats n'a d'entrée dans `RpcHealth._state`.
2. Si cold-start ET plus de RPCs disponibles que `count`, lancer une sonde parallèle
   `eth_blockNumber` (via `Http.fetchAllSafe`) sur **tous** les candidats.
3. Pour chaque réponse : HTTP non-200, JSON `error`, `result` absent, ou exception →
   `RpcHealth.recordFailure(rpc, config)`. Réponse valide → `RpcHealth.recordSuccess(rpc)`.
4. Re-sélectionner via `pickForConsensus` (les morts sont maintenant `blocked`).
5. Sonde exécutée **au plus une fois par exécution** (flag `_coldProbeDone` par chaîne).

### Garde-fous

- Skip la sonde si `timer.remaining() < seuil` (sous pression temps, on ne sonde pas).
- Skip si circuit breaker quota actif.
- La sonde réutilise le budget HTTP parallèle existant — pas d'appels séquentiels.

## Section 3 — REFRESH_STATUS résilient (anti-`#ERROR!`)

### Cause racine

`#ERROR!` = la fonction `*_REFRESH_STATUS` a été **tuée par GAS** (timeout 30s), pas une
exception interne (celles-ci retournent `[ERROR] msg` en texte, gérées
`11_EVM_ENGINE.gs:1706`). Survient sous saturation de la queue @customfunction :
beaucoup de `REFRESH_STATUS` simultanés + UrlFetchApp sans timeout fonctionnel.

### Design

Busy-guard en tête de `getRefreshStatus` (EVM/SVM/Cosmos), même pattern que `quotaPreCheck` :

1. Évaluer une condition « système sous charge » via `BaseEngine.isBusy(config)` (nouveau) :
   - circuit breaker quota proche du seuil (HTTP du jour > X% du plafond), ou
   - DegradedMode actif.
2. Si occupé ET non-forceFull → retourner immédiatement `[BUSY] <timestamp cache existant>`
   (via `WalletCache.load` + `Format.datetime`), sans lancer le scan.
3. `forceFull=TRUE` bypasse le busy-guard (l'utilisateur veut explicitement un scan frais).

`[BUSY]` est traité comme un état transitoire bénin (comme `[BLOCKED:QUOTA]`) : la cellule
A1 (`CACHED_WALLET_ASSETS`) continue d'afficher le dernier cache, le prochain cycle WATCHDOG
relance le scan quand la charge retombe.

### Non-objectif

On ne peut pas garantir zéro `#ERROR!` (GAS peut tuer une fonction pour d'autres raisons),
mais on supprime le cas dominant : scan lancé alors que le système n'a pas le budget pour
finir sous 30s.

## Fichiers touchés

| Fichier | Changement |
|---------|-----------|
| `05_RPC.gs` | `_deriveBlockscoutRpc()` ; sonde cold-start utilise `eth_blockNumber` |
| `33_DYNAMIC_RPC.gs` | injection RPC Blockscout en fin de `_getDynamicRpcsMerged` |
| `08_ASSETS.gs` | sonde cold-start dans `_getNativeParallel` |
| `10A_BASE_ENGINE.gs` | `BaseEngine.isBusy()` |
| `11_EVM_ENGINE.gs` | busy-guard dans `getRefreshStatus` |
| `14_SVM_ENGINE.gs` | busy-guard dans `getRefreshStatus` |
| `15_COSMOS_ENGINE.gs` | busy-guard dans `getRefreshStatus` |
| `13_DIAGNOSTIC.gs` | health-check : accepter `eth_blockNumber` / `result:null` sur chainId |
| `CAMP.gs` | `RPC.BLOCKSCOUT_RPC` au lieu de `ENDPOINTS` Blockscout |
| `RACE.gs` | suppression du hack, wrappers standards |

## Stratégie de test

Comme il n'y a pas de framework de test unitaire GAS, validation par `clasp run` :

1. **CORN cold-start** — `CLEAR_DYNAMIC_RPCS` + vider RpcHealth, puis
   `GET_WALLET_ASSETS_CORN` : doit utiliser `maizenet-rpc.usecorn.com` et retourner la balance.
2. **CAMP Blockscout** — `GET_WALLET_ASSETS_CAMP` : `INFO_HTTP hosts` doit montrer
   `camp.cloud.blockscout.com`, balance 6.79 CAMP.
3. **RACE migration** — `GET_WALLET_ASSETS_RACE` : doit fonctionner via auto-dérivation,
   balance cohérente avec l'ancien hack.
4. **METAL_L2 busy-guard** — simuler charge (DegradedMode actif) puis
   `METAL_L2_REFRESH_STATUS` : doit retourner `[BUSY] <ts>` au lieu de risquer le timeout.
5. **Non-régression** — `WCORE_HEALTH`, et `GET_WALLET_ASSETS_BASE` (chaîne saine multi-RPC)
   doit toujours faire consensus normal sans sonde superflue.

## Versioning

Bump `WCORE_VERSION` à v4.15.50 (01_INIT.gs) + versions modules touchés.
