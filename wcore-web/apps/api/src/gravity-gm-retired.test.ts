import { test } from "node:test";
import assert from "node:assert/strict";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES } from "@wcore/shared";
import { filterHistoricalContracts, filterUnsupportedGmChains } from "./gamification/gm-contracts.js";

// Gravity Alpha (1625) : réseau arrêté le 2026-11-01. Modèle : b3-mainnet-retired.test.ts.
// Différence voulue avec B3 : Gravity n'est pas dans RETIRED_CHAINS (la chaîne reste
// suivie par le scan et par Sentinel), donc ni le schéma ChainKey ni le statut GM ne
// sont épinglés ici.
const GRAVITY_CONTRACT = "0x3000000000000000000000000000000000000003";

test("API : Gravity Alpha n'est plus une factory GM active (aucun warm-up RPC, aucun GM, aucun déploiement)", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(GM_FACTORIES, "gravity"), false);
  assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 1625));
  assert.equal(GM_FACTORIES.opbnb?.chainId, 204, "opBNB intact");
  assert.equal(GM_FACTORIES.merlin?.chainId, 4200, "Merlin intact");
  assert.equal(GM_FACTORIES.base?.chainId, 8453, "Base intact");
});

test("API : les contrats Gravity déjà déployés quittent les parcours actifs mais restent en historique", () => {
  const rows = [
    { id: "gravity-lower", chainKey: "gravity", contractAddress: GRAVITY_CONTRACT },
    { id: "gravity-upper", chainKey: "GRAVITY", contractAddress: GRAVITY_CONTRACT },
    { id: "base", chainKey: "base", contractAddress: "0x4000000000000000000000000000000000000004" },
  ];
  assert.deepEqual(filterUnsupportedGmChains(rows).map((r) => r.id), ["base"]);
  assert.deepEqual(filterHistoricalContracts(rows).map((r) => r.id), ["gravity-lower", "gravity-upper"]);
  assert.deepEqual(GM_HISTORICAL_FACTORIES.gravity, { address: "0x8d0cf2c602efdc3b696341cc03ec62e813771c48", chainId: 1625 });
});
