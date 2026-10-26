import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("real application route classification (isolated providers and environment)", () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    "--import", "tsx", "--experimental-test-module-mocks", "--test", "--test-reporter=tap", "--test-force-exit",
    fileURLToPath(new URL("./route-classification.fixture.ts", import.meta.url)),
  ], { encoding: "utf8", timeout: 60_000, env });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /(?:pass 10|# pass 10)/);
});
