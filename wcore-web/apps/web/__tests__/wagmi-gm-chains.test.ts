import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getFactoryChainIds } from "@wcore/shared";
import { DEPLOY_CHAIN_PARAMS } from "../app/dev/deploy/chain-data";

describe("wagmi config covers GM factory chains", () => {
  test("every GM factory chainId is configured in wagmi", () => {
    const configured = new Set(config.chains.map((chain) => chain.id));
    const missing: number[] = [];
    for (const id of getFactoryChainIds()) {
      if (!configured.has(id)) missing.push(id);
    }
    assert.deepEqual(missing, [], `Missing wagmi chains for GM factories: ${missing.join(", ")}`);
  });

  test("Syndicate Commons uses only its official RPC", () => {
    const officialRpc = ["https://commons.rpc.syndicate.io"];
    const wagmiChain = config.chains.find((chain) => chain.id === 510003);

    assert.ok(wagmiChain, "Syndicate Commons must be configured in wagmi");
    assert.deepEqual(wagmiChain.rpcUrls.default.http, officialRpc);
    assert.ok("public" in wagmiChain.rpcUrls);
    assert.deepEqual(wagmiChain.rpcUrls.public.http, officialRpc);
    assert.deepEqual(DEPLOY_CHAIN_PARAMS.SYNDICATE_COMMONS?.rpcUrls, officialRpc);
  });
});
