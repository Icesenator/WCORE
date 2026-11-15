import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getExplorerUrl } from "../lib/explorers";
import { buildAddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { getDeployChains } from "../app/dev/deploy/DeployClient";
import { getGmContractChainId } from "../hooks/useGmContracts";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, GM_PLATFORM_OWNER, getActiveFactoryChains, getFactory } from "@wcore/shared";

// Somnia (mainnet, 5031, jeton natif SOMI) : fabrique GM deployee par le proprietaire le 2026-11-15,
// verifiee en lecture seule sur le RPC (code, platformOwner, implementation, bytecode).
const FACTORY = "0xda65daf33f4492352171161e5a07631c5cc47e4f";

describe("Somnia GM onboarding", () => {
  test("the factory is registered for 5031, lowercase, and Somnia is neither historical nor shared by another chainId", () => {
    assert.deepEqual(GM_FACTORIES.somnia, { address: FACTORY, chainId: 5031 });
    assert.equal(GM_FACTORIES.somnia?.address, GM_FACTORIES.somnia?.address.toLowerCase());
    assert.ok(getActiveFactoryChains().includes("somnia"));
    assert.equal(getFactory("somnia")?.address, FACTORY);
    assert.equal(GM_HISTORICAL_FACTORIES.somnia, undefined);
    // L adresse d une fabrique peut se retrouver sur plusieurs chaines (meme deployeur, meme nonce) : le chainId identifie la chaine.
    const sameAddress = Object.entries(GM_FACTORIES).filter(([, f]) => f.address === FACTORY);
    assert.equal(new Set(sameAddress.map(([, f]) => f.chainId)).size, sameAddress.length, "one chainId per chain key");
  });

  test("the platform owner is unchanged (the factory was checked against it on chain)", () => {
    assert.equal(GM_PLATFORM_OWNER, "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");
  });

  test("/gm lists Somnia as an active GM chain, no longer as soon", () => {
    assert.ok(getGmChains().some((c) => c.key === "somnia" && c.name === "Somnia"));
    assert.ok(!getSoonChains().some((c) => c.key === "somnia"));
  });

  test("wagmi knows Somnia (5031, SOMI) so the GM switch can add and select it", () => {
    const chain = config.chains.find((c) => c.id === 5031);
    assert.ok(chain, "Somnia (5031) must be configured in the wagmi chain list");
    assert.equal(chain.name, "Somnia");
    assert.equal(chain.nativeCurrency.symbol, "SOMI");
    assert.deepEqual(chain.rpcUrls.default.http, ["https://api.infra.mainnet.somnia.network"]);
  });

  test("the GM contract chain id resolves from the factory", () => {
    assert.equal(getGmContractChainId("somnia"), 5031);
  });

  test("/dev/deploy still offers Somnia and the wallet can add it", () => {
    assert.ok(getDeployChains().some((c) => c.key === "somnia" && c.chainIdNum === 5031));
    assert.equal(buildAddEthereumChainParams(5031)?.chainId, "0x13a7");
  });

  test("Somnia resolves an explorer link", () => {
    const url = getExplorerUrl("somnia", "0x0000000000000000000000000000000000000001");
    assert.equal(url, "https://explorer.somnia.network/address/0x0000000000000000000000000000000000000001");
  });
});
