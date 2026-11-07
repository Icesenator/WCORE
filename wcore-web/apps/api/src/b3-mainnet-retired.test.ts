import { test } from "node:test";
import assert from "node:assert/strict";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES } from "@wcore/shared";
import { ChainKey } from "./schemas.js";
import { buildGmStatusResponse } from "./gamification/gm-routes.js";
import { filterHistoricalContracts, filterUnsupportedGmChains } from "./gamification/gm-contracts.js";

const B3_CONTRACT = "0x3000000000000000000000000000000000000003";

test("API : B3 Mainnet n'est plus une factory GM active (aucun warm-up RPC, aucun GM)", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(GM_FACTORIES, "b3"), false);
  assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 8333));
  assert.equal(GM_FACTORIES.b2?.chainId, 223, "B2 intact");
  assert.equal(GM_FACTORIES.base?.chainId, 8453, "Base intact");
});

test("API : une requête de scan ou de GM sur B3 est refusée par le schéma, avant tout réseau", () => {
  for (const key of ["b3", "B3", "8333", "0x208d"]) {
    const r = ChainKey.safeParse(key);
    assert.equal(r.success, false, key);
  }
  for (const key of ["base", "b2", "ethereum"]) assert.equal(ChainKey.safeParse(key).success, true, key);
});

test("API : les contrats B3 déjà déployés quittent les parcours actifs mais restent en historique", () => {
  const rows = [
    { id: "b3-lower", chainKey: "b3", contractAddress: B3_CONTRACT },
    { id: "b3-upper", chainKey: "B3", contractAddress: B3_CONTRACT },
    { id: "base", chainKey: "base", contractAddress: "0x4000000000000000000000000000000000000004" },
  ];
  assert.deepEqual(filterUnsupportedGmChains(rows).map((r) => r.id), ["base"]);
  assert.deepEqual(filterHistoricalContracts(rows).map((r) => r.id), ["b3-lower", "b3-upper"]);
  assert.deepEqual(GM_HISTORICAL_FACTORIES.b3, { address: "0x14bfaa1302ab5ea8041d3dfec9abb668efbf2f34", chainId: 8333 });
  const status = buildGmStatusResponse([{ chainKey: "B3" }, { chainKey: "base" }], [{ chainKey: "b3" }]);
  assert.deepEqual(Object.keys(status), ["base"], "aucun statut GM actif pour B3");
});
