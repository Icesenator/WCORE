import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getExplorerUrl } from "../lib/explorers";
import { buildAddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { getActiveFactoryChains, getFactoryAddress } from "@wcore/shared";

// Moca Chain (2288) GM onboarding. The factory was deployed by the operator through
// /dev/deploy ("Deployment Complete") then verified read-only on Moca 2288
// (eth_chainId 0x8f0, eth_getCode non-empty, platformOwner() = GM_PLATFORM_OWNER,
// implementation() with code, creation receipt status=1). These guards keep the
// wallet switch, explorer and /gm listing wired. No test sends a transaction.
describe("Moca GM onboarding", () => {
  test("wagmi knows Moca so the GM switch can add/select chain 2288", () => {
    const moca = config.chains.find((chain) => chain.id === 2288);
    assert.ok(moca, "Moca (2288) must be configured in the wagmi chain list");
    assert.equal(moca.name, "Moca Chain");
    assert.deepEqual(moca.nativeCurrency, { name: "MOCA", symbol: "MOCA", decimals: 18 });
    assert.ok((moca.rpcUrls.default.http.length ?? 0) >= 1, "Moca needs at least one HTTP RPC");
  });

  test("/dev/deploy can add Moca to the wallet", () => {
    const params = buildAddEthereumChainParams(2288);
    assert.ok(params, "Moca must have wallet_addEthereumChain params");
    assert.equal(params.chainId, "0x8f0");
    assert.equal(params.chainName, "Moca Chain");
    assert.deepEqual(params.nativeCurrency, { name: "MOCA", symbol: "MOCA", decimals: 18 });
  });

  test("Moca is an active GM chain backed by its verified factory", () => {
    assert.equal(getFactoryAddress("MOCA"), "0xef4e94691589224a92e26741e098a3cbcd63d169");
    assert.ok(getActiveFactoryChains().includes("moca"));
    assert.ok(getGmChains().some((chain) => chain.key === "moca"), "moca must appear on /gm");
    assert.ok(!getSoonChains().some((chain) => chain.key === "moca"), "moca must not be coming soon");
  });

  test("Moca resolves an explorer link to the deployed contract", () => {
    assert.equal(
      getExplorerUrl("moca", "0xef4e94691589224a92e26741e098a3cbcd63d169"),
      "https://scan.mocachain.org/address/0xef4e94691589224a92e26741e098a3cbcd63d169",
    );
  });
});
