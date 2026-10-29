const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const srcDir = path.join(__dirname, '..', 'src');

function ownerFile() {
  const hits = fs.readdirSync(srcDir)
    .filter((name) => name.endsWith('.gs'))
    .filter((name) => /^var _RpcLookup = \(function\(\) \{/m.test(fs.readFileSync(path.join(srcDir, name), 'utf8')));
  assert.equal(hits.length, 1, 'une seule déclaration globale _RpcLookup');
  return hits[0];
}

const same = (actual, expected) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);

function load(options) {
  const file = ownerFile();
  const text = fs.readFileSync(path.join(srcDir, file), 'utf8');
  const start = text.indexOf('var _RpcLookup = (function() {');
  const end = text.indexOf('})();', start);
  assert.ok(start >= 0 && end > start, 'bloc _RpcLookup introuvable');
  const props = Object.assign({}, options.props || {});
  const logs = [];
  const clock = { now: options.now || 1700000000000 };
  const context = {
    console,
    JSON,
    Object,
    String,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [clock.now])); }
      static now() { return clock.now; }
    },
    Logger: { log(message) { logs.push(String(message)); } },
    PropertiesService: {
      getScriptProperties() {
        if (options.propsThrows) throw new Error('properties unavailable');
        return {
          getProperty(key) {
            return Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null;
          },
          setProperty(key, value) { props[key] = String(value); }
        };
      }
    },
    ChainFactory: options.chainFactory,
    ACTIVITY_CONFIG: { STORAGE: { RPC_LOOKUP: 'ACTIVITY_RPC_LOOKUP' } }
  };
  vm.createContext(context);
  vm.runInContext(text.slice(start, end + 5), context, { filename: file });
  return { lookup: context._RpcLookup, props, logs, file };
}

test('propriétaire unique découvert par le glob canonique src/*.gs', () => {
  const file = ownerFile();
  assert.match(file, /^(27_ACTIVITY_REFRESH|27A_RPC_LOOKUP)\.gs$/);
  const names = fs.readdirSync(srcDir);
  assert.ok(names.includes('appsscript.json'), 'manifest GAS présent');
  assert.equal(JSON.parse(fs.readFileSync(path.join(srcDir, 'appsscript.json'), 'utf8')).filePushOrder, undefined);
});

test('chaîne vide, registre vide et repli legacy : primaire, liste et VM', () => {
  const legacy = JSON.stringify({
    BASE: { rpc: 'https://legacy.example', vm: 'EVM' },
    COSMOS_HUB: { rpcs: ['https://rest.example'], vm: 'COSMOS', rest: 'https://explicit-rest.example' }
  });
  const h = load({ chainFactory: { getRegistry: () => ({}) }, props: { ACTIVITY_RPC_LOOKUP: legacy } });
  assert.equal(h.lookup.get('base'), 'https://legacy.example');
  same(h.lookup.getRpcs('Base'), ['https://legacy.example']);
  assert.equal(h.lookup.getVm('missing-chain'), 'EVM');
  assert.equal(h.lookup.get(''), null);
  same(h.lookup.getRpcs(null), []);
  assert.equal(h.lookup.getRest('cosmos hub'), 'https://explicit-rest.example');
  assert.equal(h.lookup.count(), 2);
});

test('ChainFactory alimente le cache et empêche le repli persistant', () => {
  const h = load({
    props: { ACTIVITY_RPC_LOOKUP: JSON.stringify({ IGNORED: { rpc: 'https://ignored.example', vm: 'EVM' } }) },
    chainFactory: {
      getRegistry: () => ({
        'Arbitrum One': { getConfig: () => ({ VM: 'evm', RPC: { ENDPOINTS: ['https://arb-1.example', 'https://arb-2.example', 'https://arb-3.example', 'https://arb-4.example'] } }) },
        BROKEN: { getConfig: () => { throw new Error('bad config'); } },
        NO_RPC: { getConfig: () => ({ VM: 'SVM' }) }
      })
    }
  });
  assert.equal(h.lookup.get('arbitrum-one'), 'https://arb-1.example');
  same(h.lookup.getRpcs('ARBITRUM ONE'), ['https://arb-1.example', 'https://arb-2.example', 'https://arb-3.example']);
  assert.equal(h.lookup.get('IGNORED'), null, 'registre non vide : pas de repli legacy');
  assert.equal(h.logs.filter((line) => line.includes('BROKEN')).length, 1);
  assert.equal(h.lookup.getVm('NO_RPC'), 'EVM');
});

test('set tronque à trois URL, normalise la clé et ne persiste rien', () => {
  const h = load({ chainFactory: undefined, propsThrows: true, now: 1710000000000 });
  h.lookup.set('ink chain', 'https://a.example', 'svm', ['https://a.example', 'https://b.example', 'https://c.example', 'https://d.example']);
  same(h.lookup.getRpcs('INK-CHAIN'), ['https://a.example', 'https://b.example', 'https://c.example']);
  assert.equal(h.lookup.getVm('ink chain'), 'svm', 'set conserve la VM fournie sans normalisation');
  assert.equal(h.lookup.getAll().INK_CHAIN.updated, 1710000000000);
  same(h.props, {});
  assert.equal(h.lookup.getRest('ink chain'), null);
});

test('Cosmos sans RPC prend REST, clear puis reload rejoue le repli', () => {
  const h = load({
    chainFactory: { getRegistry: () => ({ OSMOSIS: { getConfig: () => ({ vm: 'cosmos', API: { REST_URL: 'https://osmosis-rest.example' } }) } }) }
  });
  assert.equal(h.lookup.getRest('osmosiS'), 'https://osmosis-rest.example');
  h.lookup.clear();
  assert.equal(h.lookup.count(), 0);
  h.lookup.reload();
  assert.equal(h.lookup.count(), 1, 'reload reconstruit depuis ChainFactory');
  h.props.ACTIVITY_RPC_LOOKUP = JSON.stringify({ LEGACY_ONLY: { rpc: 'https://legacy-only.example', vm: 'EVM' } });
  const empty = load({
    chainFactory: { getRegistry: () => { throw new Error('registry down'); } },
    props: h.props
  });
  assert.equal(empty.lookup.get('legacy_only'), 'https://legacy-only.example');
  assert.equal(empty.logs.length, 0, 'exception getRegistry avalée sans journal');
});

test('JSON legacy corrompu : cache vide, sans exception vers l’appelant', () => {
  const h = load({ chainFactory: {}, props: { ACTIVITY_RPC_LOOKUP: '{bad' } });
  assert.equal(h.lookup.count(), 0);
  assert.equal(h.lookup.getAll() && typeof h.lookup.getAll(), 'object');
});
