const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/40_OKX_SYNC.gs'), 'utf8');

function extractFunction(sourceText, name) {
  const start = sourceText.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = sourceText.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < sourceText.length; i++) {
    if (sourceText[i] === '{') depth++;
    if (sourceText[i] === '}') depth--;
    if (depth === 0) return sourceText.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

function verifySourcePreservation(sourceText) {
  const context = {
    JSON,
    String,
    Number,
    Array,
    Object,
    RegExp,
    isFinite,
    encodeURIComponent,
    OKX_SYMBOL_ALIASES: { OKSOL: 'SOL' },
    _okxGetRelay_: () => ({ url: 'https://relay.test', token: 'token' }),
    UrlFetchApp: {
      fetch: () => ({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ ok: true, spot: [['OKSOL', '2', 'funding', '300', '150']] }),
      }),
    },
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunction(sourceText, '_okxParseAmount_'),
    extractFunction(sourceText, '_okxCanonicalSymbol_'),
    extractFunction(sourceText, '_okxFetchBucketsViaRelay_'),
    extractFunction(sourceText, '_okxBuildValues_'),
  ].join('\n'), context);
  const buckets = context._okxFetchBucketsViaRelay_();
  const values = context._okxBuildValues_(buckets, 'stamp');
  assert.equal(buckets.spot[0][2], 'funding', 'relay source must survive bucket normalization');
  assert.equal(values[0][2], 'funding', 'normalized row source must survive sheet value construction');
}

verifySourcePreservation(source);
const sourceLosingBucket = source.replace('var row = [sym, amt, src, valueUsd, priceUsd];', 'var row = [sym, amt, "spot", valueUsd, priceUsd];');
assert.throws(() => verifySourcePreservation(sourceLosingBucket), /relay source must survive/, 'guard must fail when bucket normalization loses source');
const sourceLosingBuild = source.replace('var src = String(list[i][2] || "spot").trim().toLowerCase() || "spot";', 'var src = "spot";');
assert.throws(() => verifySourcePreservation(sourceLosingBuild), /normalized row source must survive/, 'guard must fail when sheet construction loses source');

console.log('OKX source bucket guard OK');
