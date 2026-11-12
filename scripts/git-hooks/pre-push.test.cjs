// Garde : le hook pre-push refuse toute reference qui ne descend pas de la racine de master.
// Le test fabrique un depot distant et un clone dans un dossier temporaire ; il ne touche a rien d'autre.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const HOOK = path.join(__dirname, "pre-push");
// An empty file stands for the global configuration: the user's own settings (hooks path,
// signing, credential helper) must not reach the test. The null device is refused on Windows.
const EMPTY_CONFIG = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wcore-prepush-cfg-")), "gitconfig");
fs.writeFileSync(EMPTY_CONFIG, "");
test.after(() => fs.rmSync(path.dirname(EMPTY_CONFIG), { recursive: true, force: true }));

function git(cwd, ...args) {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.invalid",
      GIT_CONFIG_GLOBAL: EMPTY_CONFIG, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0",
    },
  });
  return { code: res.status, out: `${res.stdout || ""}${res.stderr || ""}` };
}

function commit(cwd, file, text) {
  fs.writeFileSync(path.join(cwd, file), text);
  assert.equal(git(cwd, "add", file).code, 0);
  assert.equal(git(cwd, "commit", "-q", "-m", `add ${file}`).code, 0);
}

function setup(t, { installHook = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wcore-prepush-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const remote = path.join(dir, "remote.git");
  const clone = path.join(dir, "clone");
  assert.equal(git(dir, "init", "-q", "--bare", "-b", "master", remote).code, 0);
  assert.equal(git(dir, "init", "-q", "-b", "master", clone).code, 0);
  assert.equal(git(clone, "remote", "add", "origin", remote).code, 0);
  commit(clone, "a.txt", "a");
  // First push, before the hook exists: it creates origin/master.
  assert.equal(git(clone, "push", "-q", "-u", "origin", "master").code, 0);
  if (installHook) {
    const target = path.join(clone, ".git", "hooks", "pre-push");
    fs.copyFileSync(HOOK, target);
    fs.chmodSync(target, 0o755); // Git ignores a hook that is not executable (POSIX).
  }
  return { dir, remote, clone };
}

const remoteRefs = (remote) => git(remote, "for-each-ref", "--format=%(refname)").out.trim().split("\n").filter(Boolean).sort();

test("a branch that descends from the root of master is pushed", (t) => {
  const { remote, clone } = setup(t);
  assert.equal(git(clone, "checkout", "-q", "-b", "feature").code, 0);
  commit(clone, "b.txt", "b");
  const res = git(clone, "push", "origin", "feature");
  assert.equal(res.code, 0, res.out);
  assert.deepEqual(remoteRefs(remote), ["refs/heads/feature", "refs/heads/master"]);
});

test("a branch with an unrelated history is refused and nothing reaches the remote", (t) => {
  const { remote, clone } = setup(t);
  assert.equal(git(clone, "checkout", "-q", "--orphan", "old-history").code, 0);
  commit(clone, "c.txt", "c");
  const res = git(clone, "push", "origin", "old-history");
  assert.notEqual(res.code, 0);
  assert.match(res.out, /\[pre-push\] REFUS : refs\/heads\/old-history ne descend pas de la racine de master\./);
  assert.deepEqual(remoteRefs(remote), ["refs/heads/master"]);
});

test("one unrelated reference blocks the whole push, even next to a valid one", (t) => {
  const { remote, clone } = setup(t);
  assert.equal(git(clone, "checkout", "-q", "-b", "feature").code, 0);
  commit(clone, "b.txt", "b");
  assert.equal(git(clone, "checkout", "-q", "--orphan", "old-history").code, 0);
  commit(clone, "c.txt", "c");
  const res = git(clone, "push", "origin", "feature", "old-history");
  assert.notEqual(res.code, 0);
  assert.deepEqual(remoteRefs(remote), ["refs/heads/master"]);
});

test("a tag on an unrelated history is refused too", (t) => {
  const { remote, clone } = setup(t);
  assert.equal(git(clone, "checkout", "-q", "--orphan", "old-history").code, 0);
  commit(clone, "c.txt", "c");
  assert.equal(git(clone, "tag", "-a", "v-old", "-m", "old").code, 0);
  const res = git(clone, "push", "origin", "v-old");
  assert.notEqual(res.code, 0);
  assert.deepEqual(remoteRefs(remote), ["refs/heads/master"]);
});

test("a push from another worktree of the same repository goes through the same hook", (t) => {
  const { dir, remote, clone } = setup(t);
  const wt = path.join(dir, "wt");
  assert.equal(git(clone, "worktree", "add", "-q", "--detach", wt).code, 0);
  assert.equal(git(wt, "checkout", "-q", "--orphan", "old-in-worktree").code, 0);
  commit(wt, "d.txt", "d");
  const res = git(wt, "push", "origin", "old-in-worktree");
  assert.notEqual(res.code, 0);
  assert.match(res.out, /REFUS/);
  assert.deepEqual(remoteRefs(remote), ["refs/heads/master"]);
});

test("deleting a remote branch is not blocked", (t) => {
  const { remote, clone } = setup(t);
  assert.equal(git(clone, "checkout", "-q", "-b", "feature").code, 0);
  commit(clone, "b.txt", "b");
  assert.equal(git(clone, "push", "-q", "origin", "feature").code, 0);
  const res = git(clone, "push", "origin", "--delete", "feature");
  assert.equal(res.code, 0, res.out);
  assert.deepEqual(remoteRefs(remote), ["refs/heads/master"]);
});

test("without a known master on the remote side the hook refuses instead of guessing", (t) => {
  const { remote, clone } = setup(t);
  assert.equal(git(clone, "update-ref", "-d", "refs/remotes/origin/master").code, 0);
  assert.equal(git(clone, "checkout", "-q", "-b", "feature").code, 0);
  commit(clone, "b.txt", "b");
  const res = git(clone, "push", "origin", "feature");
  assert.notEqual(res.code, 0);
  assert.match(res.out, /racine de master introuvable/);
  assert.deepEqual(remoteRefs(remote), ["refs/heads/master"]);
});

test("control: without the hook the unrelated history would have been published", (t) => {
  const { remote, clone } = setup(t, { installHook: false });
  assert.equal(git(clone, "checkout", "-q", "--orphan", "old-history").code, 0);
  commit(clone, "c.txt", "c");
  assert.equal(git(clone, "push", "origin", "old-history").code, 0);
  assert.deepEqual(remoteRefs(remote), ["refs/heads/master", "refs/heads/old-history"]);
});
