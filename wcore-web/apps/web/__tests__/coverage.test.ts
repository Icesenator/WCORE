import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CEX_PROVIDERS, GM_FACTORIES } from "@wcore/shared";
import { getCoverageStats } from "../lib/coverage";

describe("coverage stats", () => {
  test("derives counts from live registries instead of copied integers", () => {
    const stats = getCoverageStats();
    assert.equal(stats.cexProviderCount, CEX_PROVIDERS.length);
    assert.equal(stats.gmEnabledChainCount, Object.keys(GM_FACTORIES).length);
    assert.equal(stats.cexProviderCount, 7);
    assert.equal(stats.chainConfigCount, 162);
    assert.notEqual(stats.chainConfigCount, 325);
  });
});
