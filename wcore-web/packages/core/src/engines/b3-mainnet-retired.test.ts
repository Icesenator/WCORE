import { test } from "node:test";
import assert from "node:assert/strict";
import { chainList, getChain } from "../chains/index.js";
import { getWalletAssets } from "./dispatch.js";
import { TOKEN_REGISTRY } from "../tokens/registry.js";

const B3_TOKEN_ON_BASE = "0xb3b32f9f8827d4634fe7d973fa1034ec9fddb3b3";

test("B3 Mainnet (8333) n'est plus une chaîne active du registre core", () => {
  assert.equal(getChain("B3"), undefined);
  assert.equal(chainList.some((c) => c.key === "B3" || Number(c.CHAIN?.CHAIN_ID) === 8333), false);
  assert.equal(getChain("BASE")?.CHAIN?.CHAIN_ID, 8453);
  assert.equal(getChain("B2")?.key, "B2", "chaîne voisine B2 intacte");
});

test("un scan B3 est refusé avant tout accès réseau", async () => {
  let accesses = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { accesses++; throw new Error("réseau interdit"); };
  try {
    await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", "B3", { forceRefresh: true }), /unknown chain/i);
    assert.equal(accesses, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test("le token B3 sur Base reste au registre de Base", () => {
  assert.ok((TOKEN_REGISTRY.BASE ?? []).some((t) => t.contract.toLowerCase() === B3_TOKEN_ON_BASE && t.symbol === "B3"));
});
