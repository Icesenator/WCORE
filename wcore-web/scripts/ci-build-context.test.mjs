// Tests of ci-build-context.mjs (P1-REL-CI-DOCKER-BUILD): the CI image build must see the
// context railway-deploy.mjs uploads, no more (excluded paths) and no less (generated files).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
