const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/03E_QUOTA_CIRCUIT_BREAKER.gs'), 'utf8');
const start = source.indexOf('function INSTALL_GLOBAL_QUOTA_BREAKER()');
const end = source.indexOf('\n}', start) + 2;
const body = source.slice(start, end);
function load(tripped = false) {
  const records = [], calls = [], errors = [];
  const context = {
    UrlFetchApp: {fetch: (...args) => { calls.push(args); return 'response'; }, fetchAll: requests => { calls.push(requests); return requests.map(() => 'response'); }},
    QuotaCircuitBreaker: {isTripped: () => tripped, handleError: e => errors.push(e.message)},
    HttpCounter: {record: (count, tag, url) => records.push({count, tag, url})},
    Logger: {log() {}},
  };
  vm.createContext(context);
  vm.runInContext(body, context);
  context.INSTALL_GLOBAL_QUOTA_BREAKER();
  return {context, records, calls, errors};
}
test('WC07 : appel direct fetch compté avant transport, puis réponse conservée', () => {
  const h = load();
  assert.equal(h.context.UrlFetchApp.fetch('https://example.invalid/rpc'), 'response');
  assert.equal(h.calls.length, 1); assert.equal(h.records.length, 1);
  assert.equal(h.records[0].url, 'https://example.invalid/rpc');
});
test('WC07 : fetchAll direct compte chaque requête, formes URL et objet', () => {
  const h = load(); const out = h.context.UrlFetchApp.fetchAll(['https://a.invalid', {url: 'https://b.invalid'}]);
  assert.equal(out.length, 2); assert.equal(h.records.length, 2); assert.equal(h.calls.length, 1);
  assert.equal(h.records[1].url, 'https://b.invalid');
});
test('WC07 : breaker ouvert interdit fetch et fetchAll sans trafic ni compteur fictif', () => {
  const h = load(true);
  assert.equal(h.context.UrlFetchApp.fetch('https://a.invalid'), null);
  assert.equal(h.context.UrlFetchApp.fetchAll(['https://a.invalid']).length, 1);
  assert.equal(h.calls.length, 0); assert.equal(h.records.length, 0);
});
test('WC07 : erreur transport comptée et transmise au breaker sans masquer la panne', () => {
  const h = load();
  // Recréer le wrapper avec un transport qui échoue, sans appel externe.
  const ctx = h.context;
  ctx.UrlFetchApp = {fetch: () => {throw Error('quota exceeded');}, fetchAll: () => []};
  ctx.INSTALL_GLOBAL_QUOTA_BREAKER();
  assert.throws(() => ctx.UrlFetchApp.fetch('https://a.invalid'), /quota exceeded/);
  assert.equal(h.records.length, 1);assert.deepEqual(h.errors, ['quota exceeded']);
});
test('WC07 : réinstallation idempotente ne double pas le compteur', () => {
  const h = load();h.context.INSTALL_GLOBAL_QUOTA_BREAKER();
  h.context.UrlFetchApp.fetch('https://a.invalid');assert.equal(h.records.length, 1);
});
