# RPC harmonization wcore-gsheet ↔ wcore-web (2026-06-03)

> **Historical snapshot.** This audit reflects RPC state on 2026-06-03. Keep it for rationale and patterns, but verify current chain/RPC status from code and fresh probes before making changes.

Stratégie unique pour gérer la **couche RPC** des deux produits, adaptée à chaque contexte.

## Audit (2026-06-03)

Lancement de `scripts/audit-rpcs.mjs` sur les 170 chaînes EVM/SVM avec endpoints statiques (résultats : `C:/Users/strau/AppData/Local/Temp/opencode/rpc-audit.txt`).

| Catégorie | Count | Exemples |
|---|---|---|
| 100% dead (0 endpoint vivant) | 8 | CROSS_MAINNET, ETHO_PROTOCOL, HAVEN1, MOCA_CHAIN, POLYNOMIAL, RIVALZ, STACK, SURFLAYER |
| Single-RPC / mostly-dead (>= 50% KO) | 19 | AVES, BLAST, BOTANIX, CITREA, FANTOM, FOGO, FUSE, HORIZEN_EON, INTUITION, LAYERAI, MITOSIS, NEXI_CHAIN, NEXUS, ROOTSTOCK, STABLE, STORY, SYNDICATE_COMMONS, TARAXA, VANA |
| Half-dead (au moins 1 KO) | 54 | AIRDAO, ASTAR, AVALANCHE, BOB, BOBA, CELO, CORN, ETHEREUM_CLASSIC, FVM, HARMONY, etc. |

## Stratégie harmonisée

### Couches de défense (du plus rapide au plus profond)

| Couche | `wcore-gsheet` (Apps Script) | `wcore-web` (TypeScript) | Adaptation |
|---|---|---|---|
| **A. Statique** | `RPC.ENDPOINTS` dans `src/*.gs` | `RPC.ENDPOINTS` dans `packages/core/src/chains/*.ts` | Identique (chaîne de mirrors) |
| **B. Chainlist dynamique** | `UPDATE_DYNAMIC_RPCS` + warmup 25j | `loadChainlist()` boot + `refreshDynamicRpcEndpoints` (validé `eth_chainId`, TTL 6h) | Web : en plus on a `warmDynamicRpcEndpoints` au boot pour les chaînes GM |
| **C. Health per-endpoint** | `RPCAvalancheDetector` (escalade 2/4/6 fails → 30min/2h/6h) | `RpcHealth` (même escalade) + `RpcHealthTracker` (per-endpoint score, decay 60s) | Web plus fin : par-endpoint decay en plus de l'escalade globale |
| **D. Consensus strict** | `pickForConsensus` + `batchWithConsensus` (`votes*2 > total`) | `RpcDispatcher.run` (idem) | Identique |
| **E. Timeout** | `URL_FETCH_TIMEOUT_MS` (peu respecté par UrlFetchApp) | `RPC.TIMEOUTS.HTTP_MS` + `Promise.race` 90s/180s | Web : true timeout via AbortSignal, pas GAS |
| **F. Per-chain timeout** | `MAX_EXECUTION_MS` global | `SCAN_CHAIN_TIMEOUT_MS` 90s par chaîne + job TTL 30min | Web plus granulaire |
| **G. Cold-start probe** | Test `eth_blockNumber` au boot avant consensus | Probe paresseux dans `getRecentLogRange` + `warmDynamicRpcEndpoints` (GM seulement) | Web : pas de probe boot complet (coût), probe à la demande |
| **H. Snapshot fallback** | `OutputSnapshotCache` (10_OUTPUT) | `scan:result:*` Redis + `shouldCacheAssets` + `hasCachedValue` + `forceRefresh` | Web plus moderne (registry canonical key) |
| **I. Kill-switch chaîne** | Pas d'équivalent direct (suppression `.gs`) | `FLAGS.DISABLE_CHAIN=true` (web, 2026-06-03) | Web garde la config pour réactivation future |
| **J. Single-RPC warning** | Warning custom (1 RPC) | `warnSingleRpcChains` au boot (`server.ts:354`) | Identique |
| **K. UI / listage** | Recap Chain Sheets | Frontend `chainList` (web) | Web dynamique, Sheets scripté |

### Décisions

1. **Chaînes 100% mortes (8)** : ajout `FLAGS.DISABLE_CHAIN=true`. Le scan API les filtre via `validateChains` (sauf `WALLET_INCLUDE_DISABLED=1` pour debug). Config conservée pour réactivation future.
2. **Single-RPC (19) + half-dead (54)** : pas de kill-switch, le `rpcHealth` decay gère (un endpoint qui revient après 60s redevient éligible). Le `getHealthyEndpoints` retire les KO et rebascule sur la liste complète si le pool sain est < 2.
3. **Cold-start probe** : pas de portage du probe boot complet (coût 180+ HTTP au boot Railway non rentable). Le probe à la demande via `getRecentLogRange` est suffisant.
4. **OutputSnapshot** : déjà en place côté web via `scan:result:*` + `shouldCacheAssets`. Pas de port.
5. **Stratégie de réactivation chaîne** : retirer le flag `DISABLE_CHAIN` + bump `CACHE_VERSION` quand l'endpoint revient (audit mensuel via `scripts/audit-rpcs.mjs`).

## Fichiers modifiés (2026-06-03)

- `packages/core/src/rpc/chain-health.ts` (nouveau) — `classifyChainHealth` + `isChainDisabled`.
- `packages/core/src/rpc/chain-health.test.ts` (nouveau) — 4 tests `node:test`.
- `packages/core/src/rpc/index.ts` — export `chain-health`.
- `packages/core/src/rpc/endpoints.ts` — export `getStaticRpcEndpoints` (utilisé par chain-health).
- `apps/api/src/server-helpers.ts` — `validateChains` filtre `DISABLE_CHAIN=true` (sauf env debug).
- 8 chaînes × `FLAGS: { DISABLE_CHAIN: true }` : `CROSS_MAINNET`, `ETHO_PROTOCOL`, `HAVEN1`, `MOCA_CHAIN`, `POLYNOMIAL`, `RIVALZ`, `STACK`, `SURFLAYER`.
- `scripts/audit-rpcs.mjs` (nouveau) — probe boot de tous les RPCs statiques.

## Patterns wcore-web → wcore-gsheet (portables conceptuellement)

- **`Multicall3` batch** (déjà fait en v4.15.49 côté Apps Script) — pas de port nécessaire.
- **`scan:result:*` cache résultat** — Apps Script peut adopter le pattern via `OutputSnapshotCache` key explicite.
- **`forceRefresh` override** — Apps Script peut ajouter un trigger manuel pour invalider `OutputSnapshotCache`.
- **`FLAGS.DISABLE_CHAIN` pattern** — Apps Script peut l'adopter (ligne `if (chain.DISABLE_CHAIN) return null;` en tête des engines) avant de supprimer un `.gs` de façon destructive.

## Vérifications

- `pnpm --filter @wcore/core test` : 195/195 pass.
- `pnpm --filter @wcore/core typecheck` : OK.
- `pnpm --filter @wcore/api typecheck` : OK.
- `pnpm --filter @wcore/api build` : OK.
- Audit RPCs : 8/170 dead, 19 single, 54 half-dead.
