import { test } from "node:test";
import assert from "node:assert/strict";
import { getCosmosWalletAssets } from "./cosmos.js";
import { MemoryCacheStore } from "../cache/index.js";

const ADDRESS = "cosmos1nvfsmt48nemfullrkkxa6gze05c4xeypfslj7t";

const DELEGATIONS = "/cosmos/staking/v1beta1/delegations/";
const UNBONDING = "/unbonding_delegations";
const REWARDS = "/cosmos/distribution/v1beta1/delegators/";

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function classify(url: string): "delegations" | "unbonding" | "rewards" | null {
  if (url.includes(UNBONDING)) return "unbonding";
  if (url.includes(DELEGATIONS)) return "delegations";
  if (url.includes(REWARDS)) return "rewards";
  return null;
}

test("the three staking reads are issued together, not one after another", async () => {
  let inFlight = 0;
  let peak = 0;

  const fetchImpl = (async (url: string) => {
    const kind = classify(String(url));
    if (!kind) return json({ balances: [] });

    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 30));
    inFlight--;

    if (kind === "delegations") {
      return json({ delegation_responses: [{ balance: { denom: "uatom", amount: "1000000" } }] });
    }
    if (kind === "unbonding") {
      return json({ unbonding_responses: [{ entries: [{ balance: "2000000" }] }] });
    }
    return json({ total: [{ denom: "uatom", amount: "3000000" }] });
  }) as unknown as typeof fetch;

  const assets = await getCosmosWalletAssets(ADDRESS, "COSMOS_HUB", { fetchImpl, fxRate: 1 });

  // Awaiting them in sequence made a chain with a slow endpoint pay that latency three
  // times over; the REST failover alone allows 10 s per call.
  assert.equal(peak, 3, `the staking reads must overlap, peak concurrency was ${peak}`);

  // The staked total must still be delegations + unbonding + native rewards.
  assert.equal(assets.native.balance, 6, "1 + 2 + 3 ATOM staked must be summed");
});

test("a failed staking read falls back to its cached copy", async () => {
  const cache = new MemoryCacheStore();

  const fetchImpl = (async (url: string) => {
    const kind = classify(String(url));
    if (kind === "delegations") {
      return json({ delegation_responses: [{ balance: { denom: "uatom", amount: "5000000" } }] });
    }
    if (kind === "unbonding") return json({ unbonding_responses: [] });
    if (kind === "rewards") return json({ total: [] });
    return json({ balances: [] });
  }) as unknown as typeof fetch;

  const warm = await getCosmosWalletAssets(ADDRESS, "COSMOS_HUB", { fetchImpl, fxRate: 1, cache });
  assert.equal(warm.native.balance, 5, "precondition: 5 ATOM delegated");
  await new Promise((r) => setTimeout(r, 300)); // the cache write is fire-and-forget

  const failing = (async (url: string) => {
    if (classify(String(url)) === "delegations") return json({}, 503);
    if (classify(String(url))) return json({ unbonding_responses: [], total: [] });
    return json({ balances: [] });
  }) as unknown as typeof fetch;

  const degraded = await getCosmosWalletAssets(ADDRESS, "COSMOS_HUB", { fetchImpl: failing, fxRate: 1, cache });

  assert.equal(degraded.native.balance, 5, "a transient outage must not erase a live delegation");
  assert.ok(
    degraded.errors.some((e) => e.includes("[DEGRADED] delegations")),
    "the fallback must be visible to the caller",
  );
});
