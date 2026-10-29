const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = path.join(__dirname, '..', 'src');
const rpcFile = fs.readFileSync(path.join(src, '27A_RPC_LOOKUP.gs'), 'utf8');
const forceFile = fs.readFileSync(path.join(src, '27B_ACTIVITY_FORCE.gs'), 'utf8');
const activity = fs.readFileSync(path.join(src, '27_ACTIVITY_REFRESH.gs'), 'utf8');
const evm = fs.readFileSync(path.join(src, '11_EVM_ENGINE.gs'), 'utf8');
const heal = fs.readFileSync(path.join(src, '16B_AUTO_HEAL.gs'), 'utf8');

function sliceFn(source, name) {
  const start = source.indexOf('function ' + name);
  assert.ok(start >= 0, name);
  let depth = 0;
  let seen = false;
  let quote = '';
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') { depth++; seen = true; }
    else if (ch === '}') {
      depth--;
      if (seen && depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function effects() {
  const calls = [];
  return {
    calls,
    PropertiesService: { getScriptProperties() { calls.push('properties'); return { getProperty() { return null; }, setProperty() {} }; } },
    CacheService: { getScriptCache() { calls.push('cache'); return {}; } },
    LockService: { getScriptLock() { calls.push('lock'); return {}; } },
    UrlFetchApp: { fetch() { calls.push('http'); } },
    Logger: { log(message) { calls.push('log:' + message); } },
    ChainFactory: { getRegistry() { calls.push('registry'); return {}; } },
    ACTIVITY_CONFIG: { STORAGE: { RPC_LOOKUP: 'ACTIVITY_RPC_LOOKUP' } }
  };
}

function evaluate(order) {
  const fx = effects();
  const context = {
    console, JSON, Object, String, Date, Math, parseInt, isFinite, Number,
    PropertiesService: fx.PropertiesService,
    CacheService: fx.CacheService,
    LockService: fx.LockService,
    UrlFetchApp: fx.UrlFetchApp,
    Logger: fx.Logger,
    ChainFactory: fx.ChainFactory
  };
  vm.createContext(context);
  for (const file of order) vm.runInContext(file, context, { filename: 'order' });
  return { context, calls: fx.calls };
}

const orders = [
  ['27A', '27B', '27', '11', '16B'],
  ['11', '16B', '27', '27B', '27A'],
  ['27', '11', '16B', '27A', '27B'],
  ['16B', '11', '27B', '27A', '27'],
  ['27B', '27A', '16B', '11', '27']
];
const files = { '27A': rpcFile, '27B': forceFile, '27': activity, '11': evm, '16B': heal };

for (const order of orders) {
  test('évaluation ' + order.join('→') + ' : objets construits, aucun service appelé', () => {
    const seen = evaluate(order.map((id) => files[id]));
    assert.equal(typeof seen.context._RpcLookup, 'object');
    assert.equal(typeof seen.context._RpcLookup.get, 'function');
    assert.equal(typeof seen.context.ForceRefreshManager, 'object');
    assert.equal(typeof seen.context.ForceRefreshManager.check, 'function');
    assert.deepEqual(seen.calls, [], 'ChainFactory, stockage, verrou, HTTP et logs restent différés');
    assert.equal(seen.context._RpcLookup.count(), 0);
    assert.equal(seen.context.ForceRefreshManager.check('Base', '0x1'), null);
    const first = seen.calls.slice(0, 2);
    assert.deepEqual(first, ['registry', 'properties']);
  });
}

test('chemin métier auto-heal différé : count puis réparation, jamais pendant l’évaluation', () => {
  const fx = effects();
  const repaired = [];
  const context = {
    console, JSON, Object, String, Date, Math, parseInt, isFinite,
    PropertiesService: fx.PropertiesService,
    Logger: fx.Logger,
    ChainFactory: fx.ChainFactory,
    ACTIVITY_CONFIG: { STORAGE: { RPC_LOOKUP: 'ACTIVITY_RPC_LOOKUP' } },
    REPAIR_RPC_LOOKUP_FROM_REGISTRY(force) { repaired.push(force); },
    BUILD_RPC_LOOKUP() { repaired.push('build'); },
    _wcoreAutoHealRow_() {}
  };
  vm.createContext(context);
  vm.runInContext(rpcFile + '\n' + sliceFn(heal, '_wcoreAutoHealBootstrapState_'), context);
  assert.deepEqual(fx.calls, []);
  context._wcoreAutoHealBootstrapState_([], false);
  assert.deepEqual(repaired, [false, 'build'], 'registre vide : réparation puis BUILD_RPC_LOOKUP, uniquement après l’appel');
  assert.ok(fx.calls.includes('registry'));
});

test('inclusion packaging locale : 27A dans src, sauvegarde hors src, clasp non lancé', () => {
  const listed = fs.readdirSync(src).filter((name) => name.endsWith('.gs'));
  assert.ok(listed.includes('27A_RPC_LOOKUP.gs'));
  assert.ok(listed.includes('27_ACTIVITY_REFRESH.gs'));
  assert.equal(listed.some((name) => name.includes('wc15-before')), false);
  const backup = path.join(__dirname, '..', '.backups', '27_ACTIVITY_REFRESH.gs.wc15-before');
  assert.equal(fs.existsSync(backup), true);
  assert.equal(path.relative(src, backup).startsWith('..'), true);
  const clasp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.clasp.json'), 'utf8'));
  assert.equal(clasp.rootDir, 'src');
  const ignore = fs.readFileSync(path.join(__dirname, '..', '.claspignore'), 'utf8');
  assert.match(ignore, /^\*\*\/\*\.js$/m);
  assert.doesNotMatch(ignore, /\.gs/);
  const chainNames = listed.filter((name) => /^[A-Z][A-Z0-9_]*\.gs$/.test(name));
  assert.equal(chainNames.includes('27A_RPC_LOOKUP.gs'), false);
  assert.equal(rpcFile.includes('ChainFactory.create'), false);
});

test('chemin métier EVM différé : set seulement à l’appel, pas à l’évaluation du fichier', () => {
  const fx = effects();
  const context = {
    console, JSON, Object, String, Date, Math,
    PropertiesService: fx.PropertiesService,
    Logger: fx.Logger,
    ChainFactory: fx.ChainFactory,
    ACTIVITY_CONFIG: { STORAGE: { RPC_LOOKUP: 'ACTIVITY_RPC_LOOKUP' } },
    ActivityTracker: { getInfo() { return { nonce: 1 }; }, updateNonce() {} },
    OutputBuilder: { extractInfoMetaRows() { return []; } }
  };
  vm.createContext(context);
  assert.equal(evm.includes('function _saveAllCaches'), false, 'l’appel EVM est dans une méthode, pas une fonction libre');
  assert.match(evm, /_RpcLookup\.set\(/);
  vm.runInContext(rpcFile, context);
  assert.deepEqual(fx.calls, []);
  context._RpcLookup.set('Base', 'https://base.example', 'EVM', ['https://base-2.example']);
  assert.equal(context._RpcLookup.get('base'), 'https://base.example');
  assert.deepEqual(fx.calls, ['registry', 'properties']);
});

test('27A chargé avant ACTIVITY_CONFIG : l’évaluation réussit, l’appel métier attend la config', () => {
  const fx = effects();
  const context = { console, JSON, Object, String, Date, Math, PropertiesService: fx.PropertiesService, Logger: fx.Logger, ChainFactory: fx.ChainFactory };
  vm.createContext(context);
  vm.runInContext(rpcFile, context);
  assert.equal(typeof context._RpcLookup.get, 'function');
  context.ChainFactory = { getRegistry: () => ({ READY: { getConfig: () => ({ VM: 'EVM', RPC: { ENDPOINTS: ['https://ready.example'] } }) } }) };
  assert.equal(context._RpcLookup.count(), 1, 'registre non vide : ACTIVITY_CONFIG n’est pas lu');
  context._RpcLookup.clear();
  context.ChainFactory = fx.ChainFactory;
  context._RpcLookup.reload();
  assert.equal(context._RpcLookup.count(), 0, 'ACTIVITY_CONFIG absent : catch interne, cache vide, pas d’exception appelant');
  vm.runInContext('var ACTIVITY_CONFIG={STORAGE:{RPC_LOOKUP:"ACTIVITY_RPC_LOOKUP"}};', context);
  context._RpcLookup.reload();
  assert.equal(context._RpcLookup.count(), 0);
});
