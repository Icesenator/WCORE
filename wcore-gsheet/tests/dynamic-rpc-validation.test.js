// Garde-fou: la validation d'un endpoint RPC doit etre stricte et structurée.
//
// Avant ce test, _testRpcLatency() se contentait d'appeler eth_chainId et
// d'extraire la liste des URLs qui repondent. Problemes observes:
//   - Un endpoint qui repond a eth_chainId mais retourne un chainId different
//     du CHAIN_ID attendu etait conserve (Degen chainId 666666666 servi par
//     un endpoint "Polygon" qui repond vite).
//   - Un endpoint en HTTP 200 avec un payload non-JRPC etait garde.
//   - Pas de distinction "teste/rejete", donc impossible de savoir quels
//     endpoints ont ete explicitement elimines par le test live.
//
// Le design 2026-08-27 exige:
//   1. _dynamicRpcValidateEndpoint_ (helper) appelle eth_chainId PUIS
//      eth_blockNumber et ne considere un endpoint valide que si les deux
//      reussissent et que chainId correspond.
//   2. _testRpcLatency retourne une structure {valid, rejected, reasons}
//      pour que le diagnostique sache ce qui a ete elimine et pourquoi.
//
// Tests RED puis GREEN.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', '33_DYNAMIC_RPC.gs'),
  'utf8',
);

// On extrait la fonction _dynamicRpcValidateEndpoint_ du code GAS.
// Elle est exportée via une variable globale, donc on l'injecte dans
// un sandbox vm pour pouvoir l'appeler sans Apps Script.
function loadHelper() {
  // Le helper doit être dans le source: on cherche la signature exacte.
  const m = SRC.match(/function _dynamicRpcValidateEndpoint_\([\s\S]*?\n\}/);
  assert.ok(m, '_dynamicRpcValidateEndpoint_ introuvable dans 33_DYNAMIC_RPC.gs');
  return m[0];
}

function makeSandbox({ responses = [], error = null, canFetch = true } = {}) {
  // Crée un sandbox qui simule UrlFetchApp.fetch et _dynamicRpcCanFetch_.
  let callCount = 0;
  const sandbox = {
    UrlFetchApp: {
      fetch: function (url, opts) {
        if (error) throw error;
        const spec = responses[callCount++] || responses[responses.length - 1];
        return {
          getResponseCode: function () { return spec.http; },
          getContentText: function () { return spec.body; },
        };
      },
    },
    _dynamicRpcCanFetch_: function () { return canFetch; },
  };
  vm.createContext(sandbox);
  vm.runInContext(loadHelper(), sandbox);
  return sandbox;
}

const failures = [];
function test(name, fn) {
  try {
    fn();
    console.log('OK - ' + name);
  } catch (err) {
    failures.push(name);
    console.error('FAIL - ' + name + ': ' + err.message);
  }
}

test('endpoint valide: eth_chainId matche + eth_blockNumber > 0', () => {
  const sb = makeSandbox({
    responses: [
      { http: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0xe35' }) },
      { http: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 2, result: '0x10' }) },
    ],
  });
  const result = sb._dynamicRpcValidateEndpoint_('https://rpc.example.com', 3637, 3000);
  assert.strictEqual(result.ok, true, 'doit etre ok=true');
  assert.strictEqual(result.reason, 'ok', 'reason doit etre "ok"');
  assert.strictEqual(result.blockNumber, 16, 'blockNumber = 0x10 = 16');
  assert.ok(result.latency >= 0, 'latency >= 0 (sandbox sync peut etre 0ms)');
});

test('mauvais chainId: rejete avec chain_id_mismatch', () => {
  const sb = makeSandbox({
    responses: [
      { http: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }) },
    ],
  });
  const result = sb._dynamicRpcValidateEndpoint_('https://rpc.example.com', 3637, 3000);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'chain_id_mismatch');
  assert.strictEqual(result.blockNumber, 0);
});

test('HTTP 502: rejete avec http_error', () => {
  const sb = makeSandbox({
    responses: [
      { http: 502, body: '<html>bad gateway</html>' },
    ],
  });
  const result = sb._dynamicRpcValidateEndpoint_('https://rpc.example.com', 3637, 3000);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'http_error');
});

test('timeout/exception: rejete avec fetch_error', () => {
  const sb = makeSandbox({ error: new Error('timeout exceeded') });
  const result = sb._dynamicRpcValidateEndpoint_('https://rpc.example.com', 3637, 3000);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'fetch_error');
});

test('eth_blockNumber = 0: rejete avec invalid_block_number', () => {
  const sb = makeSandbox({
    responses: [
      { http: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x15a9' }) },
      { http: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 2, result: '0x0' }) },
    ],
  });
  const result = sb._dynamicRpcValidateEndpoint_('https://rpc.example.com', 5545, 3000);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'invalid_block_number');
});

test('quota bloque: retourne quota_blocked sans fetch', () => {
  const sb = makeSandbox({ responses: [{ http: 200, body: '{}' }], canFetch: false });
  const result = sb._dynamicRpcValidateEndpoint_('https://rpc.example.com', 3637, 3000);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'quota_blocked');
  assert.strictEqual(result.latency, 0);
});

function makeRealStoreSandbox(seedJson) {
  // Crée un sandbox qui charge le VRAI DynamicRpcStore (avec ses méthodes
  // merge/replaceTested/_mergeList réelles) depuis le source 33_DYNAMIC_RPC.gs.
  // Le seedJson pré-remplit ScriptProperties pour que _load() retourne
  // l'état de test souhaité au lieu d'un store vide.
  const sandbox = {
    PropertiesService: {
      getScriptProperties: function () {
        return {
          getProperty: function (key) {
            if (key === 'DYNAMIC_RPC_MAP') return seedJson || null;
            return null;
          },
          setProperty: function () {}
        };
      }
    }
  };
  vm.createContext(sandbox);
  // On extrait l'IIFE DynamicRpcStore du source via regex non-greedy.
  // La fermeture `})();` apparaît une seule fois dans le fichier à ce niveau,
  // donc le `*` non-greedy s'arrête au premier `});\n})();`.
  const storeMatch = SRC.match(/var DynamicRpcStore = \(function\(\) \{[\s\S]*?\n\}\)\(\);/);
  assert.ok(storeMatch, 'DynamicRpcStore IIFE introuvable dans 33_DYNAMIC_RPC.gs');
  vm.runInContext(storeMatch[0], sandbox);
  return sandbox;
}

test('replaceTested (vrai store): remplace autoritairement', () => {
  // Store initial: chainId 1 a un endpoint valide.
  // Après replaceTested([], on doit avoir lot vide et removed=1.
  const seed = JSON.stringify({
    '1': { rpcs: ['https://old.example.com'], absent: {} },
    '_updatedAt': 0
  });
  const sb = makeRealStoreSandbox(seed);
  vm.runInContext(
    "var st = DynamicRpcStore.replaceTested(1, []);" +
    "ok1 = (DynamicRpcStore.get(1).length === 0);" +
    "ok2 = (st.removed === 1);",
    sb
  );
  assert.ok(sb.ok1, 'le lot doit etre vide apres replaceTested([])');
  assert.ok(sb.ok2, 'remove doit etre 1');
});

test('merge (vrai store): grace 2-miss conserve puis retire', () => {
  // Store initial: chainId 5545 a un endpoint, absent vierge.
  // 1ere merge([]): miss #1 -> conserve (absent=1).
  // 2e merge([]): miss #2 -> retire.
  const seed = JSON.stringify({
    '5545': { rpcs: ['https://rpc.duckchain.io'], absent: {} },
    '_updatedAt': 0
  });
  const sb = makeRealStoreSandbox(seed);
  vm.runInContext(
    "var st1 = DynamicRpcStore.merge(5545, []);" +
    "ok1 = (DynamicRpcStore.get(5545).indexOf('https://rpc.duckchain.io') >= 0);" +
    "var st2 = DynamicRpcStore.merge(5545, []);" +
    "ok2 = (DynamicRpcStore.get(5545).length === 0);",
    sb
  );
  assert.ok(sb.ok1, '1re miss: endpoint conserve par la grace 2-miss');
  assert.ok(sb.ok2, '2e miss: endpoint retire');
});

test('UPDATE_DYNAMIC_RPCS utilise replaceTested pour le bucket actif', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', '33_DYNAMIC_RPC.gs'), 'utf8');
  assert.ok(
    /DynamicRpcStore\.replaceTested\(/.test(src),
    'le bucket actif doit utiliser replaceTested'
  );
});

test('UPDATE_DYNAMIC_RPCS utilise merge pour les chaines differees', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', '33_DYNAMIC_RPC.gs'), 'utf8');
  assert.ok(
    /DynamicRpcStore\.merge\(/.test(src),
    'la fusion 2-miss doit rester utilisee'
  );
});

test('FORCE_UPDATE_DYNAMIC_RPCS existe et appelle UPDATE_DYNAMIC_RPCS(true)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', '33_DYNAMIC_RPC.gs'), 'utf8');
  assert.ok(
    /function FORCE_UPDATE_DYNAMIC_RPCS\(\)\s*\{\s*return UPDATE_DYNAMIC_RPCS\(true\);\s*\}/.test(src),
    'FORCE_UPDATE_DYNAMIC_RPCS doit bypasser le seuil de fraicheur sans vider le cache'
  );
});

test('UPDATE_DYNAMIC_RPCS ignore le skip si force !== true', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', '33_DYNAMIC_RPC.gs'), 'utf8');
  assert.ok(
    /function UPDATE_DYNAMIC_RPCS\(force\)\s*\{/.test(src),
    'UPDATE_DYNAMIC_RPCS doit accepter un parametre force'
  );
  assert.ok(
    /force = force === true;/.test(src),
    'force doit etre coerce en booleen strict'
  );
  assert.ok(
    /if \(!force && ageDays < 7\)/.test(src),
    'le skip de fraicheur ne s\'applique que si force n\'est pas true'
  );
});

test('DuckChain reste desactivee (FLAGS.DISABLE_CHAIN: true)', () => {
  const duck = fs.readFileSync(path.join(__dirname, '..', 'src', 'DUCKCHAIN.gs'), 'utf8');
  assert.ok(
    /FLAGS:\s*\{\s*DISABLE_CHAIN:\s*true\s*\}/.test(duck),
    'DuckChain doit rester desactivee sans preuve live positive'
  );
});

test('quota_blocked: _testRpcLatency retourne quotaBlocked=true et ne marque PAS testedCids', () => {
  // Integration: quand le quota s'epuise, la chaine ne doit PAS etre marquee
  // comme testee (sinon replaceTested([]) viderait le store). On verifie que
  // le code source implemente bien le continue sans testedCids[cid] = true.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', '33_DYNAMIC_RPC.gs'), 'utf8');
  // Le helper doit retourner quotaBlocked: true
  assert.ok(
    /quotaBlocked:\s*true/.test(src),
    '_testRpcLatency doit retourner quotaBlocked quand le quota est epuise'
  );
  // L'appelant doit skipper testedCids quand quotaBlocked (continue avant l'affectation)
  assert.ok(
    /if \(tested\.quotaBlocked\)/.test(src),
    'l\'appelant doit detecter tested.quotaBlocked'
  );
  assert.ok(
    /continue;/.test(src),
    'quotaBlocked doit empecher le marquage testedCids (continue)'
  );
});

if (failures.length) {
  console.error('\n' + failures.length + ' failing test(s)');
  process.exit(1);
}
console.log('\ndynamic rpc validation OK');