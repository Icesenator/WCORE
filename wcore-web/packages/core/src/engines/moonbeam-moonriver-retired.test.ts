import { test } from "node:test";
import assert from "node:assert/strict";
import { chainList, getChain } from "../chains/index.js";
import { getWalletAssets } from "./dispatch.js";

// Moonbeam (1284) et Moonriver (1285) : retirées le 2026-11-21. Modèle : b3-mainnet-retired.test.ts.
test("Moonbeam et Moonriver ne sont plus des chaînes actives du registre core", () => {
  for (const key of ["MOONBEAM", "MOONRIVER"]) assert.equal(getChain(key), undefined, key);
  assert.equal(chainList.some((c) => ["MOONBEAM", "MOONRIVER"].includes(c.key) || [1284, 1285].includes(Number(c.CHAIN?.CHAIN_ID))), false);
  assert.equal(getChain("BASE")?.CHAIN?.CHAIN_ID, 8453);
  assert.equal(getChain("MOONCHAIN")?.key, "MOONCHAIN", "chaîne au nom voisin (Moonchain) intacte");
  assert.equal(getChain("ASTAR")?.key, "ASTAR", "chaîne voisine Astar intacte");
});

test("un scan Moonbeam ou Moonriver est refusé avant tout accès réseau", async () => {
  let accesses = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { accesses++; throw new Error("réseau interdit"); };
  try {
    await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", "MOONBEAM", { forceRefresh: true }), /chain removed: MOONBEAM \(1284\)/);
    await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", "moonriver", { forceRefresh: true }), /chain removed: MOONRIVER \(1285\)/);
    assert.equal(accesses, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
