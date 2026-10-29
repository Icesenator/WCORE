import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webHealth } from "../lib/health";

const SHA = "c".repeat(40);

test("web liveness names the commit from the image's build-info file", () => {
  const path = join(mkdtempSync(join(tmpdir(), "web-health-")), "build-info.json");
  writeFileSync(path, JSON.stringify({ schema: 1, sha: SHA, service: "web" }));
  assert.deepEqual(webHealth({}, path), { status: "ok", service: "wcore-web", build: { sha: SHA, source: "build-info" } });
});

test("web liveness without a build-info file says the commit is unknown rather than guessing", () => {
  assert.deepEqual(webHealth({}, join(tmpdir(), "absent-build-info.json")).build, { sha: null, source: "unknown" });
  assert.deepEqual(webHealth({ RAILWAY_GIT_COMMIT_SHA: SHA }, join(tmpdir(), "absent-build-info.json")).build, { sha: SHA, source: "railway-git" });
});
