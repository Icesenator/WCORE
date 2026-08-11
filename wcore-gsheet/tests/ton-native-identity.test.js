const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'TON.gs'), 'utf8');
const dist = fs.readFileSync(path.join(root, 'dist', 'chains', 'TON.ts'), 'utf8');

for (const [name, text] of [['source', source], ['dist', dist]]) {
  assert.match(text, /NATIVE_SYMBOL:\s*"TON"/, `${name} TON config must use the TON symbol`);
  assert.match(text, /NATIVE_NAME:\s*"Toncoin"/, `${name} TON config must use the Toncoin name`);
  assert.doesNotMatch(text, /NATIVE_(?:SYMBOL|NAME):\s*"(?:GRAM|Gram)"/, `${name} TON config must not retain the obsolete native identity`);
}

const fxBody = source.slice(source.indexOf('function _tonGetFx_'), source.indexOf('function _tonGetMappedPriceEur_'));
assert.doesNotMatch(fxBody, /return\s+1\b/, 'TON pricing must not invent a fixed USD/EUR rate');
assert.match(fxBody, /throw new Error\("TON USD\/EUR FX unavailable"\)/, 'TON pricing must fail closed when FX is unavailable');

console.log('TON native identity guard OK');
