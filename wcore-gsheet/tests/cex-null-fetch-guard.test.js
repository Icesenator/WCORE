const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const checks = [
  ['src/35_BITPANDA_SYNC.gs', '_bpFetch_'],
  ['src/36_BINANCE_SYNC.gs', '_binFetchBucketsViaRelay_'],
  ['src/36_BINANCE_SYNC.gs', '_binSignedGet_'],
  ['src/37_BITFINEX_SYNC.gs', '_bfxAuthPost_'],
  ['src/38_BYBIT_SYNC.gs', '_bybitFetchBucketsViaRelay_'],
  ['src/38_BYBIT_SYNC.gs', '_bybitAuthGet_'],
  ['src/39_COINBASE_SYNC.gs', '_cbFetchBucketsViaRelay_'],
  ['src/40_OKX_SYNC.gs', '_okxFetchBucketsViaRelay_'],
];

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

for (const [file, fn] of checks) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const body = extractFunction(source, fn);
  const fetchMatch = body.match(/var\s+(\w+)\s*=\s*UrlFetchApp\.fetch[\s\S]*?;[\s\S]*?var\s+\w+\s*=\s*\1\.getResponseCode\(\)/);
  if (!fetchMatch) continue;
  const responseVar = fetchMatch[1];
  const beforeCode = body.slice(0, body.indexOf(`${responseVar}.getResponseCode()`));
  if (!new RegExp(`if\\s*\\(\\s*!${responseVar}\\s*\\)`).test(beforeCode)) {
    throw new Error(`${file}:${fn} must guard ${responseVar} before getResponseCode()`);
  }
}

console.log('CEX null fetch guard OK');
