import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getExplorerUrl } from "../lib/explorers";
import { buildAddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { getActiveFactoryChains } from "@wcore/shared";

// Arc mainnet (chainId 5042) pays gas in USDC. These guards keep every surface
// wired so the chain only needs its factory address registered to go live on /gm
// (the on-chain deployment is an operator step on /dev/deploy).
describe("Arc GM onboarding", () => {
  test("wagmi knows Arc so the GM switch can add/select it", () => {
    const arc = config.chains.find((chain) => chain.id === 5042);
    assert.ok(arc, "Arc (5042) must be configured in the wagmi chain list");
    assert.equal(arc.name, "Arc");
    assert.deepEqual(arc.nativeCurrency, { name: "USDC", symbol: "USDC", decimals: 18 });
    assert.ok((arc.rpcUrls.default.http.length ?? 0) >= 1, "Arc needs at least one HTTP RPC");
  });

  test("/dev/deploy can add Arc to the wallet", () => {
    const params = buildAddEthereumChainParams(5042);
    assert.ok(params, "Arc must have wallet_addEthereumChain params for the deploy page");
    assert.equal(params.chainId, "0x13b2");
    assert.equal(params.chainName, "Arc");
    assert.deepEqual(params.nativeCurrency, { name: "USDC", symbol: "USDC", decimals: 18 });
    assert.ok(params.rpcUrls.length >= 1);
  });

  test("Arc is offered on /gm (soon until its factory is registered)", () => {
    const visible = new Set([...getGmChains(), ...getSoonChains()].map((chain) => chain.key));
    assert.ok(visible.has("arc"), "arc must be labelled so it appears on /gm");
    // Once factories.ts gains `arc`, getGmChains() picks it up and getSoonChains()
    // drops it — both states are valid; only "invisible" is not.
    const hasFactory = getActiveFactoryChains().includes("arc");
    if (hasFactory) assert.ok(getGmChains().some((chain) => chain.key === "arc"));
    else assert.ok(getSoonChains().some((chain) => chain.key === "arc"));
  });

  test("Arc resolves an explorer link (required the moment its factory lands)", () => {
    assert.equal(
      getExplorerUrl("arc", "0x0000000000000000000000000000000000000001"),
      "https://explorer.arc.io/address/0x0000000000000000000000000000000000000001",
    );
  });
});
