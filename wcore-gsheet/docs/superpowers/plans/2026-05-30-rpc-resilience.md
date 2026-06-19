# RPC Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre la sélection RPC résiliente — fallback Blockscout universel, élimination des RPCs morts au cold-start, et garde-fou anti-`#ERROR!` dans REFRESH_STATUS.

**Architecture:** Trois changements indépendants dans le cœur RPC. (1) Un helper `_deriveBlockscoutRpc()` injecte un proxy JSON-RPC Blockscout en dernier recours dans la liste mergée. (2) Une sonde `eth_blockNumber` parallèle au cold-start élimine les RPCs morts avant la sélection consensus. (3) Un busy-guard dans `getRefreshStatus` retourne `[BUSY]` + cache existant quand le système est sous charge, au lieu de risquer le timeout 30s GAS.

**Tech Stack:** Google Apps Script (.gs), ChainFactory pattern, déploiement via `clasp push`. Validation par `clasp run` (pas de framework de test unitaire).

**Note OAuth (procédure de déploiement) :** `clasp push` nécessite le token client clasp (scope `script.projects`), `clasp run` nécessite le token wcore-mcp (scope `script.scriptapp`). Basculer via `node scripts/clasp-login-full.js` (push) puis `node scripts/oauth-auto.js` (run). Voir AGENTS.md.

---

## Task 1: Helper `_deriveBlockscoutRpc()` dans 05_RPC.gs

**Files:**
- Modify: `src/05_RPC.gs` (ajout d'un helper standalone après l'objet `RpcSelector`, avant `RpcClient` ~ligne 558)

- [ ] **Step 1: Ajouter le helper**

Insérer après la fermeture de `RpcSelector` (`};` ligne 557), avant le commentaire `// RPC CLIENT` :

```javascript
// ============================================================
// BLOCKSCOUT RPC FALLBACK (v4.15.50)
// Derives a JSON-RPC proxy URL from a Blockscout explorer.
// Used as last-resort RPC for chains with no working public RPC.
// ============================================================

/**
 * Returns a Blockscout JSON-RPC proxy URL for the chain, or null.
 * Priority:
 *   1. config.RPC.BLOCKSCOUT_RPC (explicit override) — returned as-is.
 *   2. config.ACTIVITY_EXPLORER with TYPE "blockscout" + BASE_URL — derives {BASE_URL}/api/eth-rpc.
 */
function _deriveBlockscoutRpc(config) {
  try {
    if (config && config.RPC && config.RPC.BLOCKSCOUT_RPC) {
      return String(config.RPC.BLOCKSCOUT_RPC).trim();
    }
    var exp = config && config.ACTIVITY_EXPLORER;
    if (exp && String(exp.TYPE || "").toLowerCase() === "blockscout" && exp.BASE_URL) {
      var base = String(exp.BASE_URL).trim().replace(/\/+$/, "");
      if (base) return base + "/api/eth-rpc";
    }
  } catch (e) {}
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/05_RPC.gs
git commit -m "feat(rpc): add _deriveBlockscoutRpc helper (v4.15.50)"
```

---

## Task 2: Injecter le RPC Blockscout en fin de liste mergée (33_DYNAMIC_RPC.gs)

**Files:**
- Modify: `src/33_DYNAMIC_RPC.gs:927` (fonction `_getDynamicRpcsMerged`, juste avant `var result = fresh.concat(stale).concat(blocked);`)

- [ ] **Step 1: Modifier la construction du résultat**

Remplacer la ligne 927 :

```javascript
  var result = fresh.concat(stale).concat(blocked);
```

par :

```javascript
  var result = fresh.concat(stale).concat(blocked);

  // v4.15.50: Append Blockscout JSON-RPC proxy as last-resort fallback.
  // Never prioritized over a real healthy RPC (added after blocked).
  if (typeof _deriveBlockscoutRpc === "function") {
    var bsRpc = _deriveBlockscoutRpc(config);
    if (bsRpc && !seen[bsRpc]) { result.push(bsRpc); seen[bsRpc] = true; }
  }
```

- [ ] **Step 2: Vérifier la branche early-return cold/empty**

`_getDynamicRpcsMerged` a un early-return ligne 879-882 quand `dynamicRpcs` est vide :

```javascript
  if (!dynamicRpcs || !dynamicRpcs.length) {
    _dynMergeCache[chainId] = hardcodedEndpoints || [];
    return _dynMergeCache[chainId];
  }
```

Remplacer ce bloc par :

```javascript
  if (!dynamicRpcs || !dynamicRpcs.length) {
    var baseList = (hardcodedEndpoints || []).slice();
    // v4.15.50: ensure Blockscout fallback is appended even when no dynamic RPCs
    if (typeof _deriveBlockscoutRpc === "function") {
      var bsRpc0 = _deriveBlockscoutRpc(config);
      if (bsRpc0 && baseList.indexOf(bsRpc0) < 0) baseList.push(bsRpc0);
    }
    _dynMergeCache[chainId] = baseList;
    return _dynMergeCache[chainId];
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/33_DYNAMIC_RPC.gs
git commit -m "feat(rpc): inject Blockscout fallback in merged RPC list (v4.15.50)"
```

---

## Task 3: Migrer CAMP vers BLOCKSCOUT_RPC

**Files:**
- Modify: `src/CAMP.gs:8`

- [ ] **Step 1: Déplacer le RPC Blockscout dans BLOCKSCOUT_RPC**

Remplacer la ligne 8 :

```javascript
  RPC: { ENDPOINTS: ["https://camp.cloud.blockscout.com/api/eth-rpc"] }, // Blockscout RPC proxy (v4.15.49 fix)
```

par :

```javascript
  RPC: { ENDPOINTS: [], BLOCKSCOUT_RPC: "https://camp.cloud.blockscout.com/api/eth-rpc" }, // pas de RPC public; Blockscout en fallback (v4.15.50)
```

- [ ] **Step 2: Commit**

```bash
git add src/CAMP.gs
git commit -m "refactor(camp): use BLOCKSCOUT_RPC field instead of ENDPOINTS (v4.15.50)"
```

---

## Task 4: Supprimer le hack chain-specific de RACE.gs

**Files:**
- Modify: `src/RACE.gs` (réécriture complète)

- [ ] **Step 1: Réécrire RACE.gs sans le hack**

Remplacer tout le contenu de `src/RACE.gs` par :

```javascript
/**
 * RACE.gs - RACE (v4.15.50)
 * ChainFactory pattern with explicit function declarations.
 * v4.15.50 - Removed chain-specific Blockscout hack; now uses the generic
 *            Blockscout RPC fallback derived from ACTIVITY_EXPLORER.BASE_URL.
 */

var _RACE = ChainFactory.createEvmChain("RACE", {
 CACHE_VERSION: 63,
 RPC: { ENDPOINTS: ["https://racemainnet.io", "https://6805.rpc.thirdweb.com"] },
 ACTIVITY_EXPLORER: { TYPE: "blockscout", BASE_URL: "https://racescan.io", TX_PATH: "/api/v2/addresses/{address}/transactions" },
 CHAIN: {
 NAME: "RACE",
 CHAIN_ID: 6805,
 NATIVE_SYMBOL: "ETH",
 NATIVE_NAME: "Ether",
 NATIVE_DECIMALS: 18,
 NATIVE_LLAMA_ID: "coingecko:ethereum",
 NATIVE_GECKO_ID: "ethereum",
 DEX_SLUG: "race",
 GT_NETWORK: "race"
 },
 LLAMA_ID_MAP: { "ETH":"coingecko:ethereum" }
});

// Main functions
function GET_WALLET_ASSETS_RACE(a,r,t,f,g){return _RACE.getWalletAssets(a,r,t,f,g);}
function CACHED_WALLET_ASSETS_RACE(a){return _RACE.getCachedWalletAssets(a);}
function RACE_REFRESH_STATUS(a,r,t,f,g){return _RACE.getRefreshStatus(a,r,t,f,g);}
function RACE_STATS(a,t){return _RACE.getStats(a,t);}

// Diagnostic functions
function DIAG_RACE_TOKEN(w,t,r){return _RACE.diag.tokenBalance(w,t,r);}
function DIAG_RACE_COMPARE_RPCS(w,t){return _RACE.diag.compareRpcs(w,t);}
function DIAG_RACE_CHECK_ERC20(t){return _RACE.diag.checkErc20(t);}
function DIAG_RACE_RPC_HEALTH(){return _RACE.diag.rpcHealth();}
function DIAG_RACE_NATIVE_BALANCE(w){return _RACE.diag.nativeBalance(w);}
function DIAG_RACE_CACHE(w){return _RACE.diag.cacheInspect(w);}
function DIAG_RACE_CACHE_TOKEN(w,t){return _RACE.diag.cacheFindToken(w,t);}
function DIAG_RACE_CACHE_ASSETS(w){return _RACE.diag.cacheListAssets(w);}
function DIAG_RACE_TOKEN_PRICE(t){return _RACE.diag.tokenPrice(t);}
function DIAG_RACE_NATIVE_PRICE(){return _RACE.diag.nativePrice();}
function DIAG_RACE_WALLET(w){return _RACE.diag.walletFull(w);}
function DIAG_RACE_CACHE_STATS(){return _RACE.diag.cacheStats();}
function DIAG_RACE_CLEAR_CACHE(w,c){return _RACE.diag.clearCache(w,c);}
```

- [ ] **Step 2: Vérifier qu'aucune autre référence aux fonctions supprimées n'existe**

Run (Grep tool): chercher `_RACE_blockscoutNativeFallback_|_RACE_shouldFallback_|_RACE_displayName_|DIAG_RACE_BLOCKSCOUT_NATIVE` dans `src/`.
Expected: aucune correspondance hors `docs/`. Si une référence existe ailleurs, la corriger avant commit.

- [ ] **Step 3: Commit**

```bash
git add src/RACE.gs
git commit -m "refactor(race): remove chain-specific Blockscout hack, use generic fallback (v4.15.50)"
```

---

## Task 5: Sonde cold-start RPC dans 08_ASSETS.gs

**Files:**
- Modify: `src/08_ASSETS.gs` (ajout d'un helper `_coldStartProbe` dans `BalanceFetcher` + appel dans `_getNativeParallel`)

- [ ] **Step 1: Ajouter le helper de sonde**

Insérer dans l'objet `BalanceFetcher`, juste avant `_getNativeParallel: function(...)` (ligne 322) :

```javascript
  /**
   * v4.15.50: Cold-start RPC probe.
   * When NO candidate RPC has health data yet, all appear "healthy" and
   * pickForConsensus may pick dead RPCs listed first, ignoring a working one
   * further down. Probe all candidates in parallel with eth_blockNumber
   * (NOT eth_chainId — some Blockscout proxies return null for chainId) and
   * mark dead ones as failed so the next pickForConsensus excludes them.
   * Runs at most once per execution per chain.
   */
  _coldProbeFlag: {},

  _coldStartProbeIfNeeded: function(userRpc, config, timer) {
    try {
      var chainId = (config && config.CHAIN && config.CHAIN.CHAIN_ID) || 0;
      if (this._coldProbeFlag[chainId]) return;

      // Skip under time/quota pressure
      if (timer && timer.remaining() < 6000) return;
      if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return;

      // Gather ALL candidates (request a large count to see the full list)
      var candidates = RpcSelector.pickForConsensus(userRpc, 5, config);
      if (!candidates || candidates.length < 2) { this._coldProbeFlag[chainId] = true; return; }

      // Cold-start = none of the candidates has health state yet
      var anyKnown = false;
      for (var i = 0; i < candidates.length; i++) {
        if (RpcHealth._state && RpcHealth._state[candidates[i]]) { anyKnown = true; break; }
      }
      if (anyKnown) { this._coldProbeFlag[chainId] = true; return; }

      var timeoutMs = (config && config.TIMEOUTS && config.TIMEOUTS.FAST_FAIL_MS) || 4000;
      var requests = [];
      for (var j = 0; j < candidates.length; j++) {
        requests.push({
          url: candidates[j], method: "post", contentType: "application/json",
          payload: JSON.stringify({ jsonrpc: "2.0", id: j, method: "eth_blockNumber", params: [] }),
          muteHttpExceptions: true, timeout: timeoutMs
        });
      }
      var responses = Http.fetchAllSafe(requests, config);
      for (var k = 0; k < responses.length; k++) {
        var rpcUrl = candidates[k];
        var resp = responses[k];
        var ok = false;
        try {
          if (resp && resp.getResponseCode() === 200) {
            var json = JSON.parse(resp.getContentText());
            if (json && !json.error && json.result != null) ok = true;
          }
        } catch (eParse) {}
        if (ok) RpcHealth.recordSuccess(rpcUrl);
        else RpcHealth.recordFailure(rpcUrl, config);
      }
      this._coldProbeFlag[chainId] = true;
    } catch (e) {
      // Probe is best-effort; never block the scan on probe errors
      try { var cid = (config && config.CHAIN && config.CHAIN.CHAIN_ID) || 0; this._coldProbeFlag[cid] = true; } catch (e2) {}
    }
  },
```

- [ ] **Step 2: Appeler la sonde au début de `_getNativeParallel`**

Dans `_getNativeParallel`, après la ligne 325 (`var effectiveTimeout = Math.min(fastFailMs, httpTimeout);`) et AVANT la ligne 328 (`var requestCount = ...`), insérer :

```javascript
    // v4.15.50: Eliminate dead RPCs before consensus selection on cold-start
    this._coldStartProbeIfNeeded(userRpc, config, timer);
```

- [ ] **Step 3: Déployer et valider CORN cold-start**

Procédure de déploiement (voir header) : `node scripts/clasp-login-full.js` puis `npx @google/clasp push`, puis `node scripts/oauth-auto.js`.

Run:
```
npx @google/clasp run CLEAR_DYNAMIC_RPCS
```
Puis (PowerShell, JSON échappé) :
```
$p='["0x17d518736Ee9341dcDc0A2498e013D33cFcDD080","","",false,"manual"]'; npx @google/clasp run GET_WALLET_ASSETS_CORN -p $p
```
Expected: `INFO_NATIVE` contient `rpc` (pas `rpc-fail`), `INFO_HTTP hosts` montre `maizenet-rpc.usecorn.com`, balance native > 0.

- [ ] **Step 4: Commit**

```bash
git add src/08_ASSETS.gs
git commit -m "feat(rpc): cold-start eth_blockNumber probe to drop dead RPCs (v4.15.50)"
```

---

## Task 6: `BaseEngine.isBusy()` dans 10A_BASE_ENGINE.gs

**Files:**
- Modify: `src/10A_BASE_ENGINE.gs` (ajout après `BaseEngine.detectBlockReason`, ~ligne 365)

- [ ] **Step 1: Ajouter isBusy**

Insérer après la fermeture de `BaseEngine.detectBlockReason` (ligne 365, après le `};`) :

```javascript
/**
 * v4.15.50: Returns true when the system is under heavy load and a fresh
 * scan would risk the GAS 30s timeout (→ #ERROR! cell). Read-only (no HTTP).
 * Used by getRefreshStatus busy-guard. forceFull bypasses this.
 */
BaseEngine.isBusy = function(config) {
  try {
    // Quota circuit breaker tripped → definitely busy/blocked
    if (typeof QuotaCircuitBreaker !== 'undefined' && QuotaCircuitBreaker.isTripped && QuotaCircuitBreaker.isTripped()) return true;
    // Degraded mode active → system already struggling
    if (typeof DegradedMode !== 'undefined' && DegradedMode.isCircuitBreakerActive && DegradedMode.isCircuitBreakerActive()) return true;
    // HTTP budget near daily ceiling (>= 99% internal threshold)
    if (typeof HttpErrorGuard !== 'undefined' && HttpErrorGuard.isQuotaExhausted && HttpErrorGuard.isQuotaExhausted()) return true;
  } catch (e) {}
  return false;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/10A_BASE_ENGINE.gs
git commit -m "feat(engine): add BaseEngine.isBusy() load detector (v4.15.50)"
```

---

## Task 7: Busy-guard dans getRefreshStatus (EVM)

**Files:**
- Modify: `src/11_EVM_ENGINE.gs:1669-1679`

- [ ] **Step 1: Ajouter le busy-guard après le quotaPreCheck**

Dans `getRefreshStatus`, après le bloc `quotaPreCheck` (ligne 1679, après le `}` fermant le `if (!forceBypass)`), insérer :

```javascript
    // v4.15.50: Busy-guard — when system is under heavy load, return last cache
    // timestamp instead of risking a 30s GAS timeout (#ERROR!). forceFull bypasses.
    if (!forceBypass && BaseEngine.isBusy && BaseEngine.isBusy(config)) {
      var busyTs = "";
      try {
        CacheManager.init();
        var busyCache = WalletCache.load(addrLower, null, config);
        if (busyCache && busyCache.updatedAt) busyTs = Format.datetime(busyCache.updatedAt);
      } catch (eBusy) {}
      return "[BUSY] " + (busyTs || Format.now());
    }
```

Note: `forceBypass` est déjà calculé ligne 1675 (`forceBypass = true` quand forceFull actif). Le guard ne s'applique donc que sur les refresh non-forcés (WATCHDOG B1 pulse), exactement le cas qui sature la queue.

- [ ] **Step 2: Déployer et valider**

Procédure de déploiement (voir header).
Validation fonctionnelle normale (système non busy) :
```
$p='["0x17d518736Ee9341dcDc0A2498e013D33cFcDD080","","",false,"manual"]'; npx @google/clasp run METAL_L2_REFRESH_STATUS -p $p
```
Expected: retourne un timestamp normal (`2026-...`) car le système n'est pas busy en run isolé. Le `[BUSY]` n'apparaît que sous charge réelle.

- [ ] **Step 3: Commit**

```bash
git add src/11_EVM_ENGINE.gs
git commit -m "feat(evm): busy-guard in getRefreshStatus to prevent #ERROR! timeouts (v4.15.50)"
```

---

## Task 8: Busy-guard dans getRefreshStatus (SVM + Cosmos)

**Files:**
- Modify: `src/14_SVM_ENGINE.gs:860` (getRefreshStatus)
- Modify: `src/15_COSMOS_ENGINE.gs` (getRefreshStatus)

- [ ] **Step 1: Lire le début de getRefreshStatus SVM**

Read tool: `src/14_SVM_ENGINE.gs` offset 860, limit 40. Identifier le point après le quotaPreCheck (ou en tête si absent) et la variable d'adresse normalisée (probablement `addrLower` ou équivalent) et `forceBypass`/`forceFull`.

- [ ] **Step 2: Ajouter le busy-guard SVM**

Insérer en tête de `getRefreshStatus` SVM, après la normalisation d'adresse et le calcul de forceFull, le même bloc qu'en Task 7 — en adaptant le nom de la variable d'adresse à celui utilisé dans le fichier SVM (vérifié au Step 1). Si SVM n'a pas de `forceBypass`, calculer :

```javascript
    var _forceBypass = (forceFull === false || forceFull === "false" || forceFull === "FALSE") ? false : true;
    if (!_forceBypass && BaseEngine.isBusy && BaseEngine.isBusy(config)) {
      var _busyTs = "";
      try {
        CacheManager.init();
        var _bc = WalletCache.load(<ADDR_VAR>, null, config);
        if (_bc && _bc.updatedAt) _busyTs = Format.datetime(_bc.updatedAt);
      } catch (e) {}
      return "[BUSY] " + (_busyTs || Format.now());
    }
```
Remplacer `<ADDR_VAR>` par la variable d'adresse réelle du fichier SVM.

- [ ] **Step 3: Répéter pour Cosmos**

Read tool: localiser `getRefreshStatus` dans `src/15_COSMOS_ENGINE.gs` (Grep `getRefreshStatus`), lire son début, insérer le même bloc adapté à la variable d'adresse Cosmos.

- [ ] **Step 4: Déployer et valider non-régression**

Procédure de déploiement (voir header).
```
npx @google/clasp run WCORE_HEALTH
```
Expected: tableau de santé, Version `v4.15.50` (après Task 10), pas d'exception.

- [ ] **Step 5: Commit**

```bash
git add src/14_SVM_ENGINE.gs src/15_COSMOS_ENGINE.gs
git commit -m "feat(svm,cosmos): busy-guard in getRefreshStatus (v4.15.50)"
```

---

## Task 9: Health-check accepte eth_blockNumber (13B_DIAG_RPC.gs)

**Files:**
- Modify: `src/13B_DIAG_RPC.gs:947` (méthode du health-check RPC)

- [ ] **Step 1: Lire le contexte du health-check**

Read tool: `src/13B_DIAG_RPC.gs` offset 890, limit 80. Identifier comment la réponse `eth_chainId` est interprétée (comparaison avec `CHAIN_ID` attendu) et où un RPC est marqué OK/échec.

- [ ] **Step 2: Ajouter un fallback eth_blockNumber**

Modifier la logique d'évaluation : si `eth_chainId` retourne `result: null` ou ne matche pas mais que le RPC répond HTTP 200 sans erreur JSON, faire un second appel `eth_blockNumber`. Si celui-ci retourne un `result` non-null valide, marquer le RPC comme **vivant** (status type `[OK] (no chainId)`), sinon `[X]`. Ceci couvre les proxies Blockscout type racescan.io qui ne servent pas `eth_chainId`.

Code à intégrer dans la boucle de test (adapter aux variables locales repérées au Step 1) :

```javascript
        // v4.15.50: some Blockscout proxies return null for eth_chainId but
        // serve eth_blockNumber correctly — treat those as alive.
        if (chainOk !== true) {
          try {
            var bnResp = UrlFetchApp.fetch(rpcUrl, {
              method: "post", contentType: "application/json",
              payload: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
              muteHttpExceptions: true
            });
            if (bnResp.getResponseCode() === 200) {
              var bnJson = JSON.parse(bnResp.getContentText());
              if (bnJson && !bnJson.error && bnJson.result != null) {
                chainOk = true; // alive via blockNumber
              }
            }
          } catch (eBn) {}
        }
```
Adapter `rpcUrl` / `chainOk` aux noms réels du fichier.

- [ ] **Step 3: Déployer et valider RACE migration**

Procédure de déploiement (voir header).
```
npx @google/clasp run DIAG_RACE_RPC_HEALTH
$p='["0x..."]'; npx @google/clasp run GET_WALLET_ASSETS_RACE -p $p
```
(Utiliser l'adresse wallet RACE réelle, lisible via le helper Google Sheets API ou la cellule I1 de "Ledger - RACE".)
Expected: RACE retourne une balance native cohérente ; si les vrais RPCs échouent, le fallback `racescan.io/api/eth-rpc` est utilisé (visible dans `INFO_HTTP hosts`).

- [ ] **Step 4: Commit**

```bash
git add src/13B_DIAG_RPC.gs
git commit -m "feat(diag): RPC health accepts eth_blockNumber when chainId unsupported (v4.15.50)"
```

---

## Task 10: Version bump v4.15.50

**Files:**
- Modify: `src/01_INIT.gs:42`

- [ ] **Step 1: Bumper PATCH**

Remplacer ligne 42 :

```javascript
  PATCH: 48,
```

par :

```javascript
  PATCH: 50,
```

- [ ] **Step 2: Déployer**

Procédure de déploiement (voir header) : `node scripts/clasp-login-full.js` puis `npx @google/clasp push`.

- [ ] **Step 3: Valider la version**

```
npx @google/clasp run WCORE_HEALTH
```
Expected: ligne `Version` = `v4.15.50`.

- [ ] **Step 4: Commit**

```bash
git add src/01_INIT.gs
git commit -m "chore: bump WCORE_VERSION to v4.15.50 (RPC resilience)"
```

---

## Task 11: Validation finale end-to-end

**Files:** aucun (validation seule)

- [ ] **Step 1: Re-déployer le wcore-mcp token pour clasp run**

```
node scripts/oauth-auto.js
```

- [ ] **Step 2: Valider les 3 chaînes cibles**

```
$p='["0x17d518736Ee9341dcDc0A2498e013D33cFcDD080","","",false,"manual"]'
npx @google/clasp run GET_WALLET_ASSETS_CAMP -p $p
npx @google/clasp run GET_WALLET_ASSETS_CORN -p $p
npx @google/clasp run GET_WALLET_ASSETS_METAL_L2 -p $p
```
Expected:
- CAMP : balance 6.79 CAMP, `INFO_HTTP hosts` = `camp.cloud.blockscout.com`, `INFO_NATIVE` = `rpc`.
- CORN : balance > 0, host `maizenet-rpc.usecorn.com`, `INFO_NATIVE` = `rpc`.
- METAL_L2 : balance ~0.0004 ETH, consensus OK, exec < 10s.

- [ ] **Step 3: Non-régression chaîne saine multi-RPC**

```
$p='["0x17d518736Ee9341dcDc0A2498e013D33cFcDD080","","",false,"manual"]'; npx @google/clasp run GET_WALLET_ASSETS_BASE -p $p
```
Expected: scan normal, consensus, aucune sonde superflue ne casse le flux (balance + tokens habituels).

- [ ] **Step 4: Rebuild RPC lookup + auto-heal**

```
npx @google/clasp run WCORE_AUTO_HEAL -p '["force",true]'
```
Expected: triggers réinstallés. (Peut timeout côté clasp si watchdog tourne — vérifier ensuite via `WCORE_AUTO_HEAL_STATUS`.)

- [ ] **Step 5: Mettre à jour AGENTS.md**

Ajouter dans la section "Nouveautés" / gotchas un résumé : fallback Blockscout générique (`RPC.BLOCKSCOUT_RPC` + auto-dérivation `ACTIVITY_EXPLORER`), sonde cold-start `eth_blockNumber`, busy-guard `[BUSY]`. Noter le gotcha : certains proxies Blockscout (racescan.io) ne servent pas `eth_chainId`.

```bash
git add AGENTS.md
git commit -m "docs: document RPC resilience features (v4.15.50)"
```

---

## Self-Review Notes

- **Couverture spec** : Section 1 → Tasks 1,2,3,4,9 ; Section 2 → Task 5 ; Section 3 → Tasks 6,7,8. ✓
- **Cohérence types** : `_deriveBlockscoutRpc(config)` défini Task 1, appelé Tasks 2 ; `BaseEngine.isBusy(config)` défini Task 6, appelé Tasks 7,8 ; `_coldStartProbeIfNeeded` défini+appelé Task 5. ✓
- **Risque** : Tasks 8 et 9 nécessitent lecture du code réel (variables d'adresse SVM/Cosmos, structure du health-check) avant édition — étapes "Read" explicites incluses. C'est intentionnel : ces fichiers n'ont pas été lus intégralement, le worker doit confirmer les noms exacts.
