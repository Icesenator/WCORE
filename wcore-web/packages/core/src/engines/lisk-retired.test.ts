import { test } from "node:test";
import assert from "node:assert/strict";
import { chainList, getChain } from "../chains/index.js";
import { getWalletAssets } from "./dispatch.js";

// Lisk (1135) : retirée le 2026-11-21. Modèle : swellchain-retired.test.ts.
test("Lisk n'est plus une chaîne active du registre core", () => {
  assert.equal(getChain("LISK"), undefined);
  assert.equal(chainList.some((c) => c.key === "LISK" || Number(c.CHAIN?.CHAIN_ID) === 1135), false);
  assert.equal(getChain("BASE")?.CHAIN?.CHAIN_ID, 8453);
  assert.equal(getChain("SWAN")?.key, "SWAN", "chaîne au nom voisin (Swan) intacte");
});

test("un scan Lisk est refusé avant tout accès réseau", async () => {
  let accesses = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { accesses++; throw new Error("réseau interdit"); };
  try {
    await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", "LISK", { forceRefresh: true }), /chain removed: LISK \(1135\)/);
    await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", "lisk", { forceRefresh: true }), /chain removed: LISK \(1135\)/);
    assert.equal(accesses, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
