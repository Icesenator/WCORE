const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const quotaSource = fs.readFileSync(path.join(root, 'src/03E_QUOTA_CIRCUIT_BREAKER.gs'), 'utf8');
const stockSource = fs.readFileSync(path.join(root, 'src/42_STOCK_PORTFOLIO.gs'), 'utf8');
const cryptoSource = fs.readFileSync(path.join(root, 'src/43_CRYPTO_PORTFOLIO.gs'), 'utf8');

function balancedBody(source, bodyStart, name) {
  let depth = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (inLineComment) { if (ch === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (ch === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inString) {
      if (ch === '\\') { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === '"' || ch === '\'' || ch === '`') { inString = ch; continue; }
    if (ch === '/' && /[,(=:[!&|?]/.test(source.slice(0, i).replace(/\s+$/, '').slice(-1))) {
      let j = i + 1;
      let cls = false;
      for (; j < source.length; j++) {
        if (source[j] === '\\') { j++; continue; }
        if (source[j] === '[') cls = true;
        if (source[j] === ']' && cls) cls = false;
        if (source[j] === '/' && !cls) break;
      }
      i = j;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return i;
  }
  throw new Error(`${name} body not closed`);
}

function extractIife(source, name) {
  const marker = `var ${name} =`;
  const start = source.indexOf(marker);
  assert.notStrictEqual(start, -1, `${name} not found`);
  const bodyStart = source.indexOf('{', start);
  const end = balancedBody(source, bodyStart, name);
  const tail = source.indexOf('\n})();', end);
  assert.notStrictEqual(tail, -1, `${name} IIFE not closed`);
  return source.slice(start, tail + '\n})();'.length);
}

function extractFunction(source, name) {
  const match = new RegExp(`\\bfunction\\s+${name}\\s*\\([^)]*\\)\\s*\\{`).exec(source);
  assert(match, `${name} not found`);
  const bodyStart = match.index + match[0].lastIndexOf('{');
  return source.slice(match.index, balancedBody(source, bodyStart, name) + 1);
}

function extractVar(source, name) {
  const match = new RegExp(`var\\s+${name}\\s*=\\s*[^;]+;`).exec(source);
  assert(match, `${name} constant not found`);
  return match[0];
}

const exemptCode = [
  extractVar(quotaSource, 'QUOTA_EXEMPT_DAILY_LIMIT'),
  extractIife(quotaSource, 'ExemptHttp'),
].join('\n');

function makeEnv(over) {
  const opts = over || {};
  const store = Object.create(null);
  const sent = [];
  const handled = [];
  const logged = [];
  const ctx = {
    Date,
    JSON,
    parseInt,
    String,
    Number,
    isFinite,
    Logger: { log: (m) => logged.push(String(m)) },
    LockService: {
      getUserLock: () => (opts.lockUnavailable
        ? null
        : { tryLock: () => !opts.lockContended, releaseLock: () => {} })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: (k) => { delete store[k]; }
      })
    },
    HttpCounter: { record: (n, cat, url) => sent.push({ counter: 'rolling', cat, url }) },
    HttpCallCounter: { increment: (url, cat) => sent.push({ counter: 'legacy', cat, url }) },
    QuotaCircuitBreaker: { handleError: (e) => { handled.push(String(e && e.message)); return true; } },
    UrlFetchApp: { fetch: null },
    _originalUrlFetch: function (url, options) {
      sent.push({ counter: 'transport', url, options });
      if (opts.throwQuota) throw new Error('Service invoked too many times for one day: urlfetch.');
      if (opts.throwOther) throw new Error('Address unavailable');
      return { code: 200, url };
    },
    _httpTelemetryTransport_: function () {
      return { fetch: ctx._originalUrlFetch, explicitTelemetry: true };
    },
    __store: store,
    __sent: sent,
    __handled: handled,
    __logged: logged
  };
  vm.createContext(ctx);
  vm.runInContext(exemptCode, ctx);
  return ctx;
}

// --- Contract 1: an exempt attempt goes through the UNPATCHED transport and is
// attributed in BOTH counters under its own slot category.
{
  const ctx = makeEnv({});
  const res = ctx.ExemptHttp.attempt('PORTFOLIO_CRYPTO', 'https://api.example/x', { method: 'get' }, 5);
  assert(res && res.code === 200, 'exempt attempt must return the real response');
  const cats = ctx.__sent.map((s) => s.cat).filter(Boolean);
  assert.deepStrictEqual(cats, ['PORTFOLIO_CRYPTO', 'PORTFOLIO_CRYPTO'],
    'both telemetry counters must record the exempt attempt under the slot category');
  assert.strictEqual(ctx.__handled.length, 0, 'a successful attempt must not touch the breaker');
}

// --- Contract 2: the daily allowance is a hard ceiling — once spent, no request
// is sent at all (this is what keeps the bypass from becoming a quota leak).
{
  const ctx = makeEnv({});
  for (let i = 0; i < 3; i++) {
    assert(ctx.ExemptHttp.attempt('PORTFOLIO_STOCK', 'https://api.example/y', {}, 3), `attempt ${i + 1} must be allowed`);
  }
  assert.strictEqual(ctx.ExemptHttp.attempt('PORTFOLIO_STOCK', 'https://api.example/y', {}, 3), null,
    'the 4th attempt must be refused by the daily allowance');
  const transportCalls = ctx.__sent.filter((s) => s.counter === 'transport').length;
  assert.strictEqual(transportCalls, 3, `refused attempts must not send, got ${transportCalls}`);
  assert.match(ctx.__logged.join('\n'), /allowance spent/, 'refusal must be logged');
  assert.strictEqual(ctx.ExemptHttp.used('PORTFOLIO_STOCK'), 3, 'used() must report the metered attempts');
}

// --- Contract 3: the meter survives the execution (ScriptProperties) and rolls
// over on the shared 09h UTC day key.
{
  const ctx = makeEnv({});
  ctx.ExemptHttp.attempt('PORTFOLIO_CRYPTO', 'https://api.example/z', {}, 1);
  assert.strictEqual(ctx.ExemptHttp.attempt('PORTFOLIO_CRYPTO', 'https://api.example/z', {}, 1), null,
    'the allowance must be persisted, not execution-local');
  const key = Object.keys(ctx.__store).find((k) => k.indexOf('WCORE_EXEMPT_HTTP_') === 0);
  assert(key, 'a WCORE_EXEMPT_HTTP_ property must be written');
  const payload = JSON.parse(ctx.__store[key]);
  const rolled = new Date(Date.now() - 9 * 3600000);
  assert.strictEqual(payload.d, rolled.getUTCFullYear() + '-' + (rolled.getUTCMonth() + 1) + '-' + rolled.getUTCDate(),
    'the day key must use the 09h UTC rollover shared with the other HTTP counters');
  assert.strictEqual(ctx.ExemptHttp.used('OTHER_SLOT'), 0, 'slots must be metered independently');
}

// --- Contract 4: a genuine Google rejection is re-thrown AND reported to the
// breaker, so the exemption can never mask a real exhaustion.
{
  const ctx = makeEnv({ throwQuota: true });
  assert.throws(
    () => ctx.ExemptHttp.attempt('PORTFOLIO_CRYPTO', 'https://api.example/q', {}, 5),
    /Service invoked too many times for one day/
  );
  assert.deepStrictEqual(ctx.__handled, ['Service invoked too many times for one day: urlfetch.'],
    'a real quota rejection must still be classified by the breaker');
}

// --- Contract 5: a properties outage fails open for availability but stays
// bounded inside the execution (no unlimited hole).
{
  const ctx = makeEnv({ lockContended: true });
  ctx.PropertiesService.getScriptProperties = () => { throw new Error('properties unavailable'); };
  let allowed = 0;
  for (let i = 0; i < 10; i++) {
    if (ctx.ExemptHttp.attempt('PORTFOLIO_STOCK', 'https://api.example/f', {}, 2) !== null) allowed++;
  }
  assert.strictEqual(allowed, 2, `fail-open must stay capped by the in-execution memo, got ${allowed}`);
}

// --- Contract 6: the portfolio snapshot fetches use the exemption as a
// FALLBACK only, and never label a blocked refresh without a timestamp.
for (const [source, fnName] of [
  [cryptoSource, '_cryptoPortfolioFetchSnapshot_'],
  [stockSource, '_stockPortfolioFetchSnapshot_']
]) {
  const code = extractFunction(source, fnName);
  assert.match(code, /UrlFetchApp\.fetch\(url,\s*options\)/, `${fnName} must keep using the patched fetch first`);
  assert.match(code, /ExemptHttp\.attempt\(\s*["']PORTFOLIO_[A-Z]+["']/, `${fnName} must fall back to the metered exemption`);
  assert.match(code, /BLOCKED:QUOTA[\s\S]{0,120}\(\)/, `${fnName} must timestamp a blocked status`);

  const versions = [];
  let response = null;
  const ctx = {
    Date, JSON, String, Number, parseInt, isFinite, Math, RegExp,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'WCORE_WEB_API_URL' ? 'https://api.example/' : 'secret-token')
      })
    },
    ExemptHttp: {
      attempt: (slotName) => { versions.push('exempt:' + slotName); return response; }
    },
    UrlFetchApp: {
      fetch: () => { versions.push('patched'); return response; }
    },
    Logger: { log() {} },
    Utilities: { sleep() {} }
  };
  ctx.CRYPTO_PORTFOLIO_CONFIG = { ENDPOINT: '/api/gsheet/crypto/portfolio' };
  ctx.STOCK_PORTFOLIO_CONFIG = { ENDPOINT: '/api/gsheet/stock/portfolio' };
  ctx._cryptoPortfolioFetchWithRetry_ = (f) => f();
  ctx._stockPortfolioFetchWithRetry_ = (f) => f();
  ctx._cryptoPortfolioCurrentRunTimestamp_ = () => '2026-09-14 19:20:00';
  ctx._stockPortfolioCurrentRunTimestamp_ = () => '2026-09-14 19:20:00';
  vm.createContext(ctx);
  vm.runInContext(code, ctx);

  // 6a: the patched fetch answers -> the exemption must stay unused.
  response = { code: 200, snapshot: { ok: true }, getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
  ctx[fnName]();
  assert.deepStrictEqual(versions, ['patched'], `${fnName} must not spend the exemption while HTTP is allowed`);

  // 6b: the gates returned null -> exactly one metered exempt attempt, and it wins.
  versions.length = 0;
  response = { code: 200, snapshot: { ok: true }, getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
  ctx.UrlFetchApp.fetch = () => null;
  assert.deepStrictEqual(ctx[fnName](), { ok: true }, `${fnName} must recover through the exemption`);
  assert.strictEqual(versions.length, 1, `${fnName} must spend exactly one exempt attempt`);
  assert.match(versions[0], /^exempt:PORTFOLIO_/, `${fnName} must bind the exemption to its own metered slot`);

  // 6c: allowance spent too -> honest, timestamped BLOCKED:QUOTA (never a frozen label).
  versions.length = 0;
  response = null;
  let message = '';
  try { ctx[fnName](); } catch (e) { message = String(e.message); }
  assert.match(message, /BLOCKED:QUOTA/, `${fnName} must still report a blocked refresh`);
  assert.match(message, /\d{4}-\d{1,2}-\d{1,2} \d{2}:\d{2}:\d{2}/, `${fnName} must timestamp the blocked status`);
  assert.strictEqual(versions.length, 1, `${fnName} must not retry past the spent allowance`);
}

// --- Contract 7: version guards for the three touched files.
assert.match(quotaSource, /var\s+QUOTA_CIRCUIT_BREAKER_VERSION\s*=\s*["']4\.16\.79["'];/,
  'QUOTA_CIRCUIT_BREAKER_VERSION must be bumped to 4.16.79');
assert.match(cryptoSource, /var\s+CRYPTO_PORTFOLIO_VERSION\s*=\s*["']4\.16\.79["'];/,
  'CRYPTO_PORTFOLIO_VERSION must be bumped to 4.16.79');
assert.match(stockSource, /var\s+STOCK_PORTFOLIO_VERSION\s*=\s*["']4\.16\.79["'];/,
  'STOCK_PORTFOLIO_VERSION must be bumped to 4.16.79');

console.log('quota-exempt portfolio guard OK');
