// "Trade fait" button: the workbook takes the acknowledgements and runs the manual CEX refresh.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', '16C_STRAT_ALERT.gs'), 'utf8');
const REFRESH = fs.readFileSync(path.join(__dirname, '..', 'src', '16_REFRESH.gs'), 'utf8');
const API = 'https://api.example.test';
const TOKEN = 'secret-token';

function harness(opts = {}) {
  const props = opts.props || { WCORE_WEB_API_URL: API + '/', GSHEET_API_TOKEN: TOKEN };
  const posts = [];
  const edits = [];
  const state = { code: 200, body: { ok: true, categories: [] }, handled: true };
  state.status = {};
  const sheet = (name) => ({ getRange: (a) => ({ sheet: name, a, getValue: () => (state.status[name + '!' + a] || '') }) });
  const sheets = { 'Portefeuille Crypto': sheet('Portefeuille Crypto'), 'Portefeuille Action': sheet('Portefeuille Action') };
  const ctx = {
    JSON, Object, String, Number, Math, isFinite, Array,
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    HTTP: { post: (url, payload, options) => {
      posts.push({ url, payload, options });
      if (state.code === null) throw new Error('network');
      return { getResponseCode: () => state.code, getContentText: () => JSON.stringify(state.body) };
    } },
    BITPANDA_ON_EDIT: (e) => { edits.push(e); return state.handled; },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const ss = { getSheetByName: (n) => sheets[n] || null };
  return { run: () => ctx._wcoreCheckTradeAck_(ss), state, posts, edits };
}

test('crypto acknowledgement runs the U2 refresh path once, as an installable-trigger event', () => {
  const h = harness();
  h.state.body = { ok: true, categories: ['crypto'] };
  const out = h.run();
  assert.equal(out.reason, 'REFRESHED');
  assert.deepEqual(out.refreshed, ['crypto']);
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0].url, API + '/api/gsheet/trade-ack/take');
  assert.equal(h.posts[0].options.headers['x-gsheet-token'], TOKEN);
  assert.equal(h.edits.length, 1);
  assert.deepEqual({ sheet: h.edits[0].range.sheet, a: h.edits[0].range.a }, { sheet: 'Portefeuille Crypto', a: 'U2' });
  assert.equal(h.edits[0].value, 'TRUE');
  assert.ok(h.edits[0].triggerUid, 'T2 and U2 paths require an installable-trigger uid');
});

test('action acknowledgement targets T2 of Portefeuille Action; both categories run both', () => {
  const h = harness();
  h.state.body = { ok: true, categories: ['action', 'crypto'] };
  const out = h.run();
  assert.deepEqual(out.refreshed, ['action', 'crypto']);
  assert.deepEqual(h.edits.map((e) => ({ sheet: e.range.sheet, a: e.range.a })), [
    { sheet: 'Portefeuille Action', a: 'T2' },
    { sheet: 'Portefeuille Crypto', a: 'U2' },
  ]);
});

test('nothing waiting, API error, no response, no config: no refresh', () => {
  const none = harness();
  assert.equal(none.run().reason, 'NONE');
  assert.equal(none.edits.length, 0);

  const err = harness();
  err.state.code = 503;
  assert.equal(err.run().reason, 'HTTP_503');
  assert.equal(err.edits.length, 0);

  const down = harness();
  down.state.code = null;
  assert.equal(down.run().reason, 'NO_RESPONSE');
  assert.equal(down.edits.length, 0);

  const bare = harness({ props: {} });
  assert.equal(bare.run().reason, 'NO_API');
  assert.equal(bare.posts.length, 0);
});

test('a refresh already queued (manual tick or earlier ack) is not doubled: no second CEX batch', () => {
  const h = harness();
  h.state.body = { ok: true, categories: ['crypto', 'action'] };
  h.state.status['Portefeuille Crypto!V2'] = 'QUEUED: 14/11 12:00';
  const out = h.run();
  assert.deepEqual(out.skipped, ['crypto']);
  assert.deepEqual(out.refreshed, ['action']);
  assert.equal(h.edits.length, 1);
  assert.equal(h.edits[0].range.sheet, 'Portefeuille Action');

  const all = harness();
  all.state.body = { ok: true, categories: ['crypto'] };
  all.state.status['Portefeuille Crypto!V2'] = '  queued: x';
  assert.equal(all.run().reason, 'ALREADY_QUEUED');
  assert.equal(all.edits.length, 0);

  const done = harness();
  done.state.body = { ok: true, categories: ['crypto'] };
  done.state.status['Portefeuille Crypto!V2'] = 'KRAKEN OK: 14/11 11:00';
  assert.equal(done.run().reason, 'REFRESHED');
});

test('jobs still waiting in the CEX queue block a second batch even when the status already reads OK', () => {
  const queue = JSON.stringify([{ kind: 'OKX', statusSheetName: 'Portefeuille Crypto', statusCell: 'V2' }]);
  const h = harness({ props: { WCORE_WEB_API_URL: API + '/', GSHEET_API_TOKEN: TOKEN, CEX_MANUAL_JOB_QUEUE: queue } });
  h.state.body = { ok: true, categories: ['crypto', 'action'] };
  h.state.status['Portefeuille Crypto!V2'] = 'BINANCE OK: 14/11 11:00';
  const out = h.run();
  assert.deepEqual(out.skipped, ['crypto']);
  assert.deepEqual(out.refreshed, ['action']);
  // Last job running: it has left the queue but the worker marker is still set (empty queue, status OK).
  const running = harness({ props: { WCORE_WEB_API_URL: API + '/', GSHEET_API_TOKEN: TOKEN, CEX_MANUAL_JOB_QUEUE: '[]', CEX_MANUAL_ACTIVE_UNTIL_MS: String(Date.now() + 60000) } });
  running.state.body = { ok: true, categories: ['crypto'] };
  running.state.status['Portefeuille Crypto!V2'] = 'KRAKEN OK: 14/11 11:00';
  assert.equal(running.run().reason, 'ALREADY_QUEUED');
  assert.equal(running.edits.length, 0);
  const expired = harness({ props: { WCORE_WEB_API_URL: API + '/', GSHEET_API_TOKEN: TOKEN, CEX_MANUAL_ACTIVE_UNTIL_MS: String(Date.now() - 1000) } });
  expired.state.body = { ok: true, categories: ['crypto'] };
  assert.equal(expired.run().reason, 'REFRESHED');
  const broken = harness({ props: { WCORE_WEB_API_URL: API + '/', GSHEET_API_TOKEN: TOKEN, CEX_MANUAL_JOB_QUEUE: '{not json' } });
  broken.state.body = { ok: true, categories: ['crypto'] };
  assert.equal(broken.run().reason, 'REFRESHED');
});

test('unknown categories are ignored and an unhandled refresh is reported, not retried', () => {
  const h = harness();
  h.state.body = { ok: true, categories: ['other', 'crypto'] };
  h.state.handled = false;
  const out = h.run();
  assert.equal(out.reason, 'NOT_HANDLED');
  assert.equal(out.taken, 1);
  assert.equal(h.posts.length, 1, 'no second call: a take is at most once');
  assert.equal(h.edits.length, 1);
});

test('the watchdog calls the check right after the strat alert, guarded', () => {
  const a = REFRESH.indexOf('stats.stratAlert = _wcoreCheckStratAlert_(ss)');
  const b = REFRESH.indexOf('stats.tradeAck = _wcoreCheckTradeAck_(ss)');
  assert.ok(a > 0 && b > a);
  assert.match(REFRESH.slice(a, b), /catch \(eStratAlert\)/);
  assert.match(REFRESH.slice(b, b + 200), /catch \(eTradeAck\)/);
});
