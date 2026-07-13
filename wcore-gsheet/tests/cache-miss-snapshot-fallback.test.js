const assert = require('assert');
const fs = require('fs');
const path = require('path');

const files = [
  '11_EVM_ENGINE.gs',
  '14_SVM_ENGINE.gs',
  '15_COSMOS_ENGINE.gs',
];

for (const file of files) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  assert(
    src.includes('OutputSnapshotCache.load('),
    `${file} must attempt protected output snapshot fallback on cache miss`,
  );
  assert(
    !src.includes('if (blocked && typeof OutputSnapshotCache'),
    `${file} must not gate snapshot fallback behind blocked/quota state`,
  );
}

console.log('cache miss snapshot fallback guard OK');
