// Run from wcore-web: pnpm --filter @wcore/web exec node --import tsx --test __tests__/cex-holdings-state.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapCexAccounts,
  resolveCexLoadFailure,
  resolveCexRequestTransition,
  type CexHoldingsState,
  type CexScanResult,
} from "../hooks/useCexHoldings";

const STALE_MESSAGE = "Showing last known CEX holdings because refresh failed";

function makeResult(): CexScanResult {
  return {
    address: "cex:binance:account-1",
    label: "Main Binance",
    totalEur: 80,
    isCex: true,
    chains: [{
      chainKey: "CEX_BINANCE",
      chainName: "Main Binance",
      vm: "EVM",
      native: null,
      tokens: [{
        contract: "BTC:spot",
        symbol: "BTC",
        name: "BTC",
        decimals: 0,
        balance: 0.001,
        priceEur: 80_000,
        priceSource: "binance",
        valueEur: 80,
        flags: [],
      }],
      totals: { valueEur: 80, tokenCount: 1, pricedCount: 1 },
      errors: [],
      degraded: false,
      fxRate: 0,
      scanMs: 0,
      cachedAt: "2026-07-10T08:00:00.000Z",
      scriptVersion: "cex",
    }],
  };
}

test("resolveCexLoadFailure clears holdings after authentication failures", () => {
  const previous = [makeResult()];

  assert.deepEqual(resolveCexLoadFailure(previous, 401), []);
  assert.deepEqual(resolveCexLoadFailure(previous, 403), []);
});

test("resolveCexLoadFailure preserves stale holdings and totals for transient failures", () => {
  for (const status of [429, 500, 503, undefined]) {
    const previous = [makeResult()];
    const original = structuredClone(previous);
    const previousResult = previous[0];
    assert.ok(previousResult);
    const previousChain = previousResult.chains[0];
    assert.ok(previousChain);
    const tokens = previousChain.tokens;
    const totals = previousChain.totals;

    const next = resolveCexLoadFailure(previous, status);
    const nextResult = next[0];
    assert.ok(nextResult);
    const nextChain = nextResult.chains[0];
    assert.ok(nextChain);

    assert.deepEqual(previous, original);
    assert.equal(nextResult.address, previousResult.address);
    assert.equal(nextResult.label, previousResult.label);
    assert.equal(nextResult.totalEur, 80);
    assert.strictEqual(nextChain.tokens, tokens);
    assert.strictEqual(nextChain.totals, totals);
    assert.equal(nextChain.degraded, true);
    assert.deepEqual(nextChain.errors, [{ stage: "sync", message: STALE_MESSAGE }]);
  }
});

test("resolveCexLoadFailure adds the stale marker exactly once across repeated failures", () => {
  const first = resolveCexLoadFailure([makeResult()], 500);
  const second = resolveCexLoadFailure(first, undefined);
  const secondResult = second[0];
  assert.ok(secondResult);
  const secondChain = secondResult.chains[0];
  assert.ok(secondChain);
  const markers = secondChain.errors.filter(
    (error) => error.stage === "sync" && error.message === STALE_MESSAGE,
  );

  assert.equal(markers.length, 1);
});

test("mapCexAccounts maps successful holdings and treats an empty response as authoritative", () => {
  const accounts = [{
    id: "account-1",
    provider: "binance" as const,
    label: "Main Binance",
    lastSyncAt: "2026-07-10T08:00:00.000Z",
    lastSyncStatus: "ok",
    lastSyncError: null,
    holdings: [{
      id: "holding-1",
      symbol: "BTC",
      bucket: "spot",
      balance: 0.001,
      priceEur: 80_000,
      valueEur: 80,
      source: "binance",
      updatedAt: "2026-07-10T08:00:00.000Z",
    }],
  }];

  const mapped = mapCexAccounts(accounts);
  const result = mapped[0];
  assert.ok(result);
  const chain = result.chains[0];
  assert.ok(chain);
  const token = chain.tokens[0];
  assert.ok(token);

  assert.equal(result.totalEur, 80);
  assert.equal(token.balance, 0.001);
  assert.equal(token.priceEur, 80_000);
  assert.deepEqual(chain.totals, { valueEur: 80, tokenCount: 1, pricedCount: 1 });
  assert.deepEqual(mapCexAccounts([]), []);
});

test("resolveCexRequestTransition drops previous holdings when the active session changed", () => {
  const previous: CexHoldingsState = { sessionKey: "0xaaa", results: [makeResult()] };

  const next = resolveCexRequestTransition(previous, {
    activeSessionKey: "0xbbb",
    requestSessionKey: "0xaaa",
    requestId: 1,
    latestRequestId: 1,
  }, { type: "failure", status: 500 });

  assert.deepEqual(next, { sessionKey: "0xbbb", results: [] });
});

test("resolveCexRequestTransition ignores an obsolete request from the same session", () => {
  const previous: CexHoldingsState = { sessionKey: "0xaaa", results: [makeResult()] };

  const next = resolveCexRequestTransition(previous, {
    activeSessionKey: "0xaaa",
    requestSessionKey: "0xaaa",
    requestId: 1,
    latestRequestId: 2,
  }, { type: "success", results: [] });

  assert.strictEqual(next, previous);
});

test("resolveCexRequestTransition applies the current request for the active session", () => {
  const previous: CexHoldingsState = { sessionKey: "0xaaa", results: [] };
  const fresh = [makeResult()];

  const next = resolveCexRequestTransition(previous, {
    activeSessionKey: "0xaaa",
    requestSessionKey: "0xaaa",
    requestId: 2,
    latestRequestId: 2,
  }, { type: "success", results: fresh });

  assert.deepEqual(next, { sessionKey: "0xaaa", results: fresh });
});

test("resolveCexRequestTransition clears fail-closed when the active session is null", () => {
  const previous: CexHoldingsState = { sessionKey: "0xaaa", results: [makeResult()] };

  const next = resolveCexRequestTransition(previous, {
    activeSessionKey: null,
    requestSessionKey: "0xaaa",
    requestId: 1,
    latestRequestId: 1,
  }, { type: "failure", status: 500 });

  assert.deepEqual(next, { sessionKey: null, results: [] });
});
