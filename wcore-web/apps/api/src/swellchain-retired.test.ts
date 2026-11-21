import { test } from "node:test";
import assert from "node:assert/strict";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES } from "@wcore/shared";
import { ChainKey } from "./schemas.js";
import { buildGmStatusResponse } from "./gamification/gm-routes.js";
import { filterHistoricalContracts, filterUnsupportedGmChains } from "./gamification/gm-contracts.js";

// Swellchain (1923) : retirée le 2026-11-21 (réseau arrêté le 2026-06-30, retraits clos le 2026-06-15).
// Modèle : moonbeam-moonriver-retired.test.ts.
const CONTRACT = "0x3000000000000000000000000000000000000003";

test("API : Swellchain n'est plus une factory GM active (aucun warm-up RPC, aucun GM)", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(GM_FACTORIES, "swellchain"), false);
  assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 1923));
  assert.equal(GM_FACTORIES.base?.chainId, 8453, "Base intact");
  assert.equal(GM_FACTORIES.swan?.chainId, 254, "Swan intact");
});

test("API : une requête de scan ou de GM sur Swellchain est refusée par le schéma, avant tout réseau", () => {
  for (const key of ["swellchain", "SWELLCHAIN", "1923", "0x783"]) {
    assert.equal(ChainKey.safeParse(key).success, false, key);
  }
  for (const key of ["base", "swan", "ethereum"]) assert.equal(ChainKey.safeParse(key).success, true, key);
});

test("API : les contrats déjà déployés quittent les parcours actifs mais restent en historique", () => {
  const rows = [
    { id: "swell-lower", chainKey: "swellchain", contractAddress: CONTRACT },
    { id: "swell-upper", chainKey: "SWELLCHAIN", contractAddress: CONTRACT },
    { id: "base", chainKey: "base", contractAddress: "0x4000000000000000000000000000000000000004" },
  ];
  assert.deepEqual(filterUnsupportedGmChains(rows).map((r) => r.id), ["base"]);
  assert.deepEqual(filterHistoricalContracts(rows).map((r) => r.id), ["swell-lower", "swell-upper"]);
  assert.deepEqual(GM_HISTORICAL_FACTORIES.swellchain, { address: "0x3177892304a1b928f34b054e280cd77a0e83872a", chainId: 1923 });
  const status = buildGmStatusResponse([{ chainKey: "SWELLCHAIN" }, { chainKey: "base" }], [{ chainKey: "swellchain" }]);
  assert.deepEqual(Object.keys(status), ["base"], "aucun statut GM actif pour Swellchain");
});
