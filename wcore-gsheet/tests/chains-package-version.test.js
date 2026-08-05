// Guards that the generated @wcore/chains package version tracks WCORE_VERSION.
//
// It was hand-maintained and had drifted far behind the chain configs it ships. That is
// not only cosmetic: the package is consumed through a `file:` dependency and pnpm
// materialises it as a frozen copy in its store, so a version that never moves gives
// consumers nothing by which to notice a chain config change.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const init = fs.readFileSync(path.join(ROOT, 'src', '01_INIT.gs'), 'utf8');
const major = init.match(/MAJOR:\s*(\d+)/);
const minor = init.match(/MINOR:\s*(\d+)/);
const patch = init.match(/PATCH:\s*(\d+)/);
assert.ok(major && minor && patch, 'WCORE_VERSION not found in 01_INIT.gs');
const expected = `${major[1]}.${minor[1]}.${patch[1]}`;

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'package.json'), 'utf8'));
assert.strictEqual(
  pkg.version, expected,
  `dist/package.json is ${pkg.version} but WCORE_VERSION is ${expected}; run "npm run build:chains" and commit dist/`,
);

console.log(`OK - @wcore/chains version tracks WCORE_VERSION (${expected})`);
