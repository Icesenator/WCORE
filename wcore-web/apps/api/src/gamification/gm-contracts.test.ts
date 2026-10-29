import { test } from "node:test";
import assert from "node:assert/strict";
import { filterHistoricalContracts, filterDisabledGmContracts, filterUnusedGmContracts, filterUnsupportedGmChains, findVerifiedDeployedContract, pickCreatorContractsFirst, prepareMyContractsResponse } from "./gm-contracts.js";
import { GM_HISTORICAL_FACTORIES } from "@wcore/shared";

const DEPLOYED_EVENT = "0x33c981baba081f8fd2c52ac6ad1ea95b6814b4376640f55689051f6584729688";
const FACTORY = "0xe7cfd4b041650ddc8861ffe066a2cd2cce0f6ecb";
const CREATOR = "0x1000000000000000000000000000000000000001";
const CONTRACT = "0x2000000000000000000000000000000000000001";

function topicAddress(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

test("prepareMyContractsResponse merges case-variant duplicate contracts and hides zero-balance platform-only rows", () => {
  const contracts = prepareMyContractsResponse([
    {
      id: "creator-base",
      chainKey: "base",
      contractAddress: "0xea392000a2ae8045cfe72e538cdfbb809c6c49ea",
      creatorBalance: "176000000000000",
      platformBalance: "176000000000000",
      role: "creator",
    },
    {
      id: "platform-base-duplicate",
      chainKey: "BASE",
      contractAddress: "0xEA392000A2AE8045CFE72E538CDFBB809C6C49EA",
      creatorBalance: "0",
      platformBalance: "176000000000000",
      role: "platform",
    },
    {
      id: "platform-empty",
      chainKey: "BASE",
      contractAddress: "0x4622e578ca79864dd475cc241e623e2ba556fb1b",
      creatorBalance: "0",
      platformBalance: "0",
      role: "platform",
    },
  ], true);

  assert.equal(contracts.length, 1);
  assert.equal(contracts[0]?.id, "creator-base");
  assert.equal(contracts[0]?.chainKey, "base");
  assert.equal(contracts[0]?.contractAddress, "0xea392000a2ae8045cfe72e538cdfbb809c6c49ea");
  assert.equal(contracts[0]?.role, "creator");
  assert.equal(contracts[0]?.creatorBalance, "176000000000000");
  assert.equal(contracts[0]?.platformBalance, "176000000000000");
});

test("filterUnusedGmContracts filters already used contracts from a batched used-id set", () => {
  const contracts = [
    { id: "contract-a", chainKey: "BASE", contractAddress: "0xa" },
    { id: "contract-b", chainKey: "BASE", contractAddress: "0xb" },
    { id: "contract-c", chainKey: "BASE", contractAddress: "0xc" },
  ];

  const eligible = filterUnusedGmContracts(contracts, new Set(["contract-b"]));

  assert.deepEqual(eligible.map((contract) => contract.id), ["contract-a", "contract-c"]);
});

test("pickCreatorContractsFirst prefers contracts created by the requested address", () => {
  const contracts = [
    { id: "old-base", chainKey: "BASE", contractAddress: "0x4622e578ca79864dd475cc241e623e2ba556fb1b", creatorAddress: "0x1111111111111111111111111111111111111111" },
    { id: "good-base", chainKey: "BASE", contractAddress: "0xea392000a2ae8045cfe72e538cdfbb809c6c49ea", creatorAddress: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080" },
  ];

  const picked = pickCreatorContractsFirst(contracts, "0x17D518736ee9341DCdC0A2498e013D33cFcDD080");

  assert.deepEqual(picked.map((contract) => contract.id), ["good-base"]);
});

test("filterDisabledGmContracts removes the legacy Base contract", () => {
  const contracts = filterDisabledGmContracts([
    { id: "old-base", chainKey: "BASE", contractAddress: "0x4622e578ca79864dd475cc241e623e2ba556fb1b" },
    { id: "good-base", chainKey: "BASE", contractAddress: "0xea392000a2ae8045cfe72e538cdfbb809c6c49ea" },
  ]);

  assert.deepEqual(contracts.map((contract) => contract.id), ["good-base"]);
});

test("filterUnsupportedGmChains drops rows of halted chains that left GM_FACTORIES", () => {
  // WC-13 halted polygon_zkevm on 2026-07-03 but its gm_contracts rows stayed in
  // the DB, so /api/gm/random kept handing them out and the header GM died with
  // "GM not supported on polygon_zkevm. Factory not deployed yet."
  const contracts = filterUnsupportedGmChains([
    { id: "lisk-stale", chainKey: "lisk", contractAddress: "0x3000000000000000000000000000000000000003" },
    { id: "lisk-stale-upper", chainKey: "LISK", contractAddress: "0x3000000000000000000000000000000000000004" },
    { id: "zkevm-stale", chainKey: "polygon_zkevm", contractAddress: "0x3000000000000000000000000000000000000001" },
    { id: "zkevm-stale-upper", chainKey: "POLYGON_ZKEVM", contractAddress: "0x3000000000000000000000000000000000000002" },
    { id: "base-live", chainKey: "BASE", contractAddress: "0xea392000a2ae8045cfe72e538cdfbb809c6c49ea" },
  ]);

  assert.deepEqual(contracts.map((contract) => contract.id), ["base-live"]);
});

test("findVerifiedDeployedContract extracts a factory deployment only after strict receipt checks", () => {
  const receipt = {
    to: FACTORY,
    status: "0x1",
    logs: [{ address: FACTORY, topics: [DEPLOYED_EVENT, topicAddress(CONTRACT), topicAddress(CREATOR)] }],
  };

  assert.equal(findVerifiedDeployedContract(receipt, FACTORY, DEPLOYED_EVENT, CREATOR), CONTRACT);
  assert.equal(findVerifiedDeployedContract({ ...receipt, status: "0x0" }, FACTORY, DEPLOYED_EVENT, CREATOR), null);
  assert.equal(findVerifiedDeployedContract({ ...receipt, to: CONTRACT }, FACTORY, DEPLOYED_EVENT, CREATOR), null);
  assert.equal(findVerifiedDeployedContract(receipt, FACTORY, DEPLOYED_EVENT, "0x3000000000000000000000000000000000000003"), null);
});

test("historical chains are identified and separated from active factories", () => {
  // Historical chains exist in GM_HISTORICAL_FACTORIES but not in GM_FACTORIES
  const historicalKeys = Object.keys(GM_HISTORICAL_FACTORIES);
  assert.ok(historicalKeys.includes("degen"));
  assert.ok(historicalKeys.includes("superposition"));
  assert.ok(!historicalKeys.includes("moca"));
  assert.ok(!historicalKeys.includes("base"));

  // filterUnsupportedGmChains (active-only) filters out historical chains
  const mixedContracts = [
    { id: "active-base", chainKey: "BASE", contractAddress: "0x1" },
    { id: "historical-degen", chainKey: "DEGEN", contractAddress: "0x2" },
    { id: "historical-superposition", chainKey: "SUPERPOSITION", contractAddress: "0x3" },
  ];
  const activeOnly = filterUnsupportedGmChains(mixedContracts);
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0]?.id, "active-base");

  // Active chains still pass
  const activeKept = filterUnsupportedGmChains([{ id: "test", chainKey: "MOCA", contractAddress: "0x1" }]);
  assert.equal(activeKept.length, 1);
  assert.equal(activeKept[0]?.id, "test");
});

test("historical registry keeps addresses without fabricating a retirement date", () => {
  const degen = GM_HISTORICAL_FACTORIES.degen;
  assert.ok(degen);
  assert.equal(degen.address, "0xc3e5ef8c71712f55fabc6b3c07844a49103c9d8f");
  assert.equal(degen.chainId, 666666666);
  assert.equal(Object.prototype.hasOwnProperty.call(degen, "retiredAt"), false);

  const superposition = GM_HISTORICAL_FACTORIES.superposition;
  assert.ok(superposition);
  assert.equal(superposition.address, "0x8e2530ef73ef47a1f086f8baf423c1bdcd9e472f");
  assert.equal(superposition.chainId, 55244);
  assert.equal(Object.prototype.hasOwnProperty.call(superposition, "retiredAt"), false);
});

test("filterHistoricalContracts keeps only retired-chain rows, case-insensitively", () => {
  const rows = [
    { id: "degen-lower", chainKey: "degen", contractAddress: "0x1000000000000000000000000000000000000001" },
    { id: "superposition-upper", chainKey: "SUPERPOSITION", contractAddress: "0x2000000000000000000000000000000000000002" },
    { id: "degen-mixed", chainKey: "Degen", contractAddress: "0x3000000000000000000000000000000000000003" },
    { id: "active-base", chainKey: "BASE", contractAddress: "0x4000000000000000000000000000000000000004" },
    { id: "active-moca", chainKey: "MOCA", contractAddress: "0x5000000000000000000000000000000000000005" },
  ];

  const historical = filterHistoricalContracts(rows).map((r) => r.id);
  assert.deepEqual(historical, ["degen-lower", "superposition-upper", "degen-mixed"]);

  // Active chains (incl. Moca) never enter the history path — no regression
  assert.equal(filterHistoricalContracts(rows).some((r) => r.id === "active-moca"), false);

  // No historical rows → empty result is valid
  assert.deepEqual(filterHistoricalContracts([{ id: "x", chainKey: "BASE", contractAddress: "0x6" }]), []);
  assert.deepEqual(filterHistoricalContracts([]), []);
});
