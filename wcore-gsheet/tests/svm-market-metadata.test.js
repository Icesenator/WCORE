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

function makeContext(mint) {
  const cache = {};
  let dexCalls = 0;
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
      save: () => {},
    },
    PriceSources: {
      getGeckoTerminalMeta: () => null,
      getJupiterTokenMeta: () => null,
      dexBulkTokens: () => {
        dexCalls++;
        return { [mint.toLowerCase()]: { symbol: 'CWIF', name: 'catwifhat' } };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(extractIife(source, 'SvmTokenMeta'), context);
  return { context, dexCalls: () => dexCalls };
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
  assert.match(source, /\(!a3\.symbol\s*\|\|\s*a3\.symbol\s*===\s*"SPL"\s*\|\|\s*a3\.symbol\s*===\s*k0\.slice\(0,\s*8\)\)/);
  assert.match(source, /\(!a3\.name\s*\|\|\s*a3\.name\s*===\s*"SPL Token"\s*\|\|\s*a3\.name\s*===\s*k0\.slice\(0,\s*8\)\)/);
});
