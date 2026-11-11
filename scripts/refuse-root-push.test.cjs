// Garde : `npm run push` doit echouer sans lancer PowerShell, safe-push ni clasp.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const pkg = require("../package.json");

test("the root push script only runs the refusal script", () => {
  assert.equal(pkg.scripts.push, "node scripts/refuse-root-push.cjs");
  assert.doesNotMatch(pkg.scripts.push, /powershell|safe-push|clasp/i);
});

test("the refusal exits non-zero and points to the minimal publication procedure", () => {
  const res = spawnSync(process.execPath, [path.join(__dirname, "refuse-root-push.cjs")], { encoding: "utf8" });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /desactive/);
  assert.match(res.stderr, /copie fraiche du LIVE/);
  assert.match(res.stderr, /seuls fichiers modifies/);
});
