// Run: node --test wcore-web/scripts/railway-deploy.test.mjs
// Every case uses a throwaway git repository with a bare "origin" and a fake `railway`
// executable first on PATH that records its arguments; nothing reaches Railway.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { acquireLock, deploy } from "./railway-deploy.mjs";

const PROJECT = "proj-1";
const BEFORE_CUTOFF = Date.parse("2026-10-27T00:00:00Z");
const API_DOCKERFILE = 'RUN pnpm --filter "@wcore/api" build\nEXPOSE 4000\n';
const WEB_DOCKERFILE = 'RUN pnpm --filter "@wcore/web" build\nEXPOSE 3000\n';

function sh(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function write(root, path, content) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function fixture() {
  const base = mkdtempSync(join(tmpdir(), "wcore-deploy-test-"));
  const origin = join(base, "origin.git");
  const repo = join(base, "repo");
  execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=master", origin]);
  execFileSync("git", ["clone", "--quiet", origin, repo], { stdio: "ignore" });
  sh(repo, "config", "user.email", "test@example.invalid");
  sh(repo, "config", "user.name", "test");
  sh(repo, "checkout", "--quiet", "-B", "master");
  const manifest = {
    productionEnvironment: "production",
    configSource: "config-as-code",
    commonIgnore: ["docs/"],
    services: {
      api: { config: "wcore-web/railway/api.json", dockerfileMarkers: ['pnpm --filter "@wcore/api" build', "EXPOSE 4000"], ignore: ["wcore-web/apps/web/"], trustProxyPreflight: true },
      web: { config: "wcore-web/railway/web.json", dockerfileMarkers: ['pnpm --filter "@wcore/web" build', "EXPOSE 3000"], ignore: ["wcore-web/apps/api/"], trustProxyPreflight: false },
    },
  };
  const config = (dockerfilePath) => JSON.stringify({ build: { builder: "DOCKERFILE", dockerfilePath, watchPatterns: ["wcore-web/**"] } }, null, 2);
  write(repo, "wcore-web/railway/deploy-manifest.json", JSON.stringify(manifest, null, 2));
  write(repo, "wcore-web/railway/api.json", config("wcore-web/apps/api/Dockerfile.railway"));
  write(repo, "wcore-web/railway/web.json", config("wcore-web/apps/web/Dockerfile.railway"));
  write(repo, "wcore-web/apps/api/Dockerfile.railway", API_DOCKERFILE);
  write(repo, "wcore-web/apps/web/Dockerfile.railway", WEB_DOCKERFILE);
  write(repo, "wcore-web/apps/api/src/server.ts", "committed\n");
  write(repo, "railway.json", '{"build":{"dockerfilePath":"wcore-web/apps/api/Dockerfile.railway"}}');
  write(repo, ".gitignore", "*.local\n");
  sh(repo, "add", "-A");
  sh(repo, "commit", "--quiet", "-m", "initial");
  sh(repo, "push", "--quiet", "origin", "master");

  const bin = join(base, "bin");
  mkdirSync(bin);
  const capture = join(base, "capture.json");
  // Records each call; `up` also snapshots the uploaded context before it is deleted.
  write(bin, "railway", `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2);
const log = fs.existsSync(${JSON.stringify(capture)}) ? JSON.parse(fs.readFileSync(${JSON.stringify(capture)}, "utf8")) : [];
const entry = { args };
if (args[0] === "status") process.stdout.write(process.env.FAKE_STATUS ?? JSON.stringify({ project: { id: "${PROJECT}" } }));
if (args[0] === "variable") process.stdout.write(process.env.FAKE_VARS ?? "{}");
if (args[0] === "deployment") process.stdout.write(process.env.FAKE_DEPLOYMENTS ?? JSON.stringify([{ id: "d0", status: "SUCCESS" }]));
if (args[0] === "up") {
  const root = args[1], files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f) : files.push(path.relative(root, f).split(path.sep).join("/")); } };
  walk(root);
  entry.files = files.sort();
  entry.read = Object.fromEntries(["railway.json", ".railwayignore", "wcore-web/build-info.json", "wcore-web/apps/api/src/server.ts"].filter((f) => fs.existsSync(path.join(root, f))).map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}
log.push(entry);
fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify(log));
process.exit(args[0] === "up" ? Number(process.env.FAKE_UP_EXIT ?? 0) : 0);
`);
  chmodSync(join(bin, "railway"), 0o755);
  // Windows resolves commands through PATHEXT, so the fake also needs a .cmd shim.
  write(bin, "railway.cmd", '@node "%~dp0railway" %*\r\n');
  const lockDir = join(base, "locks");
  return {
    base, repo, lockDir,
    calls: () => (existsSync(capture) ? JSON.parse(readFileSync(capture, "utf8")) : []),
    run: (argv, env = {}, options = {}) => withEnv({ PATH: `${bin}${delimiter}${process.env.PATH}`, ...env }, () => deploy([...argv, "--repo", repo], { lockDir, log: () => {}, now: BEFORE_CUTOFF, ...options })),
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const API_PROD = ["--service", "api", "--ref", "origin/master", "--environment", "production", "--project", PROJECT];
const VALID_PROXY = { FAKE_VARS: JSON.stringify({ TRUST_PROXY: "100.64.0.0/10", JWT_SECRET: "never-read" }) };

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });
}

const ups = (f) => f.calls().filter((call) => call.args[0] === "up");

test("every target must be named: no default service, ref, environment or project", async () => {
  const f = fixture();
  try {
    for (const drop of ["--service", "--ref", "--environment", "--project"]) {
      const argv = [...API_PROD];
      argv.splice(argv.indexOf(drop), 2);
      await rejectsWith(f.run(argv), "E_USAGE");
    }
    await rejectsWith(f.run(["--service", "worker", "--ref", "origin/master", "--environment", "production", "--project", PROJECT]), "E_USAGE");
    assert.deepEqual(f.calls(), []);
  } finally {
    f.cleanup();
  }
});

test("a commit that exists only locally is refused", async () => {
  const f = fixture();
  try {
    write(f.repo, "wcore-web/apps/api/src/server.ts", "local only\n");
    sh(f.repo, "commit", "--quiet", "-am", "local");
    await rejectsWith(f.run(["--service", "api", "--ref", "HEAD", "--environment", "production", "--project", PROJECT], VALID_PROXY), "E_NOT_PUBLISHED");
    assert.deepEqual(ups(f), []);
  } finally {
    f.cleanup();
  }
});

test("production only takes commits merged into origin/master; staging takes any pushed commit", async () => {
  const f = fixture();
  try {
    sh(f.repo, "checkout", "--quiet", "-b", "feature");
    write(f.repo, "wcore-web/apps/api/src/server.ts", "feature\n");
    sh(f.repo, "commit", "--quiet", "-am", "feature");
    sh(f.repo, "push", "--quiet", "origin", "feature");
    const feature = ["--service", "api", "--ref", "origin/feature", "--project", PROJECT];
    await rejectsWith(f.run([...feature, "--environment", "production"], VALID_PROXY), "E_NOT_ON_MASTER");
    const staged = await f.run([...feature, "--environment", "staging", "--dry-run"], VALID_PROXY);
    assert.equal(staged.status, 0);
    assert.equal(staged.sha, sh(f.repo, "rev-parse", "origin/feature"));
    assert.deepEqual(ups(f), []);
  } finally {
    f.cleanup();
  }
});

test("modified, untracked and ignored files never reach the uploaded context", async () => {
  const f = fixture();
  try {
    write(f.repo, "wcore-web/apps/api/src/server.ts", "uncommitted edit\n");
    write(f.repo, "wcore-web/apps/api/src/extra.ts", "untracked\n");
    write(f.repo, "secrets.local", "ignored\n");
    const rootConfig = readFileSync(join(f.repo, "railway.json"), "utf8");
    const result = await f.run(API_PROD, VALID_PROXY);
    assert.equal(result.status, 0);
    const [up] = ups(f);
    assert.equal(up.read["wcore-web/apps/api/src/server.ts"], "committed\n");
    assert.ok(!up.files.includes("wcore-web/apps/api/src/extra.ts"));
    assert.ok(!up.files.includes("secrets.local"));
    // The shared railway.json in the checkout is no longer rewritten.
    assert.equal(readFileSync(join(f.repo, "railway.json"), "utf8"), rootConfig);
    assert.equal(readFileSync(join(f.repo, "wcore-web/apps/api/src/server.ts"), "utf8"), "uncommitted edit\n");
  } finally {
    f.cleanup();
  }
});

test("railway up gets the exact commit, the service's own config and an explicit destination", async () => {
  const f = fixture();
  try {
    const sha = sh(f.repo, "rev-parse", "origin/master");
    const result = await f.run(API_PROD, VALID_PROXY);
    assert.equal(result.sha, sha);
    const [up] = ups(f);
    const flag = (name) => up.args[up.args.indexOf(name) + 1];
    assert.equal(flag("--project"), PROJECT);
    assert.equal(flag("--environment"), "production");
    assert.equal(flag("--service"), "api");
    assert.ok(up.args.includes("--path-as-root") && up.args.includes("--ci"));
    assert.equal(flag("--message"), `wcore api ${sha}`);
    assert.equal(JSON.parse(up.read["railway.json"]).build.dockerfilePath, "wcore-web/apps/api/Dockerfile.railway");
    assert.match(up.read[".railwayignore"], /^wcore-web\/apps\/web\/$/m);
    assert.match(up.read[".railwayignore"], /^docs\/$/m);
    assert.deepEqual(JSON.parse(up.read["wcore-web/build-info.json"]), { schema: 1, sha, ref: "origin/master", service: "api", environment: "production", source: "railway-deploy.mjs" });
  } finally {
    f.cleanup();
  }
});

test("the web service is built from the web Dockerfile, with its own ignore list", async () => {
  const f = fixture();
  try {
    await f.run(["--service", "web", "--ref", "origin/master", "--environment", "production", "--project", PROJECT]);
    const [up] = ups(f);
    assert.equal(JSON.parse(up.read["railway.json"]).build.dockerfilePath, "wcore-web/apps/web/Dockerfile.railway");
    assert.match(up.read[".railwayignore"], /^wcore-web\/apps\/api\/$/m);
    // The web image does not read TRUST_PROXY, so no variable is read for it.
    assert.ok(!f.calls().some((call) => call.args[0] === "variable"));
  } finally {
    f.cleanup();
  }
});

test("a service config pointing at the other app's Dockerfile is refused", async () => {
  const f = fixture();
  try {
    write(f.repo, "wcore-web/railway/api.json", JSON.stringify({ build: { builder: "DOCKERFILE", dockerfilePath: "wcore-web/apps/web/Dockerfile.railway" } }));
    sh(f.repo, "commit", "--quiet", "-am", "wrong dockerfile");
    sh(f.repo, "push", "--quiet", "origin", "master");
    await rejectsWith(f.run(API_PROD, VALID_PROXY), "E_DOCKERFILE");
    assert.deepEqual(ups(f), []);
  } finally {
    f.cleanup();
  }
});

const lockFile = (f) => join(f.lockDir, `wcore-railway-${PROJECT}-production-api.lock`);
function plantLock(f, holder, ageMinutes = 0) {
  mkdirSync(f.lockDir, { recursive: true });
  writeFileSync(lockFile(f), typeof holder === "string" ? holder : JSON.stringify(holder));
  const at = new Date(Date.now() - ageMinutes * 60_000);
  utimesSync(lockFile(f), at, at);
}
const DEAD_PID = 2 ** 22 + 12345; // above Linux pid_max: no such process

test("a deploy still running after 30 minutes keeps its lock", async () => {
  const f = fixture();
  try {
    plantLock(f, { host: hostname(), pid: process.pid, startedAt: "2026-10-26T20:00:00.000Z" }, 45);
    await rejectsWith(f.run(API_PROD, VALID_PROXY), "E_LOCK");
    await rejectsWith(f.run([...API_PROD, "--clear-stale-lock"], VALID_PROXY), "E_LOCK");
    assert.equal(existsSync(lockFile(f)), true);
    assert.deepEqual(ups(f), []);
  } finally {
    f.cleanup();
  }
});

test("two concurrent deploys of one target: exactly one reaches railway up", async () => {
  const f = fixture();
  try {
    const results = await Promise.allSettled([f.run(API_PROD, VALID_PROXY), f.run(API_PROD, VALID_PROXY)]);
    assert.deepEqual(results.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
    assert.equal(results.find((r) => r.status === "rejected").reason.code, "E_LOCK");
    assert.equal(ups(f).length, 1);
    assert.equal(existsSync(lockFile(f)), false, "the winner releases its lock");
  } finally {
    f.cleanup();
  }
});

test("a lock left by a crashed run is only cleared on request", async () => {
  const f = fixture();
  try {
    plantLock(f, { host: hostname(), pid: DEAD_PID, startedAt: "2026-10-26T20:00:00.000Z" }, 5);
    await rejectsWith(f.run(API_PROD, VALID_PROXY), "E_LOCK_STALE");
    assert.deepEqual(ups(f), []);
    assert.equal((await f.run([...API_PROD, "--clear-stale-lock"], VALID_PROXY)).status, 0);
    assert.equal(ups(f).length, 1);
    assert.ok(readdirSync(f.lockDir).some((name) => name.includes(".stale-")), "the stale lock is kept aside for inspection");
  } finally {
    f.cleanup();
  }
});

test("a lock from another machine or an unreadable lock is never cleared", async () => {
  const f = fixture();
  try {
    plantLock(f, { host: "other-host", pid: DEAD_PID, startedAt: "2026-10-26T20:00:00.000Z" }, 120);
    await rejectsWith(f.run([...API_PROD, "--clear-stale-lock"], VALID_PROXY), "E_LOCK");
    plantLock(f, "{not json", 120);
    await rejectsWith(f.run([...API_PROD, "--clear-stale-lock"], VALID_PROXY), "E_LOCK");
    assert.deepEqual(ups(f), []);
  } finally {
    f.cleanup();
  }
});

test("releasing never removes a lock this run does not own", () => {
  const dir = mkdtempSync(join(tmpdir(), "wcore-lock-"));
  try {
    const target = { project: PROJECT, environment: "production", service: "api", sha: "a".repeat(40) };
    const release = acquireLock(dir, target);
    const path = join(dir, `wcore-railway-${PROJECT}-production-api.lock`);
    writeFileSync(path, JSON.stringify({ host: hostname(), pid: DEAD_PID, startedAt: "x" }));
    release();
    assert.equal(existsSync(path), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a deployment already in progress on Railway, from any machine, stops this one", async () => {
  const f = fixture();
  try {
    for (const status of ["BUILDING", "DEPLOYING", "INITIALIZING", "WAITING", "QUEUED"]) {
      await rejectsWith(f.run(API_PROD, { ...VALID_PROXY, FAKE_DEPLOYMENTS: JSON.stringify([{ id: "d9", status }, { id: "d8", status: "SUCCESS" }]) }), "E_REMOTE_BUSY");
    }
    for (const output of ["not json", JSON.stringify({ error: "unauthorized" }), JSON.stringify([{ id: "d9" }])]) {
      await rejectsWith(f.run(API_PROD, { ...VALID_PROXY, FAKE_DEPLOYMENTS: output }), "E_REMOTE_UNKNOWN");
    }
    assert.deepEqual(ups(f), []);
    assert.equal(existsSync(lockFile(f)), false, "a refused run releases its lock");
    const idle = await f.run(API_PROD, { ...VALID_PROXY, FAKE_DEPLOYMENTS: JSON.stringify([{ id: "d1", status: "FAILED" }, { id: "d0", status: "SUCCESS" }]) });
    assert.equal(idle.status, 0);
  } finally {
    f.cleanup();
  }
});

test("from 2026-12-01 a config-as-code manifest is refused: Railway no longer reads railway.json", async () => {
  const f = fixture();
  try {
    await rejectsWith(f.run(API_PROD, VALID_PROXY, { now: Date.parse("2026-12-01T00:00:00Z") }), "E_CONFIG_SOURCE");
    assert.deepEqual(f.calls(), []);
  } finally {
    f.cleanup();
  }
});

test("an API TRUST_PROXY the new code would reject stops the deploy without printing the value", async () => {
  const f = fixture();
  try {
    for (const value of ["true", "2", "0.0.0.0/1,128.0.0.0/1", "10.0.0.0/33"]) {
      await assert.rejects(f.run(API_PROD, { FAKE_VARS: JSON.stringify({ TRUST_PROXY: value }) }), (error) => {
        assert.equal(error.code, "E_TRUST_PROXY");
        assert.ok(!error.message.includes("128.0.0.0") && !error.message.includes("10.0.0.0/33"));
        return true;
      });
    }
    assert.deepEqual(ups(f), []);
  } finally {
    f.cleanup();
  }
});

test("an unset TRUST_PROXY needs an explicit acknowledgement", async () => {
  const f = fixture();
  try {
    await rejectsWith(f.run(API_PROD, { FAKE_VARS: "{}" }), "E_TRUST_PROXY");
    // Spelling loopback out trusts no more than leaving it unset.
    for (const value of ["loopback", "127.0.0.1", "::1"]) {
      await rejectsWith(f.run(API_PROD, { FAKE_VARS: JSON.stringify({ TRUST_PROXY: value }) }), "E_TRUST_PROXY");
    }
    assert.equal((await f.run([...API_PROD, "--accept-shared-client-ip"], { FAKE_VARS: "{}" })).status, 0);
  } finally {
    f.cleanup();
  }
});

test("a CLI linked to another project is refused before variables are read", async () => {
  const f = fixture();
  try {
    await rejectsWith(f.run(API_PROD, { ...VALID_PROXY, FAKE_STATUS: JSON.stringify({ project: { id: "other" } }) }), "E_LINK");
    assert.ok(!f.calls().some((call) => call.args[0] === "variable" || call.args[0] === "up"));
  } finally {
    f.cleanup();
  }
});

test("the railway up exit code is returned and the temporary context is removed", async () => {
  const f = fixture();
  try {
    const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("wcore-api-")));
    const result = await f.run(API_PROD, { ...VALID_PROXY, FAKE_UP_EXIT: "7" });
    assert.equal(result.status, 7);
    assert.equal(result.published, false);
    const leaked = readdirSync(tmpdir()).filter((name) => name.startsWith("wcore-api-") && !before.has(name));
    assert.deepEqual(leaked, []);
  } finally {
    f.cleanup();
  }
});
