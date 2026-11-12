// v4.17.0 - Phone alert (ntfy) when a Strat control cell turns to X (16C_STRAT_ALERT.gs).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', '16C_STRAT_ALERT.gs'), 'utf8');
const REFRESH = fs.readFileSync(path.join(__dirname, '..', 'src', '16_REFRESH.gs'), 'utf8');
const TOPIC = 'test-topic-abcdef123';

// Strat!AY1:BQ1 is 19 cells: AY1 at 0, BE1 at 6, BK1 at 12, BQ1 at 18.
function stratRow(cells) {
  const row = new Array(19).fill('');
  const at = { AY1: 0, BE1: 6, BK1: 12, BQ1: 18 };
  for (const k of Object.keys(at)) row[at[k]] = cells[k] || 'V';
  return row;
}

function harness(opts = {}) {
  const store = new Map(Object.entries(opts.props || { WCORE_NTFY_TOPIC: TOPIC }));
  const posts = [];
  const state = { strat: stratRow({}), trade: { 'Portefeuille Crypto': ['SOMI', '>', 'ETH'], 'Portefeuille Action': ['AAA', '>', 'BBB'] }, code: 200 };
  const sheet = (name) => {
    if (name === 'Strat') return { getRange: (r) => { assert.equal(r, 'AY1:BQ1'); return { getValues: () => [state.strat] }; } };
    if (state.trade[name]) return { getRange: () => ({ getValues: () => [state.trade[name]] }) };
    return null;
  };
  const ctx = {
    JSON, Object, String, Number, Math,
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (store.has(k) ? store.get(k) : null),
      setProperty: (k, v) => store.set(k, v),
    }) },
    HTTP: { post: (url, payload, options) => {
      posts.push({ url, payload, options });
      if (state.code === null) return null;
      return { getResponseCode: () => state.code };
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const ss = { getSheetByName: sheet };
  return { run: () => ctx._wcoreCheckStratAlert_(ss), state, posts, store };
}

test('the watchdog calls the check, guarded, right after opening the spreadsheet', () => {
  assert.ok(/_wcoreCheckStratAlert_\(ss\)/.test(REFRESH));
  const i = REFRESH.indexOf('stats.stratAlert = _wcoreCheckStratAlert_(ss)');
  assert.ok(i > REFRESH.indexOf('const ss = _wcoreGetSpreadsheet_();') && i < REFRESH.indexOf('const recap = ss.getSheetByName(RECAP_SHEET_NAME);'));
});

test('no topic, no call', () => {
  const h = harness({ props: {} });
  assert.equal(h.run().reason, 'NO_TOPIC');
  assert.equal(h.posts.length, 0);
});

test('the first observation never notifies, even with a cell already at X', () => {
  const h = harness();
  h.state.strat = stratRow({ AY1: 'X' });
  assert.equal(h.run().reason, 'INIT');
  assert.equal(h.posts.length, 0);
  assert.equal(h.run().reason, 'NO_NEW_X');
  assert.equal(h.posts.length, 0);
});

test('a cell going from V to X sends one generic notification, once', () => {
  const h = harness();
  h.run();
  h.state.strat = stratRow({ AY1: 'X' });
  const out = h.run();
  assert.equal(out.reason, 'SENT');
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0].url, 'https://ntfy.sh/' + TOPIC);
  assert.equal(h.posts[0].payload, 'WCORE : rééquilibrage Crypto à faire : alléger SOMI, renforcer ETH.');
  assert.equal(h.posts[0].options.headers.Title, 'WCORE');
  h.run();
  assert.equal(h.posts.length, 1, 'still X: no repeat');
  h.state.strat = stratRow({});
  h.run();
  h.state.strat = stratRow({ AY1: 'X' });
  h.run();
  assert.equal(h.posts.length, 2, 'back to V re-arms the alert');
});

test('several new X are grouped, with the trade for a rebalancing only', () => {
  const h = harness();
  h.run();
  h.state.strat = stratRow({ AY1: 'X', BE1: 'X', BK1: 'X' });
  h.run();
  assert.equal(h.posts[0].payload, 'WCORE : rééquilibrage Crypto à faire : alléger SOMI, renforcer ETH ; rééquilibrage Action à faire : alléger AAA, renforcer BBB ; un onglet du portefeuille est en erreur.');
});

test('an unreadable or odd trade cell falls back to the category alone, never an amount', () => {
  const h = harness();
  h.state.trade['Portefeuille Crypto'] = ['1 234,56 €', '>', 'ETH'];
  h.run();
  h.state.strat = stratRow({ AY1: 'X' });
  h.run();
  assert.equal(h.posts[0].payload, 'WCORE : rééquilibrage Crypto à faire.');
});

test('a failed or refused send keeps the old state and retries next pass', () => {
  for (const code of [500, null]) {
    const h = harness();
    h.run();
    h.state.strat = stratRow({ AY1: 'X' });
    h.state.code = code;
    assert.notEqual(h.run().reason, 'SENT');
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
  assert.equal(h.run().reason, 'SENT', 'V kept through the unreadable pass, so V -> X still alerts');
});

test('the trade reads symbols only, never the gap column', () => {
  assert.ok(/getRange\("Q1:S1"\)/.test(SRC) && !/P1:P|P3:P|getRange\("P/.test(SRC));
});

test('the real HTTP.post makes no transport when the quota breaker refuses', () => {
  const httpSrc = fs.readFileSync(path.join(__dirname, '..', 'src', '03_HTTP.gs'), 'utf8');
  let fetches = 0;
  const ctx = { Logger: { log: () => {} }, UrlFetchApp: { fetch: () => { fetches++; return { getResponseCode: () => 200 }; } }, JSON, Math, Object, String, Number, Date };
  vm.createContext(ctx);
  vm.runInContext(httpSrc + '\nthis.__HTTP = (typeof HTTP !== "undefined") ? HTTP : Http;', ctx);
  const HTTP = ctx.__HTTP;
  HTTP.canFetchNow = () => false;
  assert.equal(HTTP.post('https://ntfy.sh/' + TOPIC, 'x', { muteHttpExceptions: true }), null);
  assert.equal(fetches, 0);
  HTTP.canFetchNow = () => true;
  HTTP._record = () => {};
  HTTP.post('https://ntfy.sh/' + TOPIC, 'x', { muteHttpExceptions: true, timeoutMs: 5000 });
  assert.equal(fetches, 1);
});
