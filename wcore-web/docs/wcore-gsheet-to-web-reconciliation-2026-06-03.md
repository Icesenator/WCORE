# WCORE Final → WCORE Web reconciliation — 2026-06-03

Objectif : décider quoi porter de `C:\Users\strau\wcore-gsheet` vers `C:\Users\strau\wcore-web` après les améliorations Apps Script récentes.

## Résumé

Ne pas faire de merge automatique. `wcore-gsheet` est la source Apps Script/Sheets (`src/*.gs`) alors que `wcore-web` a un core TypeScript, Redis, API Fastify et frontend Next.js. Les changements doivent être portés par thème.

État observé :
- `wcore-gsheet` HEAD : `df2c370 v4.15.61: fix triggers running under stale OAuth auth`.
- Changements non commités dans `wcore-gsheet` : 15 fichiers (`01_INIT`, cache, output, engines EVM/SVM/Cosmos, refresh, diagnostics, dynamic RPC, suppression `MIND.gs`).
- `wcore-web` a déjà plusieurs équivalents modernes : Multicall3, Blockscout Pro discovery, Redis caches, `RpcHealthTracker`, `MAX_LOG_RANGE` sur EVM single/batch, GM fire-and-forget guards.

## Matrice de décision

| Sujet `wcore-gsheet` | Classification | Décision `wcore-web` | Notes |
|---|---|---|---|
| J1 latch self-healing (`16_REFRESH`, `16B_AUTO_HEAL`, `27_ACTIVITY_REFRESH`) | Sheets-only | Ne pas porter directement | Le web n'a pas A1/J1 ni triggers Sheets. Concept utile seulement comme inspiration anti stale UI/cache. |
| Trigger stale OAuth auth (`v4.15.61`) | Sheets-only | Ne pas porter | Problème Apps Script `openById`/trigger auth. Web utilise Railway/API, pas GAS triggers. |
| `OutputSnapshotCache` (`10_OUTPUT`, engines) | Partiellement portable | À analyser avant port | Web a Redis scan result cache et cache engine. Une feature équivalente pourrait être un fallback UI/API sur dernier résultat propre quand scan complet échoue, mais pas un copier-coller. |
| `shouldSkipRefreshForSameTrigger` / `last_refresh_trigger` | Partiellement portable | Backlog candidat | Côté web, pourrait devenir un guard anti double-scan/anti same request trigger. À traiter comme design dédié, pas port rapide. |
| RPC Blockscout fallback JSON-RPC proxy | Déjà partiellement couvert différemment | Vérifier gaps seulement | Web a Blockscout Pro token discovery (`explorer-discovery.ts`), pas nécessairement JSON-RPC proxy fallback. Si un jour on ajoute proxy JSON-RPC, sonder via `eth_blockNumber`, pas seulement `eth_chainId`. |
| Cold-start RPC probe (`eth_blockNumber`) | Portable | Backlog candidat | Web a `RpcHealthTracker`, `RpcClient.blockNumber`, dispatcher. À vérifier : élimine-t-on les RPC morts avant consensus quand aucune health data n'existe ? |
| Busy-guard RPC | Portable | Backlog candidat | À comparer avec `RpcHealthTracker`, circuit breaker, per-chain timeout. |
| Multicall3 transport (`v4.15.49`) | Déjà porté | Aucun port nécessaire | Web utilise `packages/core/src/rpc/multicall.ts`, `evm-scan.ts`, `evm-batch.ts`. |
| `STRICT_TOKEN_RANGE` I2:I whitelist | Sheets-only / différent | Ne pas porter tel quel | Web n'a pas `I2:I`. L'équivalent serait custom token selection/scope, déjà géré différemment. |
| Suppression `MIND.gs` | À vérifier, dangereux | Ne pas supprimer web sans audit | Test rapide : `https://228.rpc.thirdweb.com` répond `eth_chainId=0xe4`. `MIND.ts` reste valide côté web tant qu'un RPC mainnet vit. |
| Suppression `REDSTONE/ZERO` historique dans Apps Script | À vérifier, dangereux | Ne pas supprimer web sans audit | Web utilise ZERO/REDSTONE dans scan/GM/UI. Toute suppression chaîne web doit vérifier RPC, explorer, registry, GM, UI. |
| Dashboard/diagnostics Sheets (`21_DASHBOARD`, `13_DIAGNOSTIC`) | Sheets-only | Ne pas porter | Web a ses propres métriques/API. |
| Version bumps Apps Script (`WCORE_VERSION`, module versions) | Sheets-only | Ne pas porter | Web version source = `ROADMAP.md`/`CHANGELOG.md`. |

## Actions recommandées

1. Ne pas exécuter `tools/migrate/extract-chains.mjs` depuis `wcore-web` sans les `.gs` amont stabilisés.
2. Créer un audit ciblé “RPC resilience parity” côté web :
   - cold-start probe avant consensus quand aucune health data ;
   - busy-guard ou pondération d'endpoints ;
   - comportement des Blockscout JSON-RPC proxies si ajoutés.
3. Créer un audit ciblé “Output snapshot equivalent” côté web : dernier résultat propre Redis/UI quand un scan échoue totalement.
4. Garder `MIND`, `ZERO`, `REDSTONE` côté web tant qu'un audit RPC/usage ne prouve pas qu'ils doivent être retirés.
5. Documenter dans `AGENTS.md` que les changements Apps Script récents doivent être triés par thème et non mergés automatiquement.

## Vérifications déjà faites

- `MIND` RPCs testés rapidement : `https://228.rpc.thirdweb.com` répond `0xe4`.
- Recherche web : Multicall3, Blockscout discovery, Redis cache, `RpcHealthTracker` et `MAX_LOG_RANGE` existent déjà côté `wcore-web`.

## Audit code web (2026-06-03) — RPC resilience + OutputSnapshot parity

### RPC resilience parity
- `apps/api/src/server.ts` logge déjà les chaînes EVM/SVM avec `< 2 RPC` au boot (`warnSingleRpcChains`).
- `apps/api/src/gamification/index.ts` warmup les RPCs GM via `warmDynamicRpcEndpoints` au démarrage.
- `loadChainlist()` est appelé au boot et peuple le cache chainlist (chainlist.org) ; `refreshDynamicRpcEndpoints()` valide via `eth_chainId` + valide `https://`, et alimente le cache dynamique (TTL 6h).
- `packages/core/src/rpc/rpc-health.ts` (per-endpoint score, decay) et `packages/core/src/rpc/health.ts` (escalade 2/4/6 fails → 30min/2h/6h) sont déjà en place.
- `packages/core/src/rpc/dispatcher.ts` applique le consensus strict et appelle `health.recordSuccess/recordFailure` à chaque tentative.
- `packages/core/src/engines/evm-balances.ts` lit `eth_blockNumber` via consensus pour la log range (déjà un cold-start probe par chaîne, à la demande).
- `apps/api/src/plugins/scan.ts` a un per-chain timeout 90s, des guards job 10min/3×timeout/30min, et le `circuit_open` est surfacé en `ChainScan` complet.
- **Conclusion** : pas de port code à pousser. Le pattern Apps Script `cold-start probe` est déjà représenté par `loadChainlist()` + `warmDynamicRpcEndpoints()` au boot API et par le probe `eth_blockNumber` à la demande dans `getRecentLogRange`. Un probe boot complet sur 180+ chaînes ajouterait ~180 HTTP calls au démarrage Railway ; pas recommandé.

### OutputSnapshotCache equivalent
- Le cache résultat scan `apps/api/src/plugins/scan.ts` utilise `scan:result:{address}:{chain}` via la cache-key registry (TTL serveur).
- `getScanResultCacheKey` (`apps/api/src/plugins/scan-utils.ts`) délègue à `cacheKey("scanResult", ...)`.
- `shouldCacheAssets` (l.67) refuse d'écrire les scans partiels/avec erreurs bloquantes : `balances fetch:`, `balances HTTP`, `native balance failed on all`, `token accounts: no data`, balance native positive sans prix.
- `hasCachedValue` (l.39) refuse de servir un cache vide/erroné et force un re-scan propre.
- Le cache résultat `scan:result:*` peut être bypassé par `forceRefresh`. Vérifié le 2026-06-11 (cf. `docs/AUDIT.md` §2) : `forceRefresh` EST propagé aux engines (`scan.ts:116,315,394,513`). L'ancien P0 « propagation non garantie » est clos.
- Le cache navigateur portfolio est désactivé; les fixes scan se vérifient côté API/Redis, pas via `WALLET_SCAN_CACHE_VERSION`.
- **Conclusion** : pas de port code à pousser pour l'OutputSnapshot Apps Script lui-même. L'équivalent `scan:result:*` côté web est déjà implémenté et plus moderne (clé registry, conditions d'écriture strictes).

## Prochaines actions concrètes

- **Backlog candidat** : à ce stade, aucun port `wcore-gsheet` → `wcore-web` n'est requis. La réconciliation est purement documentaire. Les sujets restants sont déjà couverts ou n'apporteraient pas de gain mesurable (coût HTTP au boot, complexité).
- **Chaînes** : conserver `MIND`, `ZERO`, `REDSTONE` côté web tant qu'aucun audit dédié ne démontre la nécessité d'une suppression. `wcore-gsheet` peut retirer des `.gs` pour d'autres raisons (coût Apps Script, version cible Sheets) qui ne s'appliquent pas au web.
- **À surveiller** : si un jour le `cold-start probe` boot devient utile (ex : passer en serverless spammé), le pattern existe déjà dans `loadChainlist()` + `refreshDynamicRpcEndpoints()`. Si l'on veut exposer un endpoint `/api/metrics/rpc-health`, l'info est dans `rpcHealth.getScore(chain, endpoint)`.
