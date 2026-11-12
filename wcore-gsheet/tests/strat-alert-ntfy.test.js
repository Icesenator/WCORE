// v4.17.2 - Rebalancing alert of Strat, relayed by the WCORE API (16C_STRAT_ALERT.gs).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', '16C_STRAT_ALERT.gs'), 'utf8');
const REFRESH = fs.readFileSync(path.join(__dirname, '..', 'src', '16_REFRESH.gs'), 'utf8');
const API = 'https://api.example.test';
const TOKEN = 'secret-token';

// Strat!AY1:BE1 is 7 cells: AY1 at 0, BE1 at 6.
function stratRow(cells) {
  const row = new Array(7).fill('');
  row[0] = cells.AY1 || 'V';
  row[6] = cells.BE1 || 'V';
  return row;
}

function harness(opts = {}) {
  const store = new Map(Object.entries(opts.props || { WCORE_WEB_API_URL: API + '/', GSHEET_API_TOKEN: TOKEN }));
  const posts = [];
  const state = { strat: stratRow({}), code: 200,
    trade: { 'Portefeuille Crypto': ['SOMI', '>', 'ETH'], 'Portefeuille Action': ['AAA', '>', 'BBB'] },
    gaps: {
      'Portefeuille Crypto': [[4.02, 'x', ''], [21.4, 'SOMI', 'V'], [-1234.6, 'ETH', 'X']],
      'Portefeuille Action': [[30, 'AAA', 'V'], [-12.2, 'BBB', 'X']],
    } };
  const sheet = (name) => {
    if (name === 'Strat') return { getRange: (r) => { assert.equal(r, 'AY1:BE1'); return { getValues: () => [state.strat] }; } };
    if (state.trade[name]) return {
      getLastRow: () => 2 + (state.gaps[name] || []).length,
      getRange: (a) => (a === 'Q1:S1' ? { getValues: () => [state.trade[name]] } : { getValues: () => state.gaps[name] || [] }),
    };
    return null;
  };
  let clock = 1794470000000;
  const ctx = {
    JSON, Object, String, Number, Math, isFinite,
    Date: { now: () => clock },
    Logger: { log: () => {} },
    LockService: { getScriptLock: () => ({ tryLock: () => !state.locked, releaseLock: () => { state.released = (state.released || 0) + 1; } }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (store.has(k) ? store.get(k) : null),
      setProperty: (k, v) => store.set(k, v),
      deleteProperty: (k) => store.delete(k),
    }) },
    HTTP: { post: (url, payload, options) => {
      posts.push({ url, payload: JSON.parse(JSON.stringify(payload)), options });
      if (state.code === null) return null;
      return { getResponseCode: () => state.code };
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const ss = { getSheetByName: sheet };
  return { ctx, run: () => ctx._wcoreCheckStratAlert_(ss), state, posts, store, tick: (ms) => { clock += ms; } };
}

const noOcc = (p) => { const c = { ...p }; delete c.occurrence; return c; };

test('the watchdog calls the check, guarded, right after opening the spreadsheet', () => {
  const i = REFRESH.indexOf('stats.stratAlert = _wcoreCheckStratAlert_(ss)');
  assert.ok(i > REFRESH.indexOf('const ss = _wcoreGetSpreadsheet_();') && i < REFRESH.indexOf('const recap = ss.getSheetByName(RECAP_SHEET_NAME);'));
});

test('the workbook never calls ntfy itself and never holds the topic', () => {
  assert.ok(!/ntfy\.sh/.test(SRC.replace(/^\s*\*.*$/gm, '')), 'no ntfy URL outside comments');
  assert.ok(!/getProperty\("WCORE_NTFY_TOPIC"\)/.test(SRC));
});

test('no API configuration, no call', () => {
  const h = harness({ props: {} });
  assert.equal(h.run().reason, 'NO_API');
  assert.equal(h.posts.length, 0);
});

test('the first observation never notifies, even with a cell already at X', () => {
  const h = harness();
  h.state.strat = stratRow({ AY1: 'X' });
  assert.equal(h.run().reason, 'INIT');
  assert.equal(h.run().reason, 'NO_NEW_X');
  assert.equal(h.posts.length, 0);
});

test('a crypto rebalancing posts a structured event with the trade and its amounts, once', () => {
  const h = harness();
  h.run();
  h.state.strat = stratRow({ AY1: 'X' });
  assert.equal(h.run().reason, 'SENT');
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0].url, API + '/api/gsheet/notify');
  assert.equal(h.posts[0].options.headers['x-gsheet-token'], TOKEN);
  assert.deepEqual(noOcc(h.posts[0].payload), { event: 'strat_rebalance', category: 'crypto', sell: { symbol: 'SOMI', eur: 21 }, buy: { symbol: 'ETH', eur: 1235 } });
  assert.match(h.posts[0].payload.occurrence, /^AY1-\d+$/);
  h.run();
  assert.equal(h.posts.length, 1, 'still X: no repeat');
  h.state.strat = stratRow({});
  h.run();
  h.state.strat = stratRow({ AY1: 'X' });
  h.run();
  assert.equal(h.posts.length, 2, 'back to V re-arms the alert');
});

test('both rebalancings post one event each', () => {
  const h = harness();
  h.run();
  h.state.strat = stratRow({ AY1: 'X', BE1: 'X' });
  assert.equal(h.run().sent, 2);
  assert.deepEqual(h.posts.map((p) => p.payload.category), ['crypto', 'action']);
  assert.deepEqual(h.posts[1].payload.sell, { symbol: 'AAA', eur: 30 });
});

test('an odd trade sends the category alone; an unreadable gap sends the symbols alone', () => {
  const h = harness();
  h.state.trade['Portefeuille Crypto'] = ['1 234,56 €', '>', 'ETH'];
  h.run();
  h.state.strat = stratRow({ AY1: 'X' });
  h.run();
  assert.deepEqual(noOcc(h.posts[0].payload), { event: 'strat_rebalance', category: 'crypto' });
  const g = harness();
  g.state.gaps['Portefeuille Crypto'] = [['n/a', 'SOMI', 'V'], [5, 'ETH', 'X']];
  g.run();
  g.state.strat = stratRow({ AY1: 'X' });
  g.run();
  assert.deepEqual(noOcc(g.posts[0].payload), { event: 'strat_rebalance', category: 'crypto', sell: { symbol: 'SOMI' }, buy: { symbol: 'ETH' } });
});

test('a refused or failed post keeps the cell at V and retries next pass', () => {
  for (const code of [409, 429, 502, null]) {
    const h = harness();
    h.run();
    h.state.strat = stratRow({ AY1: 'X' });
    h.state.code = code;
    assert.equal(h.run().reason, 'PARTIAL_OR_FAILED');
    h.state.code = 200;
    assert.equal(h.run().reason, 'SENT', 'retried');
    assert.equal(h.posts.length, 2);
  }
});

test('an unreadable cell keeps its old state and never notifies', () => {
  const h = harness();
  h.run();
  h.state.strat = stratRow({ AY1: '#REF!' });
  assert.equal(h.run().reason, 'NO_NEW_X');
  h.state.strat = stratRow({ AY1: 'X' });
  assert.equal(h.run().reason, 'SENT');
});

test('clear removes the old topic property; the test event goes through the API', () => {
  const h = harness({ props: { WCORE_WEB_API_URL: API, GSHEET_API_TOKEN: TOKEN, WCORE_NTFY_TOPIC: 'old-topic-123456' } });
  assert.equal(h.ctx.WCORE_NTFY_CLEAR_TOPIC().ok, true);
  assert.equal(h.store.has('WCORE_NTFY_TOPIC'), false);
  assert.equal(h.ctx.WCORE_NTFY_TEST().ok, true);
  assert.deepEqual(h.posts[0].payload, { event: 'test' });
});

test('the real HTTP.post makes no transport when the quota breaker refuses', () => {
  const httpSrc = fs.readFileSync(path.join(__dirname, '..', 'src', '03_HTTP.gs'), 'utf8');
  let fetches = 0;
  const ctx = { Logger: { log: () => {} }, UrlFetchApp: { fetch: () => { fetches++; return { getResponseCode: () => 200 }; } }, JSON, Math, Object, String, Number, Date };
  vm.createContext(ctx);
  vm.runInContext(httpSrc + '\nthis.__HTTP = (typeof HTTP !== "undefined") ? HTTP : Http;', ctx);
  const HTTP = ctx.__HTTP;
  HTTP.canFetchNow = () => false;
  assert.equal(HTTP.post(API + '/api/gsheet/notify', { event: 'test' }, { muteHttpExceptions: true }), null);
  assert.equal(fetches, 0);
});

test('a retry reuses the same occurrence; a new transition gets a new one', () => {
  const h = harness();
  h.run();
  h.state.strat = stratRow({ AY1: 'X' });
  h.state.code = 409;
  h.run();
  h.tick(600000);
  h.state.code = 200;
  h.state.gaps['Portefeuille Crypto'][1][0] = 25.7; // prices moved
  h.run();
  assert.equal(h.posts.length, 2);
  assert.equal(h.posts[0].payload.occurrence, h.posts[1].payload.occurrence, 'same occurrence on retry');
  assert.equal(h.posts[1].payload.sell.eur, 26, 'fresh amounts');
  assert.deepEqual(JSON.parse(h.store.get('WCORE_STRAT_ALERT_LAST')).occ, {}, 'delivered: no pending occurrence');
  h.state.strat = stratRow({});
  h.run();
  h.tick(60000);
  h.state.strat = stratRow({ AY1: 'X' });
  h.run();
  assert.equal(h.posts.length, 3);
  assert.notEqual(h.posts[2].payload.occurrence, h.posts[1].payload.occurrence, 'new transition within 30 min: new occurrence, so a new alert');
});

test('a busy lock skips the pass without touching the state; the lock is always released', () => {
  const h = harness();
  h.run();
  assert.equal(h.state.released, 1);
  const before = h.store.get('WCORE_STRAT_ALERT_LAST');
  h.state.locked = true;
  h.state.strat = stratRow({ AY1: 'X' });
  assert.equal(h.run().reason, 'LOCKED');
  assert.equal(h.store.get('WCORE_STRAT_ALERT_LAST'), before);
  assert.equal(h.posts.length, 0);
  h.state.locked = false;
  assert.equal(h.run().reason, 'SENT');
});
