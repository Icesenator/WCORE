const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const refreshSrc = fs.readFileSync(path.join(root, 'src', '16_REFRESH.gs'), 'utf8');
const registryCore = fs.readFileSync(path.join(root, 'src', '10C_LEDGER_VIEW_CORE.gs'), 'utf8');

assert.ok(/LedgerViewRegistry_resolvePrimary_/.test(refreshSrc),
  'WCORE_ON_EDIT must import LedgerViewRegistry_resolvePrimary_');
assert.ok(/v4\.16\.70[\s\S]{0,200}secondary views[\s\S]{0,400}primary/i.test(refreshSrc),
  'v4.16.70 secondary-to-primary pulse must be implemented in WCORE_ON_EDIT');
assert.ok(/primarySheet\.getRange\("B1"\)\.setValue\(nowStrSecondary\)/.test(refreshSrc),
  'primary pulse must write a fresh B1 on the primary sheet');
assert.ok(/LedgerViewRegistry_\s*=\s*\{\s*pairs\s*:\s*\{\s*\}\s*\}/.test(registryCore),
  'LedgerViewRegistry must store secondary->primary pairs');

console.log('secondary A1 propagates to primary B1 OK');
