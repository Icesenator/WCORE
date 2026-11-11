// v4.16.99 - P1-DATA-ACTION-VIEW-STATIC-TOTAL: every "Ledger - * Action" view ends with an
// INFO_TOTAL computed by its projection, instead of a static row typed on 2026-08-27 with G = 0.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');

const SRC = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
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
const A = SRC('44A_RWA_LEDGER_VIEWS.gs');
const X = SRC('44_XSTOCKS_SOLANA.gs');
const REGISTRY = { '0xondo': { u: 'TSLA', n: 'Tesla (Ondo)', m: 1 } };
const context = {
  Number, String, Array, isFinite,
  XSTOCKS_SOLANA_EURC_MINT: 'EURC-MINT',
  RwaRegistry_lookup: (chain, address) => REGISTRY[address] || null,
};
vm.createContext(context);
vm.runInContext([
  extractFunction(A, '_rwaIsDiagnosticRow_'), extractFunction(A, '_rwaLookupRow_'), extractFunction(A, '_rwaAppendActionTotal_'),
  extractFunction(A, '_rwaProjectActionRows_'), extractFunction(X, '_xstocksIsInfoRow_'), extractFunction(X, '_xstocksMetadata_'),
  extractFunction(X, '_xstocksProjectActionRows_'),
].join(String.fromCharCode(10)), context);

const HEADER = ['chain_name', 'token_ticker', 'token_name', 'contract_address', 'balance', 'price_eur', 'value_eur'];
const totalRows = (out) => out.filter((r) => r[1] === 'INFO_TOTAL');
const total = (out) => { const t = totalRows(out); assert.equal(t.length, 1, 'exactly one INFO_TOTAL'); return t[0][6]; };

test('a view without any tokenised asset ends with INFO_TOTAL = 0, last row of the projection', () => {
  const out = context._rwaProjectActionRows_('BASE', 'Ledger - Base Action', [HEADER, ['Ledger - Base', 'ETH', 'Ether', 'native', 1, 3000, 3000], ['Ledger - Base', 'INFO_TOTAL', '', '', '', '', 3000]]);
  assert.equal(total(out), 0);
  assert.equal(out[out.length - 1][1], 'INFO_TOTAL');
  assert.equal(out[out.length - 1][0], 'Ledger - Base Action');
});

test('a tokenised asset the view does not price makes the total unknown, never 0', () => {
  const out = context._rwaProjectActionRows_('BASE', 'Ledger - Base Action', [HEADER, ['Ledger - Base', 'TSLAon', 'Tesla', '0xondo', 2, '', '']]);
  assert.equal(out.length, 3, 'header, asset, INFO_TOTAL');
  assert.equal(total(out), '');
});

test('an unavailable source scan makes the total unknown', () => {
  const out = context._rwaProjectActionRows_('BASE', 'Ledger - Base Action', [HEADER, ['Ledger - Base', 'INFO', 'NO_CACHE for this wallet', '', '', '', '']]);
  assert.equal(total(out), '');
});

test('an unknown native price alone keeps the total of tokenised assets known', () => {
  const out = context._rwaProjectActionRows_('BASE', 'Ledger - Base Action', [HEADER, ['Ledger - Base', 'ERROR', 'NATIVE_PRICE_UNKNOWN ETH', '', '', '', '']]);
  assert.equal(total(out), 0);
});

test('Solana Action: EURC is valued, an unvalued xStock makes the total unknown', () => {
  const eurcOnly = context._xstocksProjectActionRows_([HEADER, ['Ledger - Solana', 'EURC', 'EURC', 'EURC-MINT', 25, 1, 25]]);
  assert.equal(total(eurcOnly), 25);
  const withXstock = context._xstocksProjectActionRows_([HEADER,
    ['Ledger - Solana', 'EURC', 'EURC', 'EURC-MINT', 25, 1, 25],
    ['Ledger - Solana', 'TSLAx', 'Tesla xStock', 'Xmint', 1, '', '', { xstockSymbol: 'TSLAx', underlyingSymbol: 'TSLA', rawBalance: 1, multiplier: 1, adjustedBalance: 1 }]]);
  assert.equal(total(withXstock), '');
  const empty = context._xstocksProjectActionRows_([HEADER]);
  assert.equal(total(empty), 0);
});
