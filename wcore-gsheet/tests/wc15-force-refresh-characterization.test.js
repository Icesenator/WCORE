const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const srcDir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(srcDir).filter((name) => name.endsWith('.gs'));
const sources = new Map(files.map((name) => [name, fs.readFileSync(path.join(srcDir, name), 'utf8')]));

function ownerOf(predicate) {
  const hits = files.filter((name) => predicate(sources.get(name)));
  assert.equal(hits.length, 1, 'propriétaire unique attendu, trouvé ' + hits.join(','));
  return hits[0];
}

function blockOf(file, startMarker, endMarker) {
  const text = sources.get(file);
  const a = text.indexOf(startMarker);
  assert.ok(a >= 0, startMarker + ' absent de ' + file);
  const b = text.indexOf(endMarker, a);
  assert.ok(b > a, endMarker + ' absent après ' + startMarker);
  return text.slice(a, b);
}

const managerOwner = ownerOf((text) => /^var ForceRefreshManager = \{/m.test(text));
const intervalOwner = ownerOf((text) => /^function calculateRefreshInterval\(/m.test(text));

function balanced(text, start) {
  let depth = 0;
  let quote = '';
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote && text[i - 1] !== '\\') quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  throw new Error('unbalanced block at ' + start);
}

function extractionOf(owner, marker, objectLiteral) {
  const text = sources.get(owner);
  const start = text.indexOf(marker);
  assert.ok(start >= 0, marker + ' absent de ' + owner);
  const end = balanced(text, start);
  return objectLiteral ? text.slice(start, end + 1) + ';' : text.slice(start, end + 1);
}

function moduleSource() {
  return [
    extractionOf(managerOwner, 'var ForceRefreshManager = {', true),
    extractionOf(intervalOwner, 'function calculateRefreshInterval(', false)
  ].join('\n');
}

function load(options) {
  const store = Object.assign({}, options.store || {});
  const logs = [];
  const clock = { now: options.now || 1700000000000 };
  const context = {
    console, JSON, Object, String, Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [clock.now])); }
      static now() { return clock.now; }
    },
    Number, Math, isFinite, parseInt,
    ACTIVITY_CONFIG: {
      INTERVALS: { ACTIVE: 300000, HIGH_VALUE: 1800000, MEDIUM: 7200000, LOW: 21600000, HIBERNATED: 86400000 },
      THRESHOLDS: { HIGH: 1000, MEDIUM: 100, LOW: 1 },
      STORAGE: { NONCE_MAP: 'ACTIVITY_NONCE_MAP', FORCE_REFRESH_PREFIX: 'ACTIVITY_FORCE_', RPC_LOOKUP: 'ACTIVITY_RPC_LOOKUP' }
    },
    Logger: { log(message) { logs.push(String(message)); } },
    PropertiesService: {
      getScriptProperties() {
        if (options.storeThrows) throw new Error('storage unavailable');
        return {
          getProperty(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
          setProperty(key, value) { store[key] = String(value); },
          deleteProperty(key) { delete store[key]; }
        };
      }
    },
    ActivityTracker: { hasRecentActivity: () => !!options.recent }
  };
  vm.createContext(context);
  vm.runInContext(moduleSource(), context, { filename: managerOwner + '+' + intervalOwner });
  return { context, store, logs, clock };
}

test('propriétaires uniques du module force refresh', () => {
  assert.match(managerOwner, /^(27_ACTIVITY_REFRESH|27B_ACTIVITY_FORCE)\.gs$/);
  assert.match(intervalOwner, /^(27_ACTIVITY_REFRESH|27B_ACTIVITY_FORCE)\.gs$/);
  assert.equal(files.length, new Set(files).size);
});

test('set écrit la clé normalisée et renvoie true', () => {
  const h = load({ now: 1700000000000 });
  assert.equal(h.context.ForceRefreshManager.set('Arbitrum One', '0xAbCdEf', 'TX detected'), true);
  const key = 'ACTIVITY_FORCE_ARBITRUM_ONE_0xabcdef';
  assert.ok(h.store[key], 'clé attendue ' + key);
  const data = JSON.parse(h.store[key]);
  assert.equal(data.chain, 'ARBITRUM_ONE');
  assert.equal(data.wallet, '0xabcdef');
  assert.equal(data.requestedAt, 1700000000000);
  assert.equal(data.reason, 'TX detected');
  assert.ok(h.logs.some((line) => line.startsWith('[FORCE_REFRESH] SET ')));
});

test('set en échec de stockage : false et log, aucune exception', () => {
  const h = load({ storeThrows: true });
  assert.equal(h.context.ForceRefreshManager.set('Base', '0xdeadbeef'), false);
  assert.ok(h.logs.some((line) => line.includes('SET FAILED')));
});

test('set sans raison utilise le libellé par défaut', () => {
  const h = load({});
  h.context.ForceRefreshManager.set('Base', '0x1111');
  const data = JSON.parse(h.store.ACTIVITY_FORCE_BASE_0x1111);
  assert.equal(data.reason, 'TX detected');
});

test('check : absent, présent, expiré, corrompu', () => {
  const absent = load({});
  assert.equal(absent.context.ForceRefreshManager.check('Base', '0x1'), null);
  assert.ok(absent.logs.some((line) => line.includes('NOT FOUND')));

  const now = 1700000000000;
  const fresh = load({ now, store: { ACTIVITY_FORCE_BASE_0x1: JSON.stringify({ requestedAt: now - 60000, reason: 'live' }) } });
  const found = fresh.context.ForceRefreshManager.check('Base', '0x1');
  assert.equal(found.reason, 'live');
  assert.ok(fresh.store.ACTIVITY_FORCE_BASE_0x1, 'entrée fraîche conservée');

  const expired = load({ now, store: { ACTIVITY_FORCE_BASE_0x1: JSON.stringify({ requestedAt: now - 7200001, reason: 'old' }) } });
  assert.equal(expired.context.ForceRefreshManager.check('Base', '0x1'), null);
  assert.equal(Object.prototype.hasOwnProperty.call(expired.store, 'ACTIVITY_FORCE_BASE_0x1'), false, 'entrée expirée supprimée');
  assert.ok(expired.logs.some((line) => line.includes('EXPIRED')));

  const corrupt = load({ store: { ACTIVITY_FORCE_BASE_0x1: '{bad' } });
  assert.equal(corrupt.context.ForceRefreshManager.check('Base', '0x1'), null);
  assert.ok(corrupt.logs.some((line) => line.includes('CHECK FAILED')));
});

test('clear supprime la clé et reste silencieux en cas d’échec', () => {
  const now = 1700000000000;
  const h = load({ now, store: { ACTIVITY_FORCE_BASE_0x1: JSON.stringify({ requestedAt: now }) } });
  h.context.ForceRefreshManager.clear('Base', '0x1');
  assert.equal(Object.prototype.hasOwnProperty.call(h.store, 'ACTIVITY_FORCE_BASE_0x1'), false);
  assert.ok(h.logs.some((line) => line.startsWith('[FORCE_REFRESH] CLEAR ')));

  const broken = load({ storeThrows: true });
  assert.doesNotThrow(() => broken.context.ForceRefreshManager.clear('Base', '0x1'));
  assert.ok(broken.logs.some((line) => line.includes('CLEAR FAILED')));
});

test('calculateRefreshInterval : priorité force, activité, valeur, fraîcheur', () => {
  const now = 1700000000000;
  const force = load({ now, store: { ACTIVITY_FORCE_BASE_0x1: JSON.stringify({ requestedAt: now, reason: 'forced reason' }) } });
  assert.deepEqual({ ...force.context.calculateRefreshInterval('Base', '0x1', 5000, 1) }, { name: 'FORCE', reason: 'forced reason', interval: 0 });

  const active = load({ recent: true });
  assert.equal(active.context.calculateRefreshInterval('Base', '0x1', 0, 1).name, 'ACTIVE');

  const tiers = load({});
  const value = 1700000000000;
  assert.equal(tiers.context.calculateRefreshInterval('Base', '0x1', 1500, 999999999).name, 'HIGH');
  assert.equal(tiers.context.calculateRefreshInterval('Base', '0x1', 500, 999999999).name, 'MEDIUM');
  assert.equal(tiers.context.calculateRefreshInterval('Base', '0x1', 5, 999999999).name, 'LOW');
  assert.equal(tiers.context.calculateRefreshInterval('Base', '0x1', 0.5, 999999999).name, 'HIBERNATED');
  assert.equal(tiers.context.calculateRefreshInterval('Base', '0x1', 5, null).name, 'NORMAL');
  assert.equal(tiers.context.calculateRefreshInterval('Base', '0x1', 5, null).interval, 21600000);
  assert.equal(tiers.context.calculateRefreshInterval('Base', '0x1', 5, 1000).name, 'SKIP');
  void value;
});
