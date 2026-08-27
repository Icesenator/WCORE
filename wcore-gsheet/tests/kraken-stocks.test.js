const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const krakenSource = fs.readFileSync(path.join(root, 'src/41_KRAKEN_SYNC.gs'), 'utf8');
const healSource = fs.readFileSync(path.join(root, 'src/16B_AUTO_HEAL.gs'), 'utf8');
const bitpandaSource = fs.readFileSync(path.join(root, 'src/35_BITPANDA_SYNC.gs'), 'utf8');

// Renommage: plus aucune référence à l'ancien nom "CEX - Kraken" seul
assert.ok(
  /SHEET:\s*"CEX - Kraken Crypto"/.test(krakenSource),
  'KRAKEN_SYNC_CONFIG.SHEET doit pointer vers "CEX - Kraken Crypto"'
);
assert.ok(
  !/SHEET:\s*"CEX - Kraken"([^C]|$)/.test(krakenSource),
  'plus de SHEET pointant vers "CEX - Kraken" seul'
);

// Onglet frère stocks déclaré
assert.ok(
  /SHEET_STOCKS:\s*"CEX - Kraken Stocks"/.test(krakenSource),
  'KRAKEN_SYNC_CONFIG.SHEET_STOCKS doit exister'
);

// Auto-heal surveille le nouveau nom Crypto et le Stocks
assert.ok(
  /"CEX - Kraken Crypto"/.test(healSource),
  '16B_AUTO_HEAL doit surveiller "CEX - Kraken Crypto"'
);

// REPAIR_CEX_SHEETS_STRUCTURE référence le nouveau nom
assert.ok(
  /"CEX - Kraken Crypto"/.test(bitpandaSource),
  'REPAIR_CEX_SHEETS_STRUCTURE doit lister "CEX - Kraken Crypto"'
);

console.log('kraken rename OK');
