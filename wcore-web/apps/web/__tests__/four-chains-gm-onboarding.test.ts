import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getExplorerUrl } from "../lib/explorers";
import { getGmContractChainId } from "../hooks/useGmContracts";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, GM_PLATFORM_OWNER, getActiveFactoryChains, getFactory } from "@wcore/shared";

// Matchain (698, BNB), XRPL EVM (1440000, XRP), ApeChain (33139, APE) et Peaq (3338, jeton PEAQ) : fabriques GM deployees par le proprietaire le 2026-11-25,
// verifiees en lecture seule sur chaque RPC (chainId, code, platformOwner, implementation, bytecode identiques a une fabrique deja en ligne).
const CHAINS = [
  { key: "matchain", name: "Matchain", chainId: 698, factory: "0xd5a3ec8e07759c175dfe03945c1ae46613af1193", symbol: "BNB", explorer: "https://matchscan.io" },
  { key: "xrplevm", name: "XRPL EVM", chainId: 1440000, factory: "0xd931e6991691a8d40c5155a10a1767c2ea19ea73", symbol: "XRP", explorer: "https://explorer.xrplevm.org" },
  { key: "apechain", name: "ApeChain", chainId: 33139, factory: "0x8d0872fba64b04e4f1b630065bc4bf88749dbb72", symbol: "APE", explorer: "https://apescan.io" },
  { key: "peaq", name: "Peaq", chainId: 3338, factory: "0x5863a056ad0cbe06876b49c9ab7c50bcd0432718", symbol: "PEAQ", explorer: "https://peaq.subscan.io" },
] as const;

describe("the platform owner is unchanged", () => {
  test("factories were checked against it on chain", () => {
    assert.equal(GM_PLATFORM_OWNER, "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");
  });
});

for (const c of CHAINS) {
  describe(`${c.name} GM onboarding`, () => {
    test("the factory is registered, lowercase, one chainId per chain key, not historical", () => {
      assert.deepEqual(GM_FACTORIES[c.key], { address: c.factory, chainId: c.chainId });
      assert.equal(GM_FACTORIES[c.key]?.address, GM_FACTORIES[c.key]?.address.toLowerCase());
      assert.ok(getActiveFactoryChains().includes(c.key));
      assert.equal(getFactory(c.key)?.address, c.factory);
      assert.equal(GM_HISTORICAL_FACTORIES[c.key], undefined);
      const same = Object.entries(GM_FACTORIES).filter(([, f]) => f.address === c.factory);
      assert.equal(new Set(same.map(([, f]) => f.chainId)).size, same.length);
    });

    test("/gm lists the chain as active, no longer as soon", () => {
      assert.ok(getGmChains().some((g) => g.key === c.key && g.name === c.name));
      assert.ok(!getSoonChains().some((g) => g.key === c.key));
    });

    test("wagmi knows the chain with an HTTP transport on its RPC", () => {
      const chain = config.chains.find((x) => x.id === c.chainId);
      assert.ok(chain, `${c.name} must be configured in wagmi`);
      assert.equal(chain.nativeCurrency.symbol, c.symbol);
      const client = config.getClient({ chainId: c.chainId });
      assert.equal(client.chain?.id, c.chainId);
      assert.equal((client.transport as { type?: string }).type, "http");
    });

    test("the GM contract chain id resolves and an explorer link exists", () => {
      assert.equal(getGmContractChainId(c.key), c.chainId);
      assert.equal(getExplorerUrl(c.key, "0x0000000000000000000000000000000000000001"), `${c.explorer}/address/0x0000000000000000000000000000000000000001`);
    });
  });
}
