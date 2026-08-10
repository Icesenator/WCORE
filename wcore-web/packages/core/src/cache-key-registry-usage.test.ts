import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

for (const engine of ["cosmos", "svm", "ton"]) {
  test(`${engine} centralizes the versioned empty-wallet cache key`, () => {
    const source = readFileSync(new URL(`./engines/${engine}.ts`, import.meta.url), "utf8");

    assert.match(source, /cacheKey\("emptyWalletV2"/);
    assert.doesNotMatch(source, /`empty:v2:/);
  });
}
