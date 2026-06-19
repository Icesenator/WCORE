import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getActiveFactoryChains } from "@wcore/shared";

describe("GM page chain lists", () => {
  test("does not show active factory chains as coming soon", () => {
    const activeKeys = new Set(getGmChains().map((chain) => chain.key));
    const soonKeys = getSoonChains().map((chain) => chain.key);

    assert.ok(activeKeys.has("moonbeam"));
    assert.ok(!soonKeys.includes("moonbeam"));
  });

  test("every GM_FACTORIES entry has a display label so it appears in /gm", () => {
    const labelled = new Set(getGmChains().map((chain) => chain.key));
    const missing: string[] = [];
    for (const key of getActiveFactoryChains()) {
      if (!labelled.has(key)) missing.push(key);
    }
    assert.deepEqual(missing, [], `GM_FACTORIES chains missing from GM_CHAIN_NAMES (silently filtered from /gm): ${missing.join(", ")}`);
  });
});
