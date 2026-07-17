// v4.16.31 guard: the bulk CEX relay write path (44_CEX_BULK.gs) must apply
// per-provider symbol canonicalizers (OKSOL->SOL for OKX, Bybit aliases) and
// merge duplicate (symbol, source) rows — parity with the per-connector paths.
// Regression: v4.16.30 wrote raw relay rows, reintroducing OKSOL in "CEX - OKX"
// on every 4h UPDATE_CEX_RELAY_ALL run.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/44_CEX_BULK.gs'), 'utf8');

// --- Static guards: write loops must canonicalize, then merge ---
assert.ok(
  /var sym = _cexBulkCanonicalSymbol_\(config, spot\[i\]\[0\]\)/.test(source),
  'spot loop must canonicalize symbols via _cexBulkCanonicalSymbol_'
);
assert.ok(
  /var eSym = _cexBulkCanonicalSymbol_\(config, earnFlex\[ef\]\[0\]\)/.test(source),
  'earn-flexible loop must canonicalize symbols'
);
assert.ok(
  /var lSym = _cexBulkCanonicalSymbol_\(config, earnLocked\[el\]\[0\]\)/.test(source),
  'earn-locked loop must canonicalize symbols'
);
assert.ok(
  /dataRows = _cexBulkMergeRows_\(dataRows\)/.test(source),
  'bulk write must merge duplicate (symbol, source) rows before writing'
);

// --- Functional: run the two helpers in a sandbox with the real OKX/Bybit maps ---
const okxSource = fs.readFileSync(path.join(root, 'src/40_OKX_SYNC.gs'), 'utf8');
const bybitSource = fs.readFileSync(path.join(root, 'src/38_BYBIT_SYNC.gs'), 'utf8');

function extract(sourceText, names) {
  let out = '';
  for (const name of names) {
    const varStart = sourceText.indexOf(`var ${name}`);
    const fnStart = sourceText.indexOf(`function ${name}(`);
    const start = fnStart >= 0 ? fnStart : varStart;
    assert.ok(start >= 0, `missing ${name}`);
    const brace = sourceText.indexOf('{', start);
    let depth = 0;
    for (let i = brace; i < sourceText.length; i++) {
      if (sourceText[i] === '{') depth++;
      if (sourceText[i] === '}') depth--;
      if (depth === 0) { out += sourceText.slice(start, i + 2) + '\n'; break; }
    }
  }
  return out;
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(extract(okxSource, ['OKX_SYMBOL_ALIASES', '_okxCanonicalSymbol_']), sandbox);
vm.runInContext(extract(bybitSource, ['BYBIT_SYMBOL_ALIASES', '_bybitCanonicalSymbol_']), sandbox);
vm.runInContext(extract(source, ['_cexBulkCanonicalSymbol_', '_cexBulkMergeRows_']), sandbox);

// OKSOL must canonicalize to SOL for okx, stay untouched for other providers
assert.equal(sandbox._cexBulkCanonicalSymbol_('okx', 'OKSOL'), 'SOL', 'okx OKSOL must alias to SOL');
assert.equal(sandbox._cexBulkCanonicalSymbol_('okx', 'oksol'), 'SOL', 'okx alias must be case-insensitive');
assert.equal(sandbox._cexBulkCanonicalSymbol_('okx', 'BTC'), 'BTC', 'okx non-aliased symbols pass through');
assert.equal(sandbox._cexBulkCanonicalSymbol_('binance', 'OKSOL'), 'OKSOL', 'non-okx providers keep OKSOL untouched');

// Merge: OKSOL(aliased to SOL) + SOL same source -> single row, summed amounts/values
const rows = [
  ['SOL', 2, 'funding', 'ts', 300, 150],
  ['SOL', 1, 'funding', 'ts', 150, 150],
  ['SOL', 5, 'earn', 'ts', 750, 150],
  ['BTC', 0.1, 'funding', 'ts', 10000, 100000],
];
const merged = sandbox._cexBulkMergeRows_(rows);
assert.equal(merged.length, 3, 'duplicate (SOL, funding) rows must merge into one');
const solFunding = merged.find((r) => r[0] === 'SOL' && r[2] === 'funding');
assert.equal(solFunding[1], 3, 'merged balance must be summed');
assert.equal(solFunding[4], 450, 'merged valueUsd must be summed');
assert.equal(solFunding[5], 150, 'merged priceUsd must be value/amount');
const solEarn = merged.find((r) => r[0] === 'SOL' && r[2] === 'earn');
assert.equal(solEarn[1], 5, 'different source must NOT merge');

console.log('cex bulk canonical OK');
