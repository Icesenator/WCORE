const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/35_BITPANDA_SYNC.gs'), 'utf8');

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

const body = extractFunction(source, '_cexComputeAndAppendTotal_');

if (!/getLastRow\s*\(\s*\)/.test(body)) {
  throw new Error('_cexComputeAndAppendTotal_ must consider existing rows when clearing managed A:G data');
}

if (!/getRange\s*\(\s*1\s*,\s*1\s*,\s*managedRows\s*,\s*7\s*\)\.clearContent\s*\(/.test(body)) {
  throw new Error('_cexComputeAndAppendTotal_ must clear A:G for all managedRows before rewriting; otherwise stale G totals remain when row count grows');
}

if (/getRange\s*\(\s*1\s*,\s*1\s*,\s*clearR\s*,\s*4\s*\)\.clearContent\s*\(/.test(body)) {
  throw new Error('_cexComputeAndAppendTotal_ must not clear only A:D; stale E:G values can remain');
}

console.log('CEX INFO_TOTAL cleanup guard OK');
