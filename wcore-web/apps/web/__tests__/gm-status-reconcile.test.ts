import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { gmStatusFetchPlan, shouldCheckOnchainGmStatus, shouldUseInitialGmStatusWithoutCheck } from "../lib/gm-status-reconcile";

describe("GM status reconciliation", () => {
  test("checks on-chain status when DB knows the contract but not today's GM", () => {
    assert.equal(shouldCheckOnchainGmStatus({ deployed: true, gmDone: false }), true);
  });

  test("does not check on-chain status when DB already has today's GM", () => {
    assert.equal(shouldCheckOnchainGmStatus({ deployed: true, gmDone: true }), false);
  });

  test("does not check on-chain status before a contract is known", () => {
    assert.equal(shouldCheckOnchainGmStatus({ deployed: false, gmDone: false }), false);
    assert.equal(shouldCheckOnchainGmStatus(undefined), false);
  });

  test("does not trust initial deployed status when GM is missing in DB", () => {
    assert.equal(shouldUseInitialGmStatusWithoutCheck({ deployed: true, gmDone: false }), false);
    assert.equal(shouldUseInitialGmStatusWithoutCheck({ deployed: true, gmDone: true }), true);
  });
});

describe("GM status fetch plan (avoids per-card global fetch fan-out)", () => {
  test("no initial status → standalone card fetches deploy + global status", () => {
    const plan = gmStatusFetchPlan(undefined);
    assert.deepEqual(plan, { fetchHasDeployed: true, fetchGlobalStatus: true, fetchOnchain: false });
  });

  test("page-provided done status → no network calls at all", () => {
    const plan = gmStatusFetchPlan({ deployed: true, gmDone: true });
    assert.deepEqual(plan, { fetchHasDeployed: false, fetchGlobalStatus: false, fetchOnchain: false });
  });

  test("page-provided deployed-but-not-done → only the targeted on-chain reconcile", () => {
    const plan = gmStatusFetchPlan({ deployed: true, gmDone: false });
    assert.deepEqual(plan, { fetchHasDeployed: false, fetchGlobalStatus: false, fetchOnchain: true });
  });

  test("page-provided not-deployed → trust the page, no redundant global re-fetch", () => {
    const plan = gmStatusFetchPlan({ deployed: false, gmDone: false });
    assert.deepEqual(plan, { fetchHasDeployed: false, fetchGlobalStatus: false, fetchOnchain: false });
  });

  test("unknown deployed status → only targeted has-deployed check", () => {
    const plan = gmStatusFetchPlan({ deployed: null, gmDone: false });
    assert.deepEqual(plan, { fetchHasDeployed: true, fetchGlobalStatus: false, fetchOnchain: false });
  });
});
