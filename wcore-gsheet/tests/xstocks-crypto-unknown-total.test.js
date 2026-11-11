// v4.16.99 - Solana Crypto view built by 44_XSTOCKS_SOLANA: an unknown value is not zero.
// Same contract as _rwaRecomputeTotal_ (44A): an empty source INFO_TOTAL, or a non-zero native
// balance without a value, leaves the view INFO_TOTAL empty (UNKNOWN) instead of a partial sum.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', '44_XSTOCKS_SOLANA.gs'), 'utf8');
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}
// The real row classifiers of the file, not stand-ins: META rows and xStocks metadata included.
const context = { Number, String, Array, isFinite, XSTOCKS_SOLANA_EURC_MINT: 'EURC-MINT' };
vm.createContext(context);
vm.runInContext(['_xstocksIsInfoRow_', '_xstocksMetadata_', '_xstocksProjectCryptoRows_'].map((n) => extractFunction(SOURCE, n)).join(String.fromCharCode(10)), context);
const XMETA = { xstockSymbol: 'TSLAx', underlyingSymbol: 'TSLA', rawBalance: 1, multiplier: 1, adjustedBalance: 1 };
const HEADER = ['chain_name', 'token_ticker', 'token_name', 'contract_address', 'balance', 'price_eur', 'value_eur'];
const total = (out) => out.find((r) => r[1] === 'INFO_TOTAL')[6];

test('known values are summed, xStocks and EURC rows left out', () => {
  const out = context._xstocksProjectCryptoRows_([HEADER,
    ['Ledger - Solana', 'SOL', 'Solana', 'native', 2, 150, 300],
    ['Ledger - Solana', 'JUP', 'Jupiter', 'JUPmint', 100, 0.5, 50],
    ['Ledger - Solana', 'TSLAx', 'Tesla xStock', 'Xmint', 1, 300, 300, XMETA],
    ['META', 'scan', 'v1', '', '', '', ''],
    ['Ledger - Solana', 'EURC', 'EURC', 'EURC-MINT', 10, 1, 10],
    ['Ledger - Solana', 'INFO_TOTAL', '', '', '', '', 660]]);
  assert.equal(total(out), 350);
});

test('a native balance without a value makes the total unknown, not a partial sum', () => {
  const out = context._xstocksProjectCryptoRows_([HEADER,
    ['Ledger - Solana', 'SOL', 'Solana', 'native', 2, '', ''],
    ['Ledger - Solana', 'JUP', 'Jupiter', 'JUPmint', 100, 0.5, 50],
    ['Ledger - Solana', 'INFO_TOTAL', '', '', '', '', 50]]);
  assert.equal(total(out), '');
});

test('an empty source INFO_TOTAL stays unknown', () => {
  const out = context._xstocksProjectCryptoRows_([HEADER,
    ['Ledger - Solana', 'SOL', 'Solana', 'native', 2, 150, 300],
    ['Ledger - Solana', 'INFO_TOTAL', '', '', '', '', '']]);
  assert.equal(total(out), '');
});

test('a token without a price is skipped without hiding the rest (as in 44A)', () => {
  const out = context._xstocksProjectCryptoRows_([HEADER,
    ['Ledger - Solana', 'SOL', 'Solana', 'native', 2, 150, 300],
    ['Ledger - Solana', 'NOPX', 'No price', 'NOmint', 5, '', ''],
    ['Ledger - Solana', 'INFO_TOTAL', '', '', '', '', 300]]);
  assert.equal(total(out), 300);
});

test('a zero native balance without a value is not unknown', () => {
  const out = context._xstocksProjectCryptoRows_([HEADER,
    ['Ledger - Solana', 'SOL', 'Solana', 'native', 0, '', ''],
    ['Ledger - Solana', 'JUP', 'Jupiter', 'JUPmint', 100, 0.5, 50],
    ['Ledger - Solana', 'INFO_TOTAL', '', '', '', '', 50]]);
  assert.equal(total(out), 50);
});
