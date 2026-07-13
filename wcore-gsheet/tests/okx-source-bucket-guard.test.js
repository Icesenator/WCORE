const fs = require('fs');
const path = require('path');

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

const fetchBody = extractFunction(source, '_okxFetchBucketsViaRelay_');
const buildBody = extractFunction(source, '_okxBuildValues_');

if (!/out\.push\s*\(\s*\[\s*sym\s*,\s*amt\s*,\s*src\s*(?:,|\])/.test(fetchBody)) {
  throw new Error('_okxFetchBucketsViaRelay_ must preserve relay source as [symbol, amount, source, ...]');
}

if (!/list\[i\]\[2\]/.test(buildBody) || /"spot"\s*,\s*stamp/.test(buildBody)) {
  throw new Error('_okxBuildValues_ must use row[2] as source instead of forcing "spot"');
}

console.log('OKX source bucket guard OK');
