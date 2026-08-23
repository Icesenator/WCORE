import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { CEX_PROVIDERS, GM_FACTORIES } from "@wcore/shared";
import { chainList } from "@wcore/core";
import { getCoverageStats } from "../lib/coverage";

describe("coverage stats", () => {
  test("derives counts from live registries instead of copied integers", () => {
    const stats = getCoverageStats();
    const disabled = chainList.filter((chain) => chain.FLAGS?.DISABLE_CHAIN === true).length;

    assert.equal(stats.chainConfigCount, chainList.length);
    assert.equal(stats.disabledChainCount, disabled);
    assert.equal(stats.enabledChainCount, chainList.length - disabled);
    assert.equal(stats.cexProviderCount, CEX_PROVIDERS.length);
    assert.equal(stats.gmEnabledChainCount, Object.keys(GM_FACTORIES).length);
    assert.equal(stats.cexProviderCount, 7);
    assert.equal(stats.chainConfigCount, 162);
  });
});
