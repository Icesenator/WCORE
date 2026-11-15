// Recap lines proposed in the rebalancing notification, and "Trade fait" refreshing only those lines.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', '16C_STRAT_ALERT.gs'), 'utf8');
const API = 'https://api.example.test';
const TOKEN = 'secret-token';

// A detail tab: row 1 = flags, row 2 = headers, then data (like the real tabs).
function tab(kind, rows) {
  const head = kind === 'cex' ? ['cryptocoin_symbol', 'balance', 'source', 'updated_at', 'value_eur', 'Vérif']
    : ['chain_name', 'token_ticker', 'token_name', 'contract_address', 'balance', 'price_eur', 'value_eur', 'Vérif'];
  const symCol = kind === 'cex' ? 0 : 1, valCol = kind === 'cex' ? 4 : 6;
  const data = [new Array(head.length).fill('')].concat([head]).concat(rows.map(([sym, eur]) => {
    const r = new Array(head.length).fill('');
    r[symCol] = sym; r[valCol] = eur;
    return r;
  }));
  return { data };
}

function harness(opts = {}) {
  const props = Object.assign({ WCORE_WEB_API_URL: API + '/', GSHEET_API_TOKEN: TOKEN }, opts.props || {});
  const store = new Map(Object.entries(props));
  const calls = { onEdit: [], reads: 0, tabLookups: [] };
  const tabs = opts.tabs || {};
  const recapNames = opts.recap || Object.keys(tabs);
  const makeSheet = (name) => {
    if (name === 'Recap Portfolio') {
      return {
        getLastRow: () => recapNames.length + 1,
        getRange: (r, c, n) => ({ getValues: () => recapNames.slice(r - 2, r - 2 + n).map((x) => [x]) }),
      };
    }
    const t = tabs[name];
    if (!t) return null;
    return {
      getName: () => name,
      getLastRow: () => t.data.length,
      getLastColumn: () => t.data[0].length,
      getRange: (r, c, nr, nc) => {
        if (typeof r === 'string') return { sheet: name, a: r };
        return { getValues: () => { calls.reads++; return t.data.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)); } };
      },
    };
  };
  const ss = { getSheetByName: (n) => { calls.tabLookups.push(n); return makeSheet(n); } };
  const state = { code: 200, body: { ok: true, categories: [], acks: [] } };
  const ctx = {
    JSON, Object, String, Number, Math, isFinite, Array, Date,
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (store.has(k) ? store.get(k) : null),
      setProperty: (k, v) => store.set(k, v),
      deleteProperty: (k) => store.delete(k),
    }) },
    HTTP: { post: () => ({ getResponseCode: () => state.code, getContentText: () => JSON.stringify(state.body) }) },
    WCORE_ON_EDIT: (e) => { calls.onEdit.push({ sheet: e.range.sheet, a: e.range.a, value: e.value, triggerUid: e.triggerUid }); },
    BITPANDA_ON_EDIT: () => { calls.onEdit.push({ batch: true }); return true; },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, ss, store, calls, state };
}

const TABS = () => ({
  'CEX - OKX': tab('cex', [['AAVE', 6], ['CRO', 16], ['ETH', 400]]),
  'Ledger - Cronos': tab('wallet', [['CRO', 3], ['CRO', 2]]),
  'Binance Web3 Wallet - Base': tab('wallet', [['ETH', 90], ['AAVE', 0.5]]),
  'CEX - Kraken Crypto': tab('cex', [['AAVE', 40]]),
  'Notes': { data: [[''], ['a', 'b'], ['x', 'y']] },
});

test('holdings are read from both tab shapes, summed per tab, and unreadable tabs are ignored', () => {
  const h = harness({ tabs: TABS() });
  const { held, tabs } = h.ctx._wcoreStratAlertHoldings_(h.ss, ['AAVE', 'CRO'], 60000);
  assert.equal(tabs, 4, 'Notes has no known header pair');
  assert.deepEqual(held.AAVE.map((x) => x.name).sort(), ['Binance Web3 Wallet - Base', 'CEX - Kraken Crypto', 'CEX - OKX']);
  assert.deepEqual(held.CRO.find((x) => x.name === 'Ledger - Cronos'), { name: 'Ledger - Cronos', eur: 5 });
  assert.equal(held.CRO.length, 2);
});

test('bad names and repeated Recap lines are never read twice, and an empty budget reads nothing', () => {
  const h = harness({ tabs: TABS(), recap: ['CEX - OKX', 'CEX - OKX', 'http://evil.test', 'bad\nname', ''] });
  const { tabs } = h.ctx._wcoreStratAlertHoldings_(h.ss, ['AAVE'], 60000);
  assert.equal(tabs, 1);
  assert.equal(h.calls.reads, 1);
  const none = harness({ tabs: TABS() });
  const cut = none.ctx._wcoreStratAlertHoldings_(none.ss, ['AAVE'], -1);
  assert.equal(cut.tabs, 0);
  assert.equal(cut.complete, false, 'a read cut by the budget is incomplete');
});

test('proposed lines: the three largest holders, "enough" when the first covers the amount, kept per occurrence', () => {
  const h = harness({ tabs: TABS() });
  const trade = { sell: { symbol: 'AAVE', eur: 21 }, buy: { symbol: 'CRO', eur: 1235 } };
  const lines = h.ctx._wcoreStratAlertLinesFor_(h.ss, 'AY1-1794470000000', trade);
  assert.deepEqual(lines.sell, ['CEX - Kraken Crypto', 'CEX - OKX', 'Binance Web3 Wallet - Base']);
  assert.equal(lines.enough, true, 'Kraken 40 covers 21');
  assert.deepEqual(lines.buy, ['CEX - OKX', 'Ledger - Cronos']);
  const again = h.ctx._wcoreStratAlertLinesFor_(h.ss, 'AY1-1794470000000', trade);
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(lines)));
  assert.equal(h.calls.reads, 4, 'a retry reuses the saved lines, no new read');
  const big = h.ctx._wcoreStratAlertLinesFor_(h.ss, 'AY1-1794470000099', { sell: { symbol: 'AAVE', eur: 500 }, buy: { symbol: 'ETH' } });
  assert.equal(big.enough, false);
});

test('no readable tab, or no trade symbols: no claim at all (never a false "no line holds it")', () => {
  const none = harness({ tabs: {} , recap: [] });
  assert.equal(none.ctx._wcoreStratAlertLinesFor_(none.ss, 'AY1-1794470000000', { sell: { symbol: 'AAVE' }, buy: { symbol: 'CRO' } }), null);
  const h = harness({ tabs: TABS() });
  assert.equal(h.ctx._wcoreStratAlertLinesFor_(h.ss, 'AY1-1794470000000', null), null);
  assert.equal(h.ctx._wcoreStratAlertLinesFor_(h.ss, 'AY1-1794470000000', { sell: { symbol: 'AAVE' } }), null);
  assert.equal(JSON.parse(h.store.get('WCORE_STRAT_ALERT_LINES') || '{}')['AY1-1794470000000'], undefined);
});

test('a symbol nobody holds gives an empty list, and the saved map is pruned (48 h, 12 entries)', () => {
  const h = harness({ tabs: TABS() });
  const trade = { sell: { symbol: 'ZZZ', eur: 5 }, buy: { symbol: 'CRO' } };
  const l = h.ctx._wcoreStratAlertLinesFor_(h.ss, 'AY1-1794470000000', trade);
  assert.deepEqual(JSON.parse(JSON.stringify(l.sell)), []);
  assert.equal(l.enough, false);
  const old = {};
  for (let i = 0; i < 15; i++) old['O' + i + '-12345678'] = { sell: ['a'], buy: [], enough: false, ts: Date.now() - i * 1000 };
  old['EXPIRED-12345678'] = { sell: ['a'], buy: [], enough: false, ts: Date.now() - 49 * 3600 * 1000 };
  h.store.set('WCORE_STRAT_ALERT_LINES', JSON.stringify(old));
  h.ctx._wcoreStratAlertLinesFor_(h.ss, 'AY1-1794470000001', trade);
  const saved = JSON.parse(h.store.get('WCORE_STRAT_ALERT_LINES'));
  assert.equal(Object.keys(saved).length, 12);
  assert.ok(saved['AY1-1794470000001'] && !saved['EXPIRED-12345678']);
});

function ackHarness(extra = {}) {
  const h = harness(Object.assign({ tabs: TABS() }, extra));
  const lines = { sell: ['CEX - OKX', 'Binance Web3 Wallet - Base'], buy: ['Ledger - Cronos'], enough: true, ts: Date.now() };
  h.store.set('WCORE_STRAT_ALERT_LINES', JSON.stringify({ 'AY1-1794470000000': lines, 'AY1-1794470000050': { sell: ['CEX - OKX'], buy: [], enough: false, ts: Date.now() } }));
  return h;
}

test('an acknowledgement refreshes exactly the lines proposed in its notification, through the A1 path of each tab', () => {
  const h = ackHarness();
  h.state.body = { ok: true, categories: ['crypto'], acks: [{ category: 'crypto', occurrence: 'AY1-1794470000000' }] };
  const out = h.ctx._wcoreCheckTradeAck_(h.ss);
  assert.equal(out.reason, 'LINES_REFRESHED');
  assert.deepEqual(out.lines, ['CEX - OKX', 'Binance Web3 Wallet - Base', 'Ledger - Cronos']);
  assert.deepEqual(h.calls.onEdit, [
    { sheet: 'CEX - OKX', a: 'A1', value: 'TRUE', triggerUid: 'TRADE_ACK_LINE' },
    { sheet: 'Binance Web3 Wallet - Base', a: 'A1', value: 'TRUE', triggerUid: 'TRADE_ACK_LINE' },
    { sheet: 'Ledger - Cronos', a: 'A1', value: 'TRUE', triggerUid: 'TRADE_ACK_LINE' },
  ]);
  assert.ok(!h.calls.onEdit.some((c) => c.batch), 'the category batch is not run');
});

test('two acknowledgements share their lines once; one without saved lines keeps the category batch', () => {
  const h = ackHarness();
  h.state.body = { ok: true, categories: ['crypto', 'action'], acks: [
    { category: 'crypto', occurrence: 'AY1-1794470000000' },
    { category: 'crypto', occurrence: 'AY1-1794470000050' },
    { category: 'action', occurrence: 'BE1-1794470000077' },
  ] };
  const out = h.ctx._wcoreCheckTradeAck_(h.ss);
  assert.deepEqual(out.lines, ['CEX - OKX', 'Binance Web3 Wallet - Base', 'Ledger - Cronos'], 'CEX - OKX only once');
  assert.equal(h.calls.onEdit.filter((c) => c.sheet === 'CEX - OKX').length, 1);
  // The action acknowledgement has no saved lines: the Portefeuille Action batch path is used (its sheet is absent here).
  assert.ok(out.taken >= 2);
});

test('older answers without acks, and acknowledgements of a test notification, keep the category batch', () => {
  const legacy = ackHarness();
  legacy.state.body = { ok: true, categories: ['crypto'] };
  const a = legacy.ctx._wcoreCheckTradeAck_(legacy.ss);
  assert.deepEqual(a.lines, []);
  const test1 = ackHarness();
  test1.state.body = { ok: true, categories: ['crypto'], acks: [{ category: 'crypto', occurrence: 'TEST-1794470000000-123' }] };
  const b = test1.ctx._wcoreCheckTradeAck_(test1.ss);
  assert.deepEqual(b.lines, []);
  assert.equal(h2(b), 'no-lines');
  function h2(x) { return x.lines.length ? 'lines' : 'no-lines'; }
});

test('Kraken lines are skipped right after a Kraken call or during a pause, kept otherwise', () => {
  const mk = (props, extraCtx) => {
    const h = harness({ tabs: TABS(), props });
    h.store.set('WCORE_STRAT_ALERT_LINES', JSON.stringify({ 'AY1-1794470000000': { sell: ['CEX - Kraken Crypto', 'CEX - OKX'], buy: [], enough: false, ts: Date.now() } }));
    h.state.body = { ok: true, categories: ['crypto'], acks: [{ category: 'crypto', occurrence: 'AY1-1794470000000' }] };
    h.ctx.KRAKEN_SYNC_CONFIG = { SHARED_OK_PROP: 'K_SHARED' };
    if (extraCtx) extraCtx(h);
    return h;
  };
  const recent = mk({ K_SHARED: String(Date.now() - 60000) });
  const r1 = recent.ctx._wcoreCheckTradeAck_(recent.ss);
  assert.deepEqual(r1.lines, ['CEX - OKX']);
  assert.deepEqual(r1.linesSkipped, ['CEX - Kraken Crypto']);
  const paused = mk({}, (h) => { h.ctx._krakenLockoutUntilMs_ = () => Date.now() + 600000; });
  assert.deepEqual(paused.ctx._wcoreCheckTradeAck_(paused.ss).lines, ['CEX - OKX']);
  const fine = mk({ K_SHARED: String(Date.now() - 20 * 60000) });
  assert.deepEqual(fine.ctx._wcoreCheckTradeAck_(fine.ss).lines, ['CEX - Kraken Crypto', 'CEX - OKX']);
});

test('a missing tab or a failing handler skips that line only', () => {
  const h = ackHarness();
  h.store.set('WCORE_STRAT_ALERT_LINES', JSON.stringify({ 'AY1-1794470000000': { sell: ['CEX - OKX', 'Gone Tab', 'Ledger - Cronos'], buy: [], enough: false, ts: Date.now() } }));
  h.state.body = { ok: true, categories: ['crypto'], acks: [{ category: 'crypto', occurrence: 'AY1-1794470000000' }] };
  h.ctx.WCORE_ON_EDIT = (e) => { if (e.range.sheet === 'Ledger - Cronos') throw new Error('x'); };
  const out = h.ctx._wcoreCheckTradeAck_(h.ss);
  assert.deepEqual(out.lines, ['CEX - OKX']);
  assert.deepEqual(out.linesSkipped, ['Gone Tab', 'Ledger - Cronos']);
});

test('names that are not plain tab names are never refreshed', () => {
  const h = ackHarness();
  h.store.set('WCORE_STRAT_ALERT_LINES', JSON.stringify({ 'AY1-1794470000000': { sell: ['../x', 'CEX - OKX', 'a\nb'], buy: [], enough: false, ts: Date.now() } }));
  h.state.body = { ok: true, categories: ['crypto'], acks: [{ category: 'crypto', occurrence: 'AY1-1794470000000' }] };
  assert.deepEqual(h.ctx._wcoreCheckTradeAck_(h.ss).lines, ['CEX - OKX']);
});

test('the manual preview returns the proposed lines and the read time, and refuses odd symbols', () => {
  const h = harness({ tabs: TABS() });
  h.ctx._wcoreGetSpreadsheet_ = () => h.ss;
  const r = h.ctx.WCORE_STRAT_ALERT_LINES_PREVIEW('aave', 'cro');
  assert.equal(r.ok, true);
  assert.equal(r.tabs, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(r.sell)), ['CEX - Kraken Crypto', 'CEX - OKX', 'Binance Web3 Wallet - Base']);
  assert.deepEqual(JSON.parse(JSON.stringify(r.buy)), ['CEX - OKX', 'Ledger - Cronos']);
  assert.equal(h.store.get('WCORE_STRAT_ALERT_LINES'), undefined, 'nothing is saved');
  assert.deepEqual(JSON.parse(JSON.stringify(h.ctx.WCORE_STRAT_ALERT_LINES_PREVIEW('a b', 'cro'))), { ok: false, reason: 'BAD_SYMBOL' });
});

test('an incomplete read (missing tab, failed read, budget) proposes nothing rather than a wrong list', () => {
  const trade = { sell: { symbol: 'AAVE', eur: 21 }, buy: { symbol: 'CRO' } };
  const gone = harness({ tabs: TABS(), recap: ['CEX - OKX', 'Ledger - Cronos', 'Deleted Tab'] });
  assert.equal(gone.ctx._wcoreStratAlertLinesFor_(gone.ss, 'AY1-1794470000000', trade), null);
  assert.equal(gone.store.get('WCORE_STRAT_ALERT_LINES'), undefined, 'nothing saved for an alert sent without lines');
  const broken = harness({ tabs: TABS() });
  const real = broken.ss.getSheetByName;
  broken.ss.getSheetByName = (n) => {
    const sh = real(n);
    if (n === 'Ledger - Cronos') sh.getRange = () => { throw new Error('read failed'); };
    return sh;
  };
  assert.equal(broken.ctx._wcoreStratAlertLinesFor_(broken.ss, 'AY1-1794470000000', trade), null);
  const ok = harness({ tabs: TABS() });
  assert.ok(ok.ctx._wcoreStratAlertLinesFor_(ok.ss, 'AY1-1794470000000', trade));
});

test('lines that cannot be saved are not proposed (the acknowledgement could not find them again)', () => {
  const h = harness({ tabs: TABS() });
  h.ctx.PropertiesService = { getScriptProperties: () => ({
    getProperty: () => null,
    setProperty: () => { throw new Error('quota'); },
  }) };
  assert.equal(h.ctx._wcoreStratAlertLinesFor_(h.ss, 'AY1-1794470000000', { sell: { symbol: 'AAVE', eur: 21 }, buy: { symbol: 'CRO' } }), null);
});
