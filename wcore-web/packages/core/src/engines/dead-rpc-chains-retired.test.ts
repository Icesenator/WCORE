import { test } from "node:test";
import assert from "node:assert/strict";
import { chainList, getChain } from "../chains/index.js";
import { getWalletAssets } from "./dispatch.js";

// Douze chaînes sans RPC (constat WCORE du 2026-11-22) : modèle zero-retired.test.ts, en boucle.
const RETIRED = [
  ["NEXUS", 3946], ["AIRDAO", 16718], ["CROSSBELL", 3737], ["EDGELESS", 2026],
  ["LUMIO", 8866], ["DOGECHAIN", 2000], ["HYCHAIN", 2911], ["PROOF_OF_PLAY_APEX", 70700],
  ["STEP_NETWORK", 1234], ["SHIMMER_EVM", 148], ["LORENZO", 8329], ["DOS_CHAIN", 7979],
] as const;

test("les douze chaînes sans RPC ne sont plus des chaînes actives du registre core", () => {
  for (const [key, id] of RETIRED) {
    assert.equal(getChain(key), undefined, key);
    assert.equal(chainList.some((c) => c.key === key || Number(c.CHAIN?.CHAIN_ID) === id), false, key);
  }
  assert.equal(getChain("BASE")?.CHAIN?.CHAIN_ID, 8453);
  assert.equal(getChain("ETHEREUM")?.CHAIN?.CHAIN_ID, 1);
  assert.equal(getChain("CORE")?.CHAIN?.CHAIN_ID, 1116, "chaîne voisine (Core 1116) intacte");
});

test("un scan sur l'une de ces chaînes est refusé avant tout accès réseau", async () => {
  let accesses = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { accesses++; throw new Error("réseau interdit"); };
  try {
    for (const [key, id] of RETIRED) {
      const expected = new RegExp(`chain removed: ${key} \\(${id}\\)`);
      await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", key, { forceRefresh: true }), expected);
      await assert.rejects(getWalletAssets("0x00000000000000000000000000000000000000a1", key.toLowerCase(), { forceRefresh: true }), expected);
    }
    assert.equal(accesses, 0);
  } finally {
    globalThis.fetch = previous;
  }
});
