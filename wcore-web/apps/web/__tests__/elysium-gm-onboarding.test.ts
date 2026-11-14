import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getExplorerUrl } from "../lib/explorers";
import { buildAddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { getDeployChains } from "../app/dev/deploy/DeployClient";
import { getGmContractChainId } from "../hooks/useGmContracts";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, getActiveFactoryChains, getFactory } from "@wcore/shared";

// Elysium (Kinetiq, 99901, jeton natif HYPE) : fabrique GM deployee par le proprietaire le 2026-11-14.
// Jamais l'Elysium de Vulcan Forged (1339, LAVA).
const FACTORY = "0xb6a0615caf1fc1d27688f77de251411776404110";

describe("Elysium GM onboarding", () => {
  test("the factory is registered for Kinetiq 99901, lowercase, and nothing points at 1339", () => {
    assert.deepEqual(GM_FACTORIES.elysium, { address: FACTORY, chainId: 99901 });
    assert.equal(GM_FACTORIES.elysium?.address, GM_FACTORIES.elysium?.address.toLowerCase());
    assert.ok(getActiveFactoryChains().includes("elysium"));
    assert.equal(getFactory("elysium")?.address, FACTORY);
    assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 1339), "Vulcan Forged Elysium is never a GM chain");
    assert.ok(!Object.values(GM_HISTORICAL_FACTORIES).some((f) => f.chainId === 1339));
  });

  test("Elysium is not active and historical at once; the same address on another chain is a different deployment", () => {
    assert.equal(GM_HISTORICAL_FACTORIES.elysium, undefined);
    // Meme deployeur, meme nonce : la fabrique a la meme adresse sur plusieurs chaines (Intuition aussi). Ce qui
    // identifie une chaine est le chainId, jamais l'adresse seule.
    const sameAddress = Object.entries(GM_FACTORIES).filter(([, f]) => f.address === FACTORY);
    assert.ok(sameAddress.some(([k]) => k === "elysium"));
    assert.equal(new Set(sameAddress.map(([, f]) => f.chainId)).size, sameAddress.length, "one chainId per chain key");
  });

  test("/gm lists Elysium as an active GM chain, no longer as soon", () => {
    assert.ok(getGmChains().some((c) => c.key === "elysium" && c.name === "Elysium"));
    assert.ok(!getSoonChains().some((c) => c.key === "elysium"));
  });

  test("wagmi knows Elysium (99901, HYPE) so the GM switch can add and select it", () => {
    const chain = config.chains.find((c) => c.id === 99901);
    assert.ok(chain, "Elysium (99901) must be configured in the wagmi chain list");
    assert.equal(chain.name, "Elysium");
    assert.equal(chain.nativeCurrency.symbol, "HYPE");
    assert.deepEqual(chain.rpcUrls.default.http, ["https://rpc.elysium.kinetiq.xyz"]);
    assert.ok(!config.chains.some((c) => c.id === 1339));
  });

  test("the GM contract chain id resolves from the factory", () => {
    assert.equal(getGmContractChainId("elysium"), 99901);
  });

  test("/dev/deploy still offers Elysium and the wallet can add it", () => {
    assert.ok(getDeployChains().some((c) => c.key === "elysium" && c.chainIdNum === 99901));
    assert.equal(buildAddEthereumChainParams(99901)?.chainId, "0x1863d");
  });

  test("Elysium resolves an explorer link", () => {
    assert.equal(
      getExplorerUrl("elysium", "0x0000000000000000000000000000000000000001"),
      "https://elysium.kinetiq.xyz/explorer/address/0x0000000000000000000000000000000000000001",
    );
  });
});
