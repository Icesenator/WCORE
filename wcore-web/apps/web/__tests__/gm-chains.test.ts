import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getActiveFactoryChains } from "@wcore/shared";
import { getExplorerUrl } from "../lib/explorers";

describe("GM page chain lists", () => {
  test("does not show active factory chains as coming soon", () => {
    const activeKeys = new Set(getGmChains().map((chain) => chain.key));
    const soonKeys = getSoonChains().map((chain) => chain.key);

    assert.ok(activeKeys.has("moonbeam"));
    assert.ok(!soonKeys.includes("moonbeam"));
  });

  test("does not advertise removed chains", () => {
    const removedKeys = [
      "arena_z",
      "corn",
      "horizen_eon",
      "inevm",
      "mind",
      "nexi_chain",
      "polygon_zkevm",
      "polynomial",
      "redstone",
      "rss3",
      "stargaze",
      "tangle",
    ];
    const visibleKeys = new Set([...getGmChains(), ...getSoonChains()].map((chain) => chain.key));

    for (const key of removedKeys) assert.ok(!visibleKeys.has(key), `${key} is still visible in /gm`);
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

test("every GM factory chain resolves an explorer link", () => {
  // Seven of them had no entry, so getExplorerUrl returned null and a user who had
  // just deployed a contract was shown its address with nowhere to check it.
  const missing = getActiveFactoryChains().filter(
    (chain) => getExplorerUrl(chain, "0x0000000000000000000000000000000000000001") === null,
  );
  assert.deepEqual(missing, [], `GM chains without an explorer entry: ${missing.join(", ")}`);
});
