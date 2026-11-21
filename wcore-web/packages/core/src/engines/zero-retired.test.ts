import { test } from "node:test";
import assert from "node:assert/strict";
import { chainList, getChain } from "../chains/index.js";
import { getWalletAssets } from "./dispatch.js";

// ZERO Network (543210) : retirée le 2026-11-21. Modèle : swellchain-retired.test.ts.
test("ZERO Network n'est plus une chaîne active du registre core", () => {
  assert.equal(getChain("ZERO"), undefined);
  assert.equal(chainList.some((c) => c.key === "ZERO" || Number(c.CHAIN?.CHAIN_ID) === 543210), false);
  assert.equal(getChain("BASE")?.CHAIN?.CHAIN_ID, 8453);
  assert.equal(getChain("ZETACHAIN")?.key, "ZETACHAIN", "chaîne au nom voisin (ZetaChain) intacte");
});

test("un scan ZERO Network est refusé avant tout accès réseau", async () => {
  let accesses = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { accesses++; throw new Error("réseau interdit"); };
  try {
    await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", "ZERO", { forceRefresh: true }), /chain removed: ZERO \(543210\)/);
    await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", "zero", { forceRefresh: true }), /chain removed: ZERO \(543210\)/);
    assert.equal(accesses, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
