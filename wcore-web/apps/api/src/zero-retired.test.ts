import { test } from "node:test";
import assert from "node:assert/strict";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES } from "@wcore/shared";
import { ChainKey } from "./schemas.js";

// ZERO Network (543210) : retirée le 2026-11-21 (arrêt annoncé pour le 2026-07-31, chaîne constatée à l'arrêt).
// Modèle : swellchain-retired.test.ts. Aucune factory GM n'a jamais existé pour cette chaîne.
test("API : ZERO Network n'a aucune factory GM, active ni historique", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(GM_FACTORIES, "zero"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(GM_HISTORICAL_FACTORIES, "zero"), false);
  assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 543210));
  assert.equal(GM_FACTORIES.base?.chainId, 8453, "Base intact");
  assert.equal(GM_FACTORIES.swan?.chainId, 254, "Swan intact");
});

test("API : une requête de scan ou de GM sur ZERO Network est refusée par le schéma, avant tout réseau", () => {
  for (const key of ["zero", "ZERO", "543210", "0x849ea"]) {
    assert.equal(ChainKey.safeParse(key).success, false, key);
  }
  for (const key of ["base", "swan", "ethereum", "zetachain"]) assert.equal(ChainKey.safeParse(key).success, true, key);
});
