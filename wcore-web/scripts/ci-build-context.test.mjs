// Tests of ci-build-context.mjs (P1-REL-CI-DOCKER-BUILD): the CI image build must see the
// context railway-deploy.mjs uploads, no more (excluded paths) and no less (generated files).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyUploadIgnore, buildContext, parseArgs } from "./ci-build-context.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function touch(root, path) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), "x");
}

test("parseArgs requires --service and --out and rejects unknown flags", () => {
  assert.deepEqual(parseArgs(["--service", "api", "--out", "/tmp/c"]), { ref: "HEAD", service: "api", out: "/tmp/c" });
  assert.throws(() => parseArgs(["--out", "/tmp/c"]), /--service/);
  assert.throws(() => parseArgs(["--service", "api"]), /--out/);
  assert.throws(() => parseArgs(["--service", "--out", "/tmp/c"]), /needs a value/);
  assert.throws(() => parseArgs(["--service", "api", "--out", "/tmp/c", "--push"]), /unknown argument/);
});

test("applyUploadIgnore follows gitignore semantics and prunes emptied directories", () => {
  const root = mkdtempSync(join(tmpdir(), "ci-ctx-"));
  try {
    for (const p of ["docs/a.md", "wcore-web/docs/b.md", "wcore-web/apps/web/page.tsx", "wcore-web/apps/api/src/index.ts",
      "wcore-web/node_modules/x/index.js", "wcore-gsheet/src/A.gs", "wcore-gsheet/dist/types.ts", ".github/workflows/ci.yml"]) touch(root, p);
    const removed = applyUploadIgnore(root, ["docs/", ".github/", "**/node_modules/", "wcore-gsheet/src/", "wcore-web/apps/web/"]);
    assert.deepEqual(removed, [".github/workflows/ci.yml", "docs/a.md", "wcore-gsheet/src/A.gs", "wcore-web/apps/web/page.tsx",
      "wcore-web/docs/b.md", "wcore-web/node_modules/x/index.js"]);
    assert.ok(existsSync(join(root, "wcore-web/apps/api/src/index.ts")));
    assert.ok(existsSync(join(root, "wcore-gsheet/dist/types.ts")));
    for (const gone of ["docs", ".github", "wcore-web/apps/web", "wcore-web/node_modules", "wcore-gsheet/src", ".git", ".git-upload-ignore"]) {
      assert.equal(existsSync(join(root, gone)), false, gone);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [service, other] of [["api", "web"], ["web", "api"]]) {
  test(`buildContext(${service}) mirrors the Railway upload of HEAD`, async () => {
    const out = join(mkdtempSync(join(tmpdir(), "ci-ctx-")), "ctx");
    try {
      const r = await buildContext({ repo, service, out });
      assert.match(r.sha, /^[0-9a-f]{40}$/);
      assert.equal(r.dockerfile, `wcore-web/apps/${service}/Dockerfile.railway`);
      assert.ok(existsSync(join(out, r.dockerfile)), "the Dockerfile reaches the context");
      assert.equal(existsSync(join(out, `wcore-web/apps/${other}`)), false, "the other app is excluded");
      assert.equal(existsSync(join(out, "docs")), false);
      assert.equal(existsSync(join(out, "railway.json")), false, "service-settings: no config-as-code file");
      const info = JSON.parse(readFileSync(join(out, "wcore-web/build-info.json"), "utf8"));
      assert.equal(info.sha, r.sha);
      assert.equal(info.service, service);
      assert.ok(existsSync(join(out, ".railwayignore")));
    } finally {
      rmSync(dirname(out), { recursive: true, force: true });
    }
  });
}

// Evidence for "nested .gitignore files are not applied" (reserve of 18/11): the web image running in
// production reports build-info.json at the deployed SHA (a file only the deployer generates, never
// committed) and serves /wcore-post-market-cap.png, a tracked file that wcore-web/.gitignore covers.
// So the deployer's upload carries tracked files whatever a nested .gitignore says. Pinned here: every
// tracked file that a .gitignore covers and that the web image copies must reach the web context.
test("tracked files covered by a nested .gitignore still reach the web context, as in the Railway upload", async () => {
  const covered = spawnSync("git", ["ls-files", "-ci", "--exclude-standard", "--", "wcore-web/apps/web/public"], { cwd: repo, encoding: "utf8" })
    .stdout.split("\n").filter(Boolean);
  const out = join(mkdtempSync(join(tmpdir(), "ci-ctx-")), "ctx");
  try {
    await buildContext({ repo, service: "web", out });
    for (const path of covered) assert.ok(existsSync(join(out, path)), `${path} is tracked and must reach the web context`);
  } finally {
    rmSync(dirname(out), { recursive: true, force: true });
  }
});

// The workflow must run when a file the images copy changes (reserve of 18/11: tsconfig.base.json and
// start-production.sh were not covered by the first list of paths).
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") re += "[^/]*";
    else re += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

function workflowPullRequestPaths() {
  const lines = readFileSync(join(repo, ".github/workflows/docker-build.yml"), "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s{4}paths:\s*$/.test(l));
  assert.ok(start >= 0, "pull_request.paths not found");
  const patterns = [];
  for (const line of lines.slice(start + 1)) {
    const m = line.match(/^\s{6}-\s+'([^']+)'\s*$/);
    if (!m) break;
    patterns.push(m[1]);
  }
  return patterns;
}

function covers(patterns, path) {
  const positive = patterns.filter((p) => !p.startsWith("!")).map(globToRegExp);
  const negative = patterns.filter((p) => p.startsWith("!")).map((p) => globToRegExp(p.slice(1)));
  return positive.some((re) => re.test(path)) && !negative.some((re) => re.test(path));
}

function copySources(dockerfile) {
  const sources = [];
  for (const line of readFileSync(join(repo, dockerfile), "utf8").split(/\r?\n/)) {
    const m = line.match(/^COPY\s+(.*)$/);
    if (!m || m[1].includes("--from")) continue;
    const tokens = m[1].split(/\s+/).filter((t) => t && !t.startsWith("--"));
    for (const src of tokens.slice(0, -1)) if (!src.includes("[")) sources.push(src); // wcore-web/build-info.jso[n] is generated
  }
  return sources;
}

test("the workflow paths cover every file the api and web images copy", () => {
  const patterns = workflowPullRequestPaths();
  assert.ok(patterns.length > 0);
  for (const dockerfile of ["wcore-web/apps/api/Dockerfile.railway", "wcore-web/apps/web/Dockerfile.railway"]) {
    const sources = copySources(dockerfile);
    assert.ok(sources.length > 5, `${dockerfile}: COPY sources parsed`);
    for (const src of sources) {
      assert.ok(covers(patterns, src.endsWith("/") ? `${src}x` : `${src}/x`) || covers(patterns, src), `${dockerfile}: ${src} is not covered by docker-build.yml paths`);
    }
  }
  assert.ok(covers(patterns, "wcore-web/tsconfig.base.json"));
  assert.ok(covers(patterns, "wcore-web/apps/api/start-production.sh") || !existsSync(join(repo, "wcore-web/apps/api/start-production.sh")));
  assert.equal(covers(patterns, "wcore-web/docs/x.md"), false, "documentation does not trigger an image build");
});
