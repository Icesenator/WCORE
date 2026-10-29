const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.WCORE_STATUS_CANDIDATE
  ? path.join(process.env.WCORE_STATUS_CANDIDATE, '16_REFRESH.js')
  : path.join(__dirname, '../src/16_REFRESH.gs'), 'utf8');
function extract(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw Error(name);
}
function helpers() {
  const ctx = { _wd_norm_: s => String(s).trim(), _wd_isBlocked_: () => ({ blocked: false }),
    _wd_isLastUpdateFormat_: s => /^2026-10-22 /.test(s),
    _wd_parseLocalDateTimeToMs_: s => Date.parse(s.replace(' ', 'T') + 'Z') };
  vm.createContext(ctx);
  vm.runInContext(extract('_wd_extractTimestamp_') + '\n' + extract('_wd_needsRefresh_'), ctx);
  return ctx;
}
for (const marker of ['REFRESH_QUEUED', 'REFRESH_COOLDOWN', 'REFRESH_QUEUE_FULL', 'REFRESH_QUEUE_ERROR', 'REFRESH_QUEUE_DEFERRED', 'REFRESH_NOT_DUE']) {
  test(marker + ' remains pending for natural watchdog admission, never completed', () => {
    const h = helpers();
    const r = h._wd_needsRefresh_('asset', '[' + marker + '] [AGE_UNKNOWN]', Date.now(), 18000000, '');
    assert.equal(r.needsPulse, true);
    assert.equal(r.useBlockedCooldown, false);
    assert.notEqual(r.reason, 'ok');
    const dated = h._wd_needsRefresh_('asset', '[' + marker + '] 2026-10-22 11:43:34', Date.parse('2026-10-22T11:43:35Z'), 18000000, '');
    assert.equal(dated.needsPulse, true, 'a known recent cache date is not scan completion');
    assert.equal(dated.useBlockedCooldown, false);
    assert.notEqual(dated.reason, 'ok');
    assert.equal(h._wd_extractTimestamp_('[' + marker + '] 2026-10-22 11:43:34'), '2026-10-22 11:43:34');
  });
}
test('pending queue markers never synchronize J1 as a successful scan', () => {
  const ctx = { _wd_norm_: s => String(s).trim() };
  vm.createContext(ctx);
  vm.runInContext(extract('_wd_isUnsafeLatchSource_'), ctx);
  for (const marker of ['REFRESH_QUEUED', 'REFRESH_COOLDOWN', 'REFRESH_QUEUE_FULL', 'REFRESH_QUEUE_ERROR', 'REFRESH_QUEUE_DEFERRED', 'REFRESH_NOT_DUE']) {
    assert.equal(ctx._wd_isUnsafeLatchSource_('[' + marker + '] 2026-10-22 11:43:34'), true);
  }
});

test('Sheets API fallback also drains pending work before persisting diagnostics', () => {
  const fn = extract('_wd_watchdogFromRecapViaSheetsApi_');
  const drain = fn.indexOf('_webScanQueueDrain_({');
  assert.ok(drain >= 0);
  assert.ok(fn.indexOf('JSON.stringify(stats)') > drain);
});

test('drain diagnostics are persisted after drain and include measured outcomes and duration', () => {
  const fn = extract('WATCHDOG_FROM_RECAP');
  const drain = fn.indexOf('_webScanQueueDrain_({');
  const persist = fn.indexOf('var diagJsonOut = JSON.stringify(diagOut)');
  assert.ok(drain >= 0 && persist > drain);
  assert.match(fn.slice(drain, persist), /stats\.scanQueueOutcomes/);
  assert.match(fn.slice(drain, persist), /stats\.exec_ms = Date\.now\(\) - t0/);
});
