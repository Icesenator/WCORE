import { test } from "node:test";
import assert from "node:assert/strict";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES } from "@wcore/shared";
import { ChainKey } from "./schemas.js";

// Douze chaînes sans RPC (constat WCORE du 2026-11-22) : modèle zero-retired.test.ts, en boucle.
// Aucune factory GM n'a jamais existé pour ces chaînes.
const RETIRED = [
  ["nexus", 3946], ["airdao", 16718], ["crossbell", 3737], ["edgeless", 2026],
  ["lumio", 8866], ["dogechain", 2000], ["hychain", 2911], ["proof_of_play_apex", 70700],
  ["step_network", 1234], ["shimmer_evm", 148], ["lorenzo", 8329], ["dos_chain", 7979],
] as const;

test("API : les douze chaînes sans RPC n'ont aucune factory GM, active ni historique", () => {
  for (const [key, id] of RETIRED) {
    assert.equal(Object.prototype.hasOwnProperty.call(GM_FACTORIES, key), false, key);
    assert.equal(Object.prototype.hasOwnProperty.call(GM_HISTORICAL_FACTORIES, key), false, key);
    assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === id), String(id));
  }
  assert.equal(GM_FACTORIES.base?.chainId, 8453, "Base intact");
});

test("API : une requête de scan ou de GM sur ces chaînes est refusée par le schéma, avant tout réseau", () => {
  for (const [key, id] of RETIRED) {
    for (const alias of [key, key.toUpperCase(), String(id), "0x" + id.toString(16)]) {
      assert.equal(ChainKey.safeParse(alias).success, false, alias);
    }
  }
  for (const key of ["base", "BASE", "ethereum", "core", "CORE", "1116", "iota_evm"]) {
    assert.equal(ChainKey.safeParse(key).success, true, key);
  }
});
