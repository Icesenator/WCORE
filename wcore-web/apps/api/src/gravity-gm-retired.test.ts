import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES } from "@wcore/shared";
import { filterHistoricalContracts, filterUnsupportedGmChains } from "./gamification/gm-contracts.js";
import { registerGmOnchainRoutes } from "./gamification/gm-onchain.js";

// Gravity Alpha (1625) : réseau arrêté le 2026-11-01. Modèle : b3-mainnet-retired.test.ts.
// Différence voulue avec B3 : Gravity n'est pas dans RETIRED_CHAINS (la chaîne reste
// suivie par le scan et par Sentinel), donc ni le schéma ChainKey ni le statut GM ne
// sont épinglés ici.
const GRAVITY_CONTRACT = "0x3000000000000000000000000000000000000003";
const SAMPLE_TX = "0x" + "ab".repeat(32);

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

test("API : POST /api/gm/onchain refuse une chaîne sans factory GM active, avant toute base et tout réseau", async () => {
  let dbCalls = 0;
  let rpcLookups = 0;
  let networkCalls = 0;
  const prisma = { gmContract: { findFirst: async () => { dbCalls++; return null; } } };
  const app = Fastify();
  app.decorateRequest("user", undefined);
  app.addHook("onRequest", async (req) => {
    (req as unknown as { user: { id: string; address: string } }).user = { id: "u1", address: "0x00000000000000000000000000000000000000a1" };
  });
  await registerGmOnchainRoutes(app, prisma as never, {
    prisma: prisma as never,
    startOfUtcDay: (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
    // Un RPC existe pour toutes les chaînes : seul le contrôle de factory peut refuser Gravity.
    getChainRpc: () => { rpcLookups++; return "https://203.0.113.10"; },
    getChainRpcs: () => ["https://203.0.113.10"],
    checkStreakBadges: async () => {},
    addReferralBonus: async () => {},
    isAdminAuthorized: () => false,
    rpcFetch: async () => ({}),
    FACTORIES: GM_FACTORIES,
    CONTRACT_DEPLOYED_EVENT: "0x33c981baba081f8fd2c52ac6ad1ea95b6814b4376640f55689051f6584729688",
    extractDeployedContractAddresses: () => [],
    getChainMaxLogRange: () => 1024,
    GM_EVENT_SIG: "0x1374bba5cce7233cce0d4275e8dd0bc1b0ef510fb043198247fc3cb179f8189d",
  });
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => { networkCalls++; throw new Error("réseau interdit"); }) as typeof fetch;
  try {
    for (const chainKey of ["gravity", "GRAVITY", "degen"]) {
      const res = await app.inject({ method: "POST", url: "/api/gm/onchain", payload: { txHash: SAMPLE_TX, chainKey, contractAddress: GRAVITY_CONTRACT } });
      assert.equal(res.statusCode, 400, chainKey);
      assert.equal(res.json().error, "unsupported_chain", chainKey);
    }
    assert.deepEqual({ dbCalls, rpcLookups, networkCalls }, { dbCalls: 0, rpcLookups: 0, networkCalls: 0 });

    // Contrôle positif : une chaîne active franchit la garde et atteint la recherche du contrat.
    const active = await app.inject({ method: "POST", url: "/api/gm/onchain", payload: { txHash: SAMPLE_TX, chainKey: "base" } });
    assert.equal(active.statusCode, 400);
    assert.equal(active.json().error, "no_gm_contract_for_chain");
    assert.equal(rpcLookups, 1);
    assert.equal(dbCalls, 1);
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = previous;
    await app.close();
  }
});
