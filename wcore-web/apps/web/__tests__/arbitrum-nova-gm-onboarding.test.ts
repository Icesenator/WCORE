import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getExplorerUrl } from "../lib/explorers";
import { buildAddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { getDeployChains } from "../app/dev/deploy/DeployClient";
import { getGmContractChainId } from "../hooks/useGmContracts";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, GM_PLATFORM_OWNER, getActiveFactoryChains, getFactory } from "@wcore/shared";

// Arbitrum Nova (mainnet, 42170, jeton natif ETH) : fabrique GM deployee par le proprietaire le 2026-11-17,
// verifiee en lecture seule sur le RPC (code, platformOwner, implementation, bytecode).
const FACTORY = "0xc27fd79fad7cde5da93b562fdd0bd60838fe8323";

describe("Arbitrum Nova GM onboarding", () => {
  test("the factory is registered for 42170, lowercase, and Arbitrum Nova is neither historical nor shared by another chainId", () => {
    assert.deepEqual(GM_FACTORIES.arbitrum_nova, { address: FACTORY, chainId: 42170 });
    assert.equal(GM_FACTORIES.arbitrum_nova?.address, GM_FACTORIES.arbitrum_nova?.address.toLowerCase());
    assert.ok(getActiveFactoryChains().includes("arbitrum_nova"));
    assert.equal(getFactory("arbitrum_nova")?.address, FACTORY);
    assert.equal(GM_HISTORICAL_FACTORIES.arbitrum_nova, undefined);
    // L adresse d une fabrique peut se retrouver sur plusieurs chaines (meme deployeur, meme nonce) : le chainId identifie la chaine.
    const sameAddress = Object.entries(GM_FACTORIES).filter(([, f]) => f.address === FACTORY);
    assert.equal(new Set(sameAddress.map(([, f]) => f.chainId)).size, sameAddress.length, "one chainId per chain key");
  });

  test("the platform owner is unchanged (the factory was checked against it on chain)", () => {
    assert.equal(GM_PLATFORM_OWNER, "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");
  });

  test("/gm lists Arbitrum Nova as an active GM chain, no longer as soon", () => {
    assert.ok(getGmChains().some((c) => c.key === "arbitrum_nova" && c.name === "Arbitrum Nova"));
    assert.ok(!getSoonChains().some((c) => c.key === "arbitrum_nova"));
  });

  test("wagmi knows Arbitrum Nova (42170, ETH) so the GM switch can add and select it", () => {
    const chain = config.chains.find((c) => c.id === 42170);
    assert.ok(chain, "Arbitrum Nova (42170) must be configured in the wagmi chain list");
    assert.equal(chain.name, "Arbitrum Nova");
    assert.equal(chain.nativeCurrency.symbol, "ETH");
    assert.deepEqual(chain.rpcUrls.default.http, ["https://nova.arbitrum.io/rpc"]);
  });

  test("the GM contract chain id resolves from the factory", () => {
    assert.equal(getGmContractChainId("arbitrum_nova"), 42170);
  });

  test("/dev/deploy still offers Arbitrum Nova and the wallet can add it", () => {
    assert.ok(getDeployChains().some((c) => c.key === "arbitrum_nova" && c.chainIdNum === 42170));
    assert.equal(buildAddEthereumChainParams(42170)?.chainId, "0xa4ba");
  });

  test("Arbitrum Nova resolves an explorer link", () => {
    const url = getExplorerUrl("arbitrum_nova", "0x0000000000000000000000000000000000000001");
    assert.equal(url, "https://nova.arbiscan.io/address/0x0000000000000000000000000000000000000001");
  });
});
