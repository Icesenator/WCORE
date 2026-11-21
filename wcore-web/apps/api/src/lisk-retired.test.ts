import { test } from "node:test";
import assert from "node:assert/strict";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES } from "@wcore/shared";
import { ChainKey } from "./schemas.js";
import { buildGmStatusResponse } from "./gamification/gm-routes.js";
import { filterHistoricalContracts, filterUnsupportedGmChains } from "./gamification/gm-contracts.js";

// Lisk (1135) : retirée le 2026-11-21 (arrêt le 2026-11-02, Portal et Bridge fermés, réclamation manuelle annoncée pour janvier 2027).
// Modèle : swellchain-retired.test.ts.
const CONTRACT = "0x3000000000000000000000000000000000000003";

test("API : Lisk n'est plus une factory GM active (aucun warm-up RPC, aucun GM)", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(GM_FACTORIES, "lisk"), false);
  assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 1135));
  assert.equal(GM_FACTORIES.base?.chainId, 8453, "Base intact");
  assert.equal(GM_FACTORIES.swan?.chainId, 254, "Swan intact");
});

test("API : une requête de scan ou de GM sur Lisk est refusée par le schéma, avant tout réseau", () => {
  for (const key of ["lisk", "LISK", "1135", "0x46f"]) {
    assert.equal(ChainKey.safeParse(key).success, false, key);
  }
  for (const key of ["base", "swan", "ethereum"]) assert.equal(ChainKey.safeParse(key).success, true, key);
});

test("API : les contrats déjà déployés quittent les parcours actifs mais restent en historique", () => {
  const rows = [
    { id: "lisk-lower", chainKey: "lisk", contractAddress: CONTRACT },
    { id: "lisk-upper", chainKey: "LISK", contractAddress: CONTRACT },
    { id: "base", chainKey: "base", contractAddress: "0x4000000000000000000000000000000000000004" },
  ];
  assert.deepEqual(filterUnsupportedGmChains(rows).map((r) => r.id), ["base"]);
  assert.deepEqual(filterHistoricalContracts(rows).map((r) => r.id), ["lisk-lower", "lisk-upper"]);
  assert.deepEqual(GM_HISTORICAL_FACTORIES.lisk, { address: "0xcc57c6df12d926f958f36fe98c0c8a8008fac490", chainId: 1135 });
  const status = buildGmStatusResponse([{ chainKey: "LISK" }, { chainKey: "base" }], [{ chainKey: "lisk" }]);
  assert.deepEqual(Object.keys(status), ["base"], "aucun statut GM actif pour Lisk");
});
