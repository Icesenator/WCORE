// v4.15.145: ensure all CEX direct + relay fetch paths are wrapped with the
// shared _cexRelayFetchWithRetry_ helper, so transient UrlFetchApp.fetch
// null responses (DNS, TCP reset, micro-quota) are retried 3x before bubbling.
//
// Bitfinex + relay connectors (Binance/Bybit/Coinbase/OKX) had the wrap
// since v4.15.134; Bitpanda direct was added in v4.15.145 to fix stale
// CEX - Bitpanda Stocks errors.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const REQUIRED_WRAPS = [
  // [file, callingFunction, expectedInnerSnippet]
  ['src/35_BITPANDA_SYNC.gs', 'function _bpFetch_(', '_cexRelayFetchWithRetry_('],
  ['src/36_BINANCE_SYNC.gs', 'function UPDATE_BINANCE_SPOT(', '_cexRelayFetchWithRetry_('],
  ['src/37_BITFINEX_SYNC.gs', 'function UPDATE_BITFINEX_SPOT(', '_cexRelayFetchWithRetry_('],
  ['src/38_BYBIT_SYNC.gs', 'function UPDATE_BYBIT_SPOT(', '_cexRelayFetchWithRetry_('],
  ['src/39_COINBASE_SYNC.gs', 'function UPDATE_COINBASE_SPOT(', '_cexRelayFetchWithRetry_('],
  ['src/40_OKX_SYNC.gs', 'function UPDATE_OKX_SPOT(', '_cexRelayFetchWithRetry_('],
  ['src/41_KRAKEN_SYNC.gs', 'function UPDATE_KRAKEN_SPOT(', '_cexRelayFetchWithRetry_('],
];

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Missing signature ${signature}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function for ${signature}`);
}

let failed = 0;
for (const [file, signature, snippet] of REQUIRED_WRAPS) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const body = extractFunction(source, signature);
  if (!body.includes(snippet)) {
    console.error(`FAIL: ${file} ${signature} must wrap its fetch with ${snippet}`);
    failed++;
  }
}

// Sanity check: the shared helper exists and retries 3x on blocked/null.
const helperSource = fs.readFileSync(path.join(root, 'src/35_BITPANDA_SYNC.gs'), 'utf8');
if (!/var CEX_RELAY_MAX_RETRIES\s*=\s*3/.test(helperSource)) {
  console.error('FAIL: CEX_RELAY_MAX_RETRIES must remain 3');
  failed++;
}
if (!/var CEX_RELAY_RETRY_DELAY_MS\s*=\s*5000/.test(helperSource)) {
  console.error('FAIL: CEX_RELAY_RETRY_DELAY_MS must remain 5000ms');
  failed++;
}
if (!/blocked\/null response/.test(helperSource)) {
  console.error('FAIL: retry helper must catch "blocked/null response" errors');
  failed++;
}

if (failed > 0) {
  console.error(`\nCEX retry wrap guard FAILED: ${failed} check(s)`);
  process.exit(1);
}

console.log('CEX retry wrap guard OK');
