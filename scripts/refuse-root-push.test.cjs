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

// Un seul acces clasp au script en ligne : celui de wcore-gsheet. Un second .clasp.json
// (meme script, dossier source reduit au manifeste) aurait remplace tout le script par un
// manifeste au premier `clasp push` (audit du 11/11/2026).
test("only wcore-gsheet holds a clasp access to the live script", () => {
  const root = path.join(__dirname, "..");
  const tracked = spawnSync("git", ["ls-files", "*.clasp.json", "**/.clasp.json", ".clasp.json"], { cwd: root, encoding: "utf8" });
  assert.equal(tracked.status, 0, tracked.stderr);
  const files = tracked.stdout.split(/\r?\n/).filter(Boolean).sort();
  assert.deepEqual(files, ["wcore-gsheet/.clasp.json"]);
});
