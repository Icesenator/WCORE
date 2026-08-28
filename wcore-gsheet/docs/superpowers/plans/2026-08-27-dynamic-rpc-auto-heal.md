# Dynamic RPC Auto-Heal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renouveler le registre RPC chaque semaine, valider strictement `eth_chainId` et `eth_blockNumber`, retirer les endpoints testés invalides et préserver les caches portefeuille ainsi que les chaînes volontairement désactivées.

**Architecture:** `33_DYNAMIC_RPC.gs` reste l’unique composant de découverte et de stockage des RPC dynamiques. Le cycle distinguera les chaînes testées des chaînes différées par rotation : un lot testé remplacera immédiatement les anciens RPC par les seuls endpoints valides ; un lot différé conservera la fusion historique. DuckChain restera désactivée sans preuve live positive.

**Tech Stack:** Google Apps Script, Node.js, `assert`, `vm`, clasp, Google Sheets.

---

## Fichiers concernés

- Modifier : `wcore-gsheet/src/33_DYNAMIC_RPC.gs`
- Modifier : `wcore-gsheet/tests/dynamic-rpc-trigger.test.js`
- Créer : `wcore-gsheet/tests/dynamic-rpc-validation.test.js`
- Modifier : `wcore-gsheet/package.json`
- Vérifier sans modifier : `wcore-gsheet/src/DUCKCHAIN.gs`

Aucun commit ne doit être créé sans demande explicite de l’utilisateur.

### Task 1: Passer le renouvellement à sept jours

**Files:**
- Modify: `wcore-gsheet/tests/dynamic-rpc-trigger.test.js:101-105`
- Modify: `wcore-gsheet/src/33_DYNAMIC_RPC.gs:609-618`

- [ ] **Step 1: Écrire le test en échec**

Remplacer le dernier test par :

```js
test('le cout reste borne par un renouvellement hebdomadaire et le test partiel', () => {
  assert.ok(/ageDays < 7/.test(dynamicRpc), 'le seuil doit etre de 7 jours');
  assert.ok(!/ageDays < 25/.test(dynamicRpc), 'le seuil historique ne doit plus subsister');
  assert.ok(/rotationMod = 3/.test(dynamicRpc), 'la rotation 1/3 doit rester');
});
```

- [ ] **Step 2: Vérifier RED**

Run : `npm run test:dynamic-rpc-trigger`

Expected : FAIL avec `le seuil doit etre de 7 jours`.

- [ ] **Step 3: Implémenter le changement minimal**

Dans `UPDATE_DYNAMIC_RPCS()`, remplacer le seuil et le message :

```js
if (ageDays < 7) {
  var msg = "SKIP | Data is " + ageDays.toFixed(1) + "d old (threshold: 7d). Next update in ~" + (7 - ageDays).toFixed(0) + "d";
  console.log("[DYNAMIC_RPC] " + msg);
  return msg;
}
```

- [ ] **Step 4: Vérifier GREEN**

Run : `npm run test:dynamic-rpc-trigger`

Expected : PASS.

### Task 2: Spécifier la validation stricte d’un endpoint

**Files:**
- Create: `wcore-gsheet/tests/dynamic-rpc-validation.test.js`
- Modify: `wcore-gsheet/package.json:24-25`

- [ ] **Step 1: Créer le test unitaire**

Le test doit charger `33_DYNAMIC_RPC.gs`, extraire `_dynamicRpcValidateEndpoint_` avec `vm`, et simuler `UrlFetchApp.fetch`. Il doit couvrir exactement :

```js
[
  { name: 'endpoint valide', chainId: '0xe35', block: '0x10', ok: true, reason: 'ok' },
  { name: 'mauvais chainId', chainId: '0x1', ok: false, reason: 'chain_id_mismatch' },
  { name: 'HTTP 502', http: 502, ok: false, reason: 'http_error' },
  { name: 'timeout', error: new Error('timeout'), ok: false, reason: 'fetch_error' },
  { name: 'bloc nul', chainId: '0x15a9', block: '0x0', ok: false, reason: 'invalid_block_number' }
]
```

Le cas valide doit aussi vérifier `blockNumber === 16`.

- [ ] **Step 2: Ajouter la commande ciblée**

Dans `package.json` :

```json
"test:dynamic-rpc-validation": "node tests/dynamic-rpc-validation.test.js"
```

- [ ] **Step 3: Vérifier RED**

Run : `npm run test:dynamic-rpc-validation`

Expected : FAIL car `_dynamicRpcValidateEndpoint_` est absent.

### Task 3: Implémenter `eth_chainId` puis `eth_blockNumber`

**Files:**
- Modify: `wcore-gsheet/src/33_DYNAMIC_RPC.gs:540-602`
- Test: `wcore-gsheet/tests/dynamic-rpc-validation.test.js`

- [ ] **Step 1: Ajouter `_dynamicRpcValidateEndpoint_`**

Le helper doit :

```js
function _dynamicRpcValidateEndpoint_(url, expectedChainId, deadlineMs) {
  var deadlineS = Math.max(1, Math.ceil(Number(deadlineMs || 3000) / 1000));
  var startedAt = Date.now();
  try {
    if (!_dynamicRpcCanFetch_("dynamic-rpc-latency")) {
      return { ok: false, reason: "quota_blocked", latency: 0, blockNumber: 0 };
    }
    var chainResp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      muteHttpExceptions: true,
      deadline: deadlineS
    });
    if (!chainResp || chainResp.getResponseCode() !== 200) {
      return { ok: false, reason: "http_error", latency: Date.now() - startedAt, blockNumber: 0 };
    }
    var chainBody = JSON.parse(chainResp.getContentText());
    var parsedChainId = parseInt(String(chainBody && chainBody.result || ""), 16);
    if (!isFinite(parsedChainId) || parsedChainId !== Number(expectedChainId)) {
      return { ok: false, reason: "chain_id_mismatch", latency: Date.now() - startedAt, blockNumber: 0 };
    }
    var blockResp = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }),
      muteHttpExceptions: true,
      deadline: deadlineS
    });
    if (!blockResp || blockResp.getResponseCode() !== 200) {
      return { ok: false, reason: "http_error", latency: Date.now() - startedAt, blockNumber: 0 };
    }
    var blockBody = JSON.parse(blockResp.getContentText());
    var blockNumber = parseInt(String(blockBody && blockBody.result || ""), 16);
    if (!isFinite(blockNumber) || blockNumber <= 0) {
      return { ok: false, reason: "invalid_block_number", latency: Date.now() - startedAt, blockNumber: 0 };
    }
    return { ok: true, reason: "ok", latency: Date.now() - startedAt, blockNumber: blockNumber };
  } catch (e) {
    return { ok: false, reason: "fetch_error", latency: Date.now() - startedAt, blockNumber: 0 };
  }
}
```

- [ ] **Step 2: Faire retourner un résultat structuré par `_testRpcLatency`**

Le retour attendu est :

```js
{
  valid: ["https://rpc-valide"],
  rejected: ["https://rpc-invalide"],
  reasons: { http_error: 1 }
}
```

Les entrées valides restent triées par latence.

- [ ] **Step 3: Vérifier GREEN**

Run : `npm run test:dynamic-rpc-validation`

Expected : tous les cas PASS.

### Task 4: Remplacer immédiatement un lot explicitement testé

**Files:**
- Modify: `wcore-gsheet/src/33_DYNAMIC_RPC.gs:90-117`
- Modify: `wcore-gsheet/tests/dynamic-rpc-validation.test.js`

- [ ] **Step 1: Ajouter deux tests en échec**

Cas attendus :

```js
replaceTested(3637, [])
// ancien ["https://rpc.botanixlabs.com"] => []

merge(5545, ["https://rpc.duckchain.io"])
// chaîne différée : conserve la logique historique de fusion
```

Le premier test prouve qu’un endpoint testé mort n’attend plus deux cycles avant retrait. Le second prouve que les chaînes non testées ne sont pas vidées.

- [ ] **Step 2: Vérifier RED**

Run : `npm run test:dynamic-rpc-validation`

Expected : FAIL car `replaceTested` est absent.

- [ ] **Step 3: Ajouter la méthode au store**

Dans `DynamicRpcStore` :

```js
replaceTested: function(chainId, validatedRpcs) {
  _load();
  var key = String(chainId);
  var previous = _cache[key] || { rpcs: [], absent: {} };
  var oldList = previous.rpcs || [];
  var next = (validatedRpcs || []).slice();
  var oldSet = {};
  var nextSet = {};
  for (var i = 0; i < oldList.length; i++) oldSet[oldList[i]] = true;
  for (var j = 0; j < next.length; j++) nextSet[next[j]] = true;
  var added = 0;
  var removed = 0;
  for (var a = 0; a < next.length; a++) if (!oldSet[next[a]]) added++;
  for (var r = 0; r < oldList.length; r++) if (!nextSet[oldList[r]]) removed++;
  _cache[key] = { rpcs: next, absent: {} };
  return { added: added, removed: removed };
}
```

- [ ] **Step 4: Vérifier GREEN**

Run : `npm run test:dynamic-rpc-validation`

Expected : PASS.

### Task 5: Intégrer la politique testée/différée au cycle

**Files:**
- Modify: `wcore-gsheet/src/33_DYNAMIC_RPC.gs:639-691`
- Modify: `wcore-gsheet/tests/dynamic-rpc-validation.test.js`

- [ ] **Step 1: Ajouter des tests statiques en échec**

Vérifier que le cycle :

```js
DynamicRpcStore.replaceTested(Number(cid), tested.valid)
```

est utilisé pour le bucket actif, tandis que :

```js
DynamicRpcStore.merge(Number(cid), chainlistData[cid])
```

reste utilisé pour les buckets différés.

- [ ] **Step 2: Vérifier RED**

Run : `npm run test:dynamic-rpc-validation`

Expected : FAIL sur l’absence de `replaceTested` dans la boucle.

- [ ] **Step 3: Modifier la boucle de test**

Créer deux maps :

```js
var testedChains = {};
var deferredChains = {};
```

Pour le bucket actif :

```js
var tested = _testRpcLatency(rpcs, Number(cid));
testedChains[cid] = tested;
```

Pour les autres buckets :

```js
deferredChains[cid] = rpcs;
```

Lors de la persistance :

```js
if (testedChains[cid]) {
  evmStats = DynamicRpcStore.replaceTested(Number(cid), testedChains[cid].valid);
} else {
  evmStats = DynamicRpcStore.merge(Number(cid), deferredChains[cid] || chainlistData[cid]);
}
```

- [ ] **Step 4: Ajouter les compteurs diagnostiques**

Compter et inclure dans le résultat :

```js
validCount
rejectedCount
chainIdMismatchCount
noHealthyChainCount
```

- [ ] **Step 5: Vérifier GREEN**

Run : `npm run test:dynamic-rpc-validation`

Expected : PASS.

### Task 6: Ajouter une exécution forcée sans supprimer le cache portefeuille

**Files:**
- Modify: `wcore-gsheet/src/33_DYNAMIC_RPC.gs:604-748`
- Modify: `wcore-gsheet/tests/dynamic-rpc-validation.test.js`

- [ ] **Step 1: Écrire le test en échec**

Le test doit exiger une fonction publique :

```js
function FORCE_UPDATE_DYNAMIC_RPCS() {
  return UPDATE_DYNAMIC_RPCS(true);
}
```

et vérifier que `UPDATE_DYNAMIC_RPCS(force)` ignore le skip de sept jours uniquement si `force === true`.

- [ ] **Step 2: Vérifier RED**

Run : `npm run test:dynamic-rpc-validation`

Expected : FAIL car la fonction forcée est absente.

- [ ] **Step 3: Implémenter le paramètre**

```js
function UPDATE_DYNAMIC_RPCS(force) {
  force = force === true;
```

Puis :

```js
if (!force && ageDays < 7) {
```

Ajouter :

```js
function FORCE_UPDATE_DYNAMIC_RPCS() {
  return UPDATE_DYNAMIC_RPCS(true);
}
```

Cette fonction ne doit appeler ni `WalletCache.clear`, ni `CacheManager.clear`, ni `CLEAR_DYNAMIC_RPCS`.

- [ ] **Step 4: Vérifier GREEN**

Run : `npm run test:dynamic-rpc-validation`

Expected : PASS.

### Task 7: Vérifier que DuckChain reste désactivée

**Files:**
- Modify: `wcore-gsheet/tests/dynamic-rpc-validation.test.js`
- Verify: `wcore-gsheet/src/DUCKCHAIN.gs:6-9`

- [ ] **Step 1: Ajouter le garde-fou**

```js
const duck = fs.readFileSync(path.join(__dirname, '..', 'src', 'DUCKCHAIN.gs'), 'utf8');
assert.ok(/FLAGS:\s*\{\s*DISABLE_CHAIN:\s*true\s*\}/.test(duck));
```

- [ ] **Step 2: Exécuter le test**

Run : `npm run test:dynamic-rpc-validation`

Expected : PASS sans modification de `DUCKCHAIN.gs`.

### Task 8: Vérification complète et déploiement

**Files:**
- Verify: `wcore-gsheet/src/33_DYNAMIC_RPC.gs`
- Verify: `wcore-gsheet/tests/dynamic-rpc-trigger.test.js`
- Verify: `wcore-gsheet/tests/dynamic-rpc-validation.test.js`

- [ ] **Step 1: Exécuter les tests ciblés**

```powershell
npm run test:dynamic-rpc-trigger
npm run test:dynamic-rpc-validation
```

Expected : PASS.

- [ ] **Step 2: Exécuter la validation statique**

```powershell
npm run validate:static
```

Expected : succès, aucune collision globale GAS.

- [ ] **Step 3: Exécuter toute la suite GSheet**

```powershell
npm test
```

Expected : toutes les suites PASS.

- [ ] **Step 4: Vérifier le diff avant déploiement**

```powershell
git status --short
git diff -- wcore-gsheet/src/33_DYNAMIC_RPC.gs wcore-gsheet/tests/dynamic-rpc-trigger.test.js wcore-gsheet/tests/dynamic-rpc-validation.test.js wcore-gsheet/package.json
```

Expected : uniquement les fichiers prévus et les documents de design/plan.

- [ ] **Step 5: Déployer avec le mécanisme sécurisé**

```powershell
powershell -File wcore-gsheet/safe-push.ps1
```

Expected : push Apps Script réussi et `.clasp.json` restauré.

- [ ] **Step 6: Forcer le renouvellement dynamique**

```powershell
npx @google/clasp run FORCE_UPDATE_DYNAMIC_RPCS
npx @google/clasp run DYNAMIC_RPC_STATUS
```

Expected : cycle exécuté malgré l’âge inférieur à sept jours, compteurs diagnostiques présents.

- [ ] **Step 7: Vérifier Botanix et DuckChain**

```powershell
npx @google/clasp run SHOW_DYNAMIC_RPCS
```

Expected actuellement : Botanix et DuckChain peuvent avoir zéro RPC dynamique validé ; aucun endpoint mort explicitement testé ne doit rester dans leur lot dynamique. DuckChain reste `[CHAIN_DISABLED]`. Botanix conserve son cache et son avertissement tant qu’aucun RPC sain n’existe.

- [ ] **Step 8: Relancer uniquement Botanix si un RPC valide apparaît**

Si le diagnostic donne au moins un endpoint Botanix valide, cocher temporairement `Ledger - Botanix!C1`, puis vérifier que `I1`, `J1`, `ERROR` et `INFO_TOTAL` deviennent frais. Sinon, ne pas forcer une boucle inutile.

- [ ] **Step 9: Journaliser les résultats**

Ajouter au journal Obsidian : endpoints testés, verdict Botanix/DuckChain, tests, déploiement et état final du cache.
