import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getExplorerUrl } from "../lib/explorers";
import { buildAddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { getDeployChains } from "../app/dev/deploy/DeployClient";
import { getGmContractChainId } from "../hooks/useGmContracts";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, GM_PLATFORM_OWNER, getActiveFactoryChains, getFactory } from "@wcore/shared";

// DBK Chain (mainnet, 20240603, jeton natif ETH) : fabrique GM deployee par le proprietaire le 2026-11-19,
// verifiee en lecture seule sur le RPC (code, platformOwner, implementation, bytecode).
const FACTORY = "0x5863a056ad0cbe06876b49c9ab7c50bcd0432718";

describe("DBK Chain GM onboarding", () => {
  test("the factory is registered for 20240603, lowercase, and DBK Chain is neither historical nor shared by another chainId", () => {
    assert.deepEqual(GM_FACTORIES.dbk_chain, { address: FACTORY, chainId: 20240603 });
    assert.equal(GM_FACTORIES.dbk_chain?.address, GM_FACTORIES.dbk_chain?.address.toLowerCase());
    assert.ok(getActiveFactoryChains().includes("dbk_chain"));
    assert.equal(getFactory("dbk_chain")?.address, FACTORY);
    assert.equal(GM_HISTORICAL_FACTORIES.dbk_chain, undefined);
    // L adresse d une fabrique peut se retrouver sur plusieurs chaines (meme deployeur, meme nonce) : le chainId identifie la chaine.
    const sameAddress = Object.entries(GM_FACTORIES).filter(([, f]) => f.address === FACTORY);
    assert.equal(new Set(sameAddress.map(([, f]) => f.chainId)).size, sameAddress.length, "one chainId per chain key");
  });

  test("the platform owner is unchanged (the factory was checked against it on chain)", () => {
    assert.equal(GM_PLATFORM_OWNER, "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");
  });

  test("/gm lists DBK Chain as an active GM chain, no longer as soon", () => {
    assert.ok(getGmChains().some((c) => c.key === "dbk_chain" && c.name === "DBK Chain"));
    assert.ok(!getSoonChains().some((c) => c.key === "dbk_chain"));
  });

  test("wagmi knows DBK Chain (20240603, ETH) so the GM switch can add and select it", () => {
    const chain = config.chains.find((c) => c.id === 20240603);
    assert.ok(chain, "DBK Chain (20240603) must be configured in the wagmi chain list");
    assert.equal(chain.name, "DBK chain"); // nom de viem ; le site affiche « DBK Chain » (table des noms de gm-chains.ts)
    assert.equal(chain.nativeCurrency.symbol, "ETH");
    assert.deepEqual(chain.rpcUrls.default.http, ["https://rpc.mainnet.dbkchain.io"]);
    // The transport actually wired for 20240603 (reserve of Codex): an HTTP client on the DBK RPC.
    const client = config.getClient({ chainId: 20240603 as never });
    assert.equal(client.chain?.id, 20240603);
    const transport = client.transport as { type?: string; url?: string };
    assert.equal(transport.type, "http");
    assert.equal(transport.url, "https://rpc.mainnet.dbkchain.io");
  });

  test("the GM contract chain id resolves from the factory", () => {
    assert.equal(getGmContractChainId("dbk_chain"), 20240603);
  });

  test("/dev/deploy still offers DBK Chain and the wallet can add it", () => {
    assert.ok(getDeployChains().some((c) => c.key === "dbk_chain" && c.chainIdNum === 20240603));
    assert.equal(buildAddEthereumChainParams(20240603)?.chainId, "0x134d8db");
  });

  test("DBK Chain resolves an explorer link", () => {
    const url = getExplorerUrl("dbk_chain", "0x0000000000000000000000000000000000000001");
    assert.equal(url, "https://scan.dbkchain.io/address/0x0000000000000000000000000000000000000001");
  });
});
