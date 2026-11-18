import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getExplorerUrl } from "../lib/explorers";
import { buildAddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { getDeployChains } from "../app/dev/deploy/DeployClient";
import { getGmContractChainId } from "../hooks/useGmContracts";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, GM_PLATFORM_OWNER, getActiveFactoryChains, getFactory } from "@wcore/shared";

// Flow EVM (mainnet, 747, jeton natif FLOW) : fabrique GM deployee par le proprietaire le 2026-11-18,
// verifiee en lecture seule sur le RPC (code, platformOwner, implementation, bytecode).
const FACTORY = "0x78a5c19e8957524cf669b20e9dc5ee28c67e6b1d";

describe("Flow EVM GM onboarding", () => {
  test("the factory is registered for 747, lowercase, and Flow EVM is neither historical nor shared by another chainId", () => {
    assert.deepEqual(GM_FACTORIES.flow, { address: FACTORY, chainId: 747 });
    assert.equal(GM_FACTORIES.flow?.address, GM_FACTORIES.flow?.address.toLowerCase());
    assert.ok(getActiveFactoryChains().includes("flow"));
    assert.equal(getFactory("flow")?.address, FACTORY);
    assert.equal(GM_HISTORICAL_FACTORIES.flow, undefined);
    // L adresse d une fabrique peut se retrouver sur plusieurs chaines (meme deployeur, meme nonce) : le chainId identifie la chaine.
    const sameAddress = Object.entries(GM_FACTORIES).filter(([, f]) => f.address === FACTORY);
    assert.equal(new Set(sameAddress.map(([, f]) => f.chainId)).size, sameAddress.length, "one chainId per chain key");
  });

  test("the platform owner is unchanged (the factory was checked against it on chain)", () => {
    assert.equal(GM_PLATFORM_OWNER, "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");
  });

  test("/gm lists Flow EVM as an active GM chain, no longer as soon", () => {
    assert.ok(getGmChains().some((c) => c.key === "flow" && c.name === "Flow EVM"));
    assert.ok(!getSoonChains().some((c) => c.key === "flow"));
  });

  test("wagmi knows Flow EVM (747, FLOW) so the GM switch can add and select it", () => {
    const chain = config.chains.find((c) => c.id === 747);
    assert.ok(chain, "Flow EVM (747) must be configured in the wagmi chain list");
    assert.equal(chain.name, "Flow EVM");
    assert.equal(chain.nativeCurrency.symbol, "FLOW");
    assert.deepEqual(chain.rpcUrls.default.http, ["https://mainnet.evm.nodes.onflow.org", "https://747.rpc.thirdweb.com"]);
  });

  test("the GM contract chain id resolves from the factory", () => {
    assert.equal(getGmContractChainId("flow"), 747);
  });

  test("/dev/deploy still offers Flow EVM and the wallet can add it", () => {
    assert.ok(getDeployChains().some((c) => c.key === "flow" && c.chainIdNum === 747));
    assert.equal(buildAddEthereumChainParams(747)?.chainId, "0x2eb");
  });

  test("Flow EVM resolves an explorer link", () => {
    const url = getExplorerUrl("flow", "0x0000000000000000000000000000000000000001");
    assert.equal(url, "https://evm.flowscan.io/address/0x0000000000000000000000000000000000000001");
  });
});
