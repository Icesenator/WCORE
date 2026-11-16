import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getExplorerUrl } from "../lib/explorers";
import { buildAddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { getDeployChains } from "../app/dev/deploy/DeployClient";
import { getGmContractChainId } from "../hooks/useGmContracts";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, GM_PLATFORM_OWNER, getActiveFactoryChains, getFactory } from "@wcore/shared";

// Etherlink (mainnet, 42793, jeton natif XTZ) : fabrique GM deployee par le proprietaire le 2026-11-16,
// verifiee en lecture seule sur le RPC (code, platformOwner, implementation, bytecode).
const FACTORY = "0x32352ad2eeefdaf077cc9123007ccced5165e729";

describe("Etherlink GM onboarding", () => {
  test("the factory is registered for 42793, lowercase, and Etherlink is neither historical nor shared by another chainId", () => {
    assert.deepEqual(GM_FACTORIES.etherlink, { address: FACTORY, chainId: 42793 });
    assert.equal(GM_FACTORIES.etherlink?.address, GM_FACTORIES.etherlink?.address.toLowerCase());
    assert.ok(getActiveFactoryChains().includes("etherlink"));
    assert.equal(getFactory("etherlink")?.address, FACTORY);
    assert.equal(GM_HISTORICAL_FACTORIES.etherlink, undefined);
    // L adresse d une fabrique peut se retrouver sur plusieurs chaines (meme deployeur, meme nonce) : le chainId identifie la chaine.
    const sameAddress = Object.entries(GM_FACTORIES).filter(([, f]) => f.address === FACTORY);
    assert.equal(new Set(sameAddress.map(([, f]) => f.chainId)).size, sameAddress.length, "one chainId per chain key");
  });

  test("the platform owner is unchanged (the factory was checked against it on chain)", () => {
    assert.equal(GM_PLATFORM_OWNER, "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");
  });

  test("/gm lists Etherlink as an active GM chain, no longer as soon", () => {
    assert.ok(getGmChains().some((c) => c.key === "etherlink" && c.name === "Etherlink"));
    assert.ok(!getSoonChains().some((c) => c.key === "etherlink"));
  });

  test("wagmi knows Etherlink (42793, XTZ) so the GM switch can add and select it", () => {
    const chain = config.chains.find((c) => c.id === 42793);
    assert.ok(chain, "Etherlink (42793) must be configured in the wagmi chain list");
    assert.equal(chain.name, "Etherlink");
    assert.equal(chain.nativeCurrency.symbol, "XTZ");
    assert.deepEqual(chain.rpcUrls.default.http, ["https://node.mainnet.etherlink.com"]);
  });

  test("the GM contract chain id resolves from the factory", () => {
    assert.equal(getGmContractChainId("etherlink"), 42793);
  });

  test("/dev/deploy still offers Etherlink and the wallet can add it", () => {
    assert.ok(getDeployChains().some((c) => c.key === "etherlink" && c.chainIdNum === 42793));
    assert.equal(buildAddEthereumChainParams(42793)?.chainId, "0xa729");
  });

  test("Etherlink resolves an explorer link", () => {
    const url = getExplorerUrl("etherlink", "0x0000000000000000000000000000000000000001");
    assert.equal(url, "https://explorer.etherlink.com/address/0x0000000000000000000000000000000000000001");
  });
});
