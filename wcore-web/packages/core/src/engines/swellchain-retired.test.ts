import { test } from "node:test";
import assert from "node:assert/strict";
import { chainList, getChain } from "../chains/index.js";
import { getWalletAssets } from "./dispatch.js";

// Swellchain (1923) : retirée le 2026-11-21. Modèle : moonbeam-moonriver-retired.test.ts.
test("Swellchain n'est plus une chaîne active du registre core", () => {
  assert.equal(getChain("SWELLCHAIN"), undefined);
  assert.equal(chainList.some((c) => c.key === "SWELLCHAIN" || Number(c.CHAIN?.CHAIN_ID) === 1923), false);
  assert.equal(getChain("BASE")?.CHAIN?.CHAIN_ID, 8453);
  assert.equal(getChain("SWAN")?.key, "SWAN", "chaîne au nom voisin (Swan) intacte");
});

test("un scan Swellchain est refusé avant tout accès réseau", async () => {
  let accesses = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { accesses++; throw new Error("réseau interdit"); };
  try {
    await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", "SWELLCHAIN", { forceRefresh: true }), /chain removed: SWELLCHAIN \(1923\)/);
    await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", "swellchain", { forceRefresh: true }), /chain removed: SWELLCHAIN \(1923\)/);
    assert.equal(accesses, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
