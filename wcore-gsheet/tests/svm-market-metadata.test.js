const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', '14_SVM_ENGINE.gs'), 'utf8');

assert.match(source, /var\s+SVM_ENGINE_VERSION\s*=\s*["']4\.16\.64["']\s*;/,
  'SVM engine version must advance to 4.16.64');

function extractIife(sourceText, name) {
  const start = sourceText.indexOf(`var ${name} =`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = sourceText.indexOf('\n})();', start);
  assert.notEqual(end, -1, `${name} IIFE must be closed`);
  return sourceText.slice(start, end + '\n})();'.length);
}

function makeContext(mint, providerMeta = {}) {
  const cache = {};
  let dexCalls = 0;
  let cacheSaves = 0;
  const supplied = (key, fallback) => Object.prototype.hasOwnProperty.call(providerMeta, key)
    ? providerMeta[key]
    : fallback;
  const context = {
    Date,
    Math,
    Number,
    Object,
    String,
    _svmIsBase58: (value) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || '')),
    Num: { isValid: (value) => typeof value === 'number' && Number.isFinite(value) },
    MetaCache: {
      load: () => cache,
      save: () => { cacheSaves++; },
    },
    PriceSources: {
      getGeckoTerminalMeta: () => supplied('gt', null),
      getJupiterTokenMeta: () => supplied('jupiter', null),
      dexBulkTokens: () => {
        dexCalls++;
        return { [mint.toLowerCase()]: supplied('dex', { symbol: 'CWIF', name: 'catwifhat' }) };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(extractIife(source, 'SvmTokenMeta'), context);
  return { context, cache, cacheSaves: () => cacheSaves, dexCalls: () => dexCalls };
}

test('resolve falls back to Dex metadata while preserving canonical overrides', () => {
  const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const { context, dexCalls } = makeContext(mint);

  const marketMeta = context.SvmTokenMeta.resolve(mint, {
    symbol: mint.slice(0, 8),
    name: mint.slice(0, 8),
  }, null, {}, false);
  assert.equal(marketMeta.symbol, 'CWIF');
  assert.equal(marketMeta.name, 'catwifhat');
  assert.equal(marketMeta.decimals, null);
  assert.equal(dexCalls(), 1);

  const canonical = context.SvmTokenMeta.resolve(mint, {
    symbol: 'CANON',
    name: 'Canonical Token',
  }, null, {}, false);
  assert.equal(canonical.symbol, 'CANON');
  assert.equal(canonical.name, 'Canonical Token');
  assert.equal(canonical.decimals, null);
  assert.equal(dexCalls(), 1, 'usable overrides must bypass market metadata calls');
});

test('pricing metadata replaces an exact mint-prefix placeholder', () => {
  assert.match(source, /SvmTokenMeta\.isPlaceholderSymbol\(a3\.symbol,\s*k0\)/);
  assert.match(source, /SvmTokenMeta\.isPlaceholderName\(a3\.name,\s*k0\)/);
});

test('malformed provider metadata is ignored and never learned', () => {
  const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const cases = [
    { gt: { symbol: { ticker: 'BAD' }, name: 404 }, jupiter: null, dex: null },
    { gt: null, jupiter: { symbol: ['BAD'], name: { title: 'BAD' } }, dex: null },
    { gt: null, jupiter: null, dex: { symbol: 404, name: ['BAD'] } },
    { gt: { symbol: '   ', name: '\t' }, jupiter: null, dex: null },
  ];

  for (const providerMeta of cases) {
    const { context, cache, cacheSaves } = makeContext(mint, providerMeta);
    const resolved = context.SvmTokenMeta.resolve(mint, null, null, {}, false);
    assert.equal(resolved.symbol, '');
    assert.equal(resolved.name, '');
    assert.equal(cacheSaves(), 0);
    assert.doesNotMatch(JSON.stringify(cache), /\[object Object\]|404|BAD/);
  }
});

test('skipDex suppresses only the final Dex fallback', () => {
  const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const { context, dexCalls } = makeContext(mint, { gt: null, jupiter: null });

  const resolved = context.SvmTokenMeta.resolve(mint, null, null, {}, false, true);
  assert.equal(resolved.symbol, '');
  assert.equal(resolved.name, '');
  assert.equal(dexCalls(), 0);
});

test('shared predicates identify mint-prefix and legacy placeholders', () => {
  const mint = '7atgF8KQo4wJrD5ATGX7t1V2zVvykPJbFfNeVf1icFv1';
  const { context } = makeContext(mint);
  assert.equal(typeof context.SvmTokenMeta.isPlaceholderSymbol, 'function');
  assert.equal(typeof context.SvmTokenMeta.isPlaceholderName, 'function');

  for (const symbol of ['', 'SPL', 'SPLTOKEN', 'Unknown', mint.slice(0, 8)]) {
    assert.equal(context.SvmTokenMeta.isPlaceholderSymbol(symbol, mint), true);
  }
  for (const name of ['', 'SPL Token', 'Unknown Token', mint.slice(0, 8)]) {
    assert.equal(context.SvmTokenMeta.isPlaceholderName(name, mint), true);
  }
  assert.equal(context.SvmTokenMeta.isPlaceholderSymbol('CANON', mint), false);
  assert.equal(context.SvmTokenMeta.isPlaceholderName('Canonical Token', mint), false);
});

test('engine metadata paths use the shared placeholder predicates', () => {
  assert.match(source, /symbol:\s*SvmTokenMeta\.isPlaceholderSymbol\(tokenDef\.symbol,\s*mint\)/);
  assert.match(source, /SvmTokenMeta\.isPlaceholderSymbol\(cachedMeta\.symbol,\s*mint\)/);
  assert.match(source, /name:\s*SvmTokenMeta\.isPlaceholderName\(tokenDef\.name,\s*mint\)/);
  assert.match(source, /SvmTokenMeta\.isPlaceholderName\(cachedMeta\.name,\s*mint\)/);
  assert.match(source, /symbol:\s*SvmTokenMeta\.isPlaceholderSymbol\(meta\.symbol,\s*mint\)\s*\?\s*""\s*:\s*meta\.symbol/);
  assert.match(source, /name:\s*SvmTokenMeta\.isPlaceholderName\(meta\.name,\s*mint\)\s*\?\s*""\s*:\s*meta\.name/);
  assert.match(source, /SvmTokenMeta\.isPlaceholderSymbol\(assetKt\.symbol,\s*assetKt\.contract\)/);
  assert.match(source, /SvmTokenMeta\.isPlaceholderName\(assetKt\.name,\s*assetKt\.contract\)/);
  assert.match(source, /var needsSymbol = SvmTokenMeta\.isPlaceholderSymbol\(assetMe\.symbol,\s*assetMe\.contract\)/);
  assert.match(source, /var needsName = SvmTokenMeta\.isPlaceholderName\(assetMe\.name,\s*assetMe\.contract\)/);
  assert.match(source, /var symMissing = SvmTokenMeta\.isPlaceholderSymbol\(mmA\.symbol,\s*mmA\.contract\)/);
  assert.match(source, /var nameMissing = SvmTokenMeta\.isPlaceholderName\(mmA\.name,\s*mmA\.contract\)/);
  assert.match(source, /if \(SvmTokenMeta\.isPlaceholderSymbol\(sanA\.symbol,\s*sanA\.contract\)\) sanA\.symbol = ""/);
  assert.match(source, /if \(SvmTokenMeta\.isPlaceholderName\(sanA\.name,\s*sanA\.contract\)\) sanA\.name = ""/);
  assert.match(source, /if \(SvmTokenMeta\.isPlaceholderSymbol\(sanRow\[1\],\s*sanRow\[3\]\)\) sanRow\[1\] = ""/);
  assert.match(source, /if \(SvmTokenMeta\.isPlaceholderName\(sanRow\[2\],\s*sanRow\[3\]\)\) sanRow\[2\] = ""/);
});

test('metadata enrichment skips Dex only for targets attempted by bulk pricing', () => {
  const remaining = source.indexOf('if (workerCacheApplied && workerCacheApplied.remaining) targets = workerCacheApplied.remaining;');
  const attempted = source.indexOf('if (budget.allowDexBulk)', remaining);
  const fetch = source.indexOf('BulkPriceFetch.fetch(targets', remaining);
  assert.ok(remaining >= 0 && attempted > remaining && fetch > attempted,
    'bulk-attempt tracking must use the final target list before fetch');
  assert.match(source, /dexBulkAttempted\[String\(targets\[[^\]]+\]\)\.toLowerCase\(\)\]\s*=\s*true/);
  assert.match(source, /SvmTokenMeta\.resolve\(assetMe\.contract,\s*null,\s*state\.timer,\s*config,\s*false,\s*!!dexBulkAttempted\[String\(assetMe\.contract\)\.toLowerCase\(\)\]\)/);
});
