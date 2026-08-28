const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const refreshSrc = fs.readFileSync(path.join(root, 'src', '16_REFRESH.gs'), 'utf8');

assert.ok(/_wd_readDirectB1_\(sheetName\)/.test(refreshSrc),
  '_wd_readDirectB1_ helper must exist and accept sheetName');
assert.ok(/probeSheet\.getRange\("B1"\)\.getValue\(\)/.test(refreshSrc),
  'SYNC_J1_ALL_SHEETS must read B1 directly from the sheet for [CACHE_ONLY] lines');
assert.ok(/latchB1 = d\.vB1 \|\| "";\s*if \(_wd_norm_\(d\.vI1 \|\| ""\)\.indexOf\("\[CACHE_ONLY\]"\) === 0\) \{[\s\S]{0,200}directB1/.test(refreshSrc),
  '_wd_collectGlobalRefreshActions_ must read B1 directly from the sheet for [CACHE_ONLY] lines');
assert.ok(refreshSrc.includes('v4.16.69'),
  'helper must document the v4.16.69 fix');

console.log('j1 cache-only direct read OK');
