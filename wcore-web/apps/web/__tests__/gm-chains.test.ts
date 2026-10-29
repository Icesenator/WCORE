import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getActiveFactoryChains, getFactoryAddress } from "@wcore/shared";
import { getExplorerUrl } from "../lib/explorers";

describe("GM page chain lists", () => {
  test("Moca is an active GM chain now that its factory is verified on 2288", () => {
    // The factory was deployed through /dev/deploy ("Deployment Complete") and verified
    // read-only on Moca 2288 (eth_chainId 0x8f0, eth_getCode, platformOwner(),
    // implementation(), creation receipt status=1). Integration is config only.
    const factoryKeys = getActiveFactoryChains().filter((key) => key === "moca");
    assert.equal(factoryKeys.length, 1, "moca must appear exactly once in the active factory list");
    assert.equal(getFactoryAddress("MOCA"), "0xef4e94691589224a92e26741e098a3cbcd63d169");
    const active = getGmChains().filter((chain) => chain.key === "moca");
    assert.equal(active.length, 1, "moca must be listed as an active GM chain");
    assert.equal(active[0]?.name, "Moca Chain");
    assert.equal(
      getSoonChains().filter((chain) => chain.key === "moca").length,
      0,
      "moca must no longer be coming soon",
    );
  });
  test("does not show active factory chains as coming soon", () => {
    const activeKeys = new Set(getGmChains().map((chain) => chain.key));
    const soonKeys = getSoonChains().map((chain) => chain.key);

    assert.ok(activeKeys.has("moonbeam"));
    assert.ok(!soonKeys.includes("moonbeam"));
  });

  test("does not advertise removed chains", () => {
    // Every chainKey that has ever been removed from GM_FACTORIES. `gm_contracts`
    // rows survive such a removal forever, which is how polygon_zkevm kept being
    // served by /api/gm/random long after the chain was retired — so the retired
    // set must stay guarded on the display surface too, not just in the factory map.
    const removedKeys = [
      "ancient8",
      "arena_z",
      "corn",
      "duckchain",
      "degen",
      "superposition",
      "horizen_eon",
      "inevm",
      "mind",
      "lisk",
      "nexi_chain",
      "polygon_zkevm",
      "polynomial",
      "rari",
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
