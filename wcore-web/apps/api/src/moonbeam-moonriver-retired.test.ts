import { test } from "node:test";
import assert from "node:assert/strict";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES } from "@wcore/shared";
import { ChainKey } from "./schemas.js";
import { buildGmStatusResponse } from "./gamification/gm-routes.js";
import { filterHistoricalContracts, filterUnsupportedGmChains } from "./gamification/gm-contracts.js";

// Moonbeam (1284) et Moonriver (1285) : retirées le 2026-11-21 (GLMR et MOVR migrés vers Base,
// réseaux arrêtés ou figés). Modèle : b3-mainnet-retired.test.ts.
const CONTRACT = "0x3000000000000000000000000000000000000003";

test("API : Moonbeam et Moonriver ne sont plus des factories GM actives (aucun warm-up RPC, aucun GM)", () => {
  for (const key of ["moonbeam", "moonriver"]) assert.equal(Object.prototype.hasOwnProperty.call(GM_FACTORIES, key), false, key);
  assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 1284 || f.chainId === 1285));
  assert.equal(GM_FACTORIES.base?.chainId, 8453, "Base intact");
  assert.equal(GM_FACTORIES.astar?.chainId, 592, "Astar intact");
});

test("API : une requête de scan ou de GM sur Moonbeam ou Moonriver est refusée par le schéma, avant tout réseau", () => {
  for (const key of ["moonbeam", "MOONBEAM", "1284", "0x504", "moonriver", "MOONRIVER", "1285", "0x505"]) {
    assert.equal(ChainKey.safeParse(key).success, false, key);
  }
  for (const key of ["base", "astar", "ethereum"]) assert.equal(ChainKey.safeParse(key).success, true, key);
});

test("API : les contrats déjà déployés quittent les parcours actifs mais restent en historique", () => {
  const rows = [
    { id: "moonbeam-lower", chainKey: "moonbeam", contractAddress: CONTRACT },
    { id: "moonbeam-upper", chainKey: "MOONBEAM", contractAddress: CONTRACT },
    { id: "moonriver-lower", chainKey: "moonriver", contractAddress: CONTRACT },
    { id: "moonriver-upper", chainKey: "MOONRIVER", contractAddress: CONTRACT },
    { id: "base", chainKey: "base", contractAddress: "0x4000000000000000000000000000000000000004" },
  ];
  assert.deepEqual(filterUnsupportedGmChains(rows).map((r) => r.id), ["base"]);
  assert.deepEqual(filterHistoricalContracts(rows).map((r) => r.id), ["moonbeam-lower", "moonbeam-upper", "moonriver-lower", "moonriver-upper"]);
  assert.deepEqual(GM_HISTORICAL_FACTORIES.moonbeam, { address: "0x3fa756f1da5027a8ff692b2d65dface8eb446aaf", chainId: 1284 });
  assert.deepEqual(GM_HISTORICAL_FACTORIES.moonriver, { address: "0x5472f231a017ce1f03ccdfb2325a7d6a90b07de1", chainId: 1285 });
  const status = buildGmStatusResponse([{ chainKey: "MOONBEAM" }, { chainKey: "moonriver" }, { chainKey: "base" }], [{ chainKey: "moonbeam" }]);
  assert.deepEqual(Object.keys(status), ["base"], "aucun statut GM actif pour Moonbeam ni Moonriver");
});
