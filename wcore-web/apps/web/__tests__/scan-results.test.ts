import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ChainScan } from "@wcore/shared";
import { mergeChainResults, orderScanJobsForExecution, shouldCacheWalletScanResult } from "../components/scan-results";

function chain(chainKey: string, valueEur: number, errors: string[] = []): ChainScan {
  return {
    chainKey,
    chainName: chainKey,
    vm: "EVM",
    native: null,
    tokens: [],
    totals: { valueEur, tokenCount: valueEur > 0 ? 1 : 0, pricedCount: valueEur > 0 ? 1 : 0 },
    errors: errors.map((message) => ({ stage: "scan" as const, message })),
    degraded: errors.length > 0,
    fxRate: 0.92,
    scanMs: 100,
    cachedAt: null,
    scriptVersion: "test",
  };
}

describe("scan result merging", () => {
  test("prioritizes SVM and Cosmos jobs without separating EVM into a second phase", () => {
    const jobs = [
      { vm: "EVM", chain: "BASE" },
      { vm: "SVM", chain: "SOLANA" },
      { vm: "EVM", chain: "ETHEREUM" },
      { vm: "COSMOS", chain: "INJECTIVE" },
    ];

    const ordered = orderScanJobsForExecution(jobs);

    assert.deepEqual(ordered.map((job) => job.chain), ["SOLANA", "INJECTIVE", "BASE", "ETHEREUM"]);
    assert.notEqual(ordered, jobs);
  });

  test("merges partial async poll chains without waiting for job completion", () => {
    const existing = [chain("BASE", 10), chain("GNOSIS", 5)];
    const incoming = [chain("BASE", 12), chain("NEXUS", 3)];

    const merged = mergeChainResults(existing, incoming);

    assert.deepEqual(merged.chains.map((c) => c.chainKey), ["BASE", "GNOSIS", "NEXUS"]);
    assert.equal(merged.chains[0]?.totals.valueEur, 12);
    assert.equal(merged.totalEur, 20);
  });

  test("replaces stale chain results case-insensitively", () => {
    const existing = [chain("solana", 3.99)];
    const incoming = [chain("SOLANA", 7.65)];

    const merged = mergeChainResults(existing, incoming);

    assert.deepEqual(merged.chains.map((c) => c.chainKey), ["SOLANA"]);
    assert.equal(merged.totalEur, 7.65);
  });

  test("does not cache partial results when the async scan ends with an error", () => {
    assert.equal(shouldCacheWalletScanResult([chain("BASE", 10)], "timeout"), false);
    assert.equal(shouldCacheWalletScanResult([chain("BASE", 10)], undefined), true);
  });

  test("does not cache wallets containing empty errored chain results", () => {
    assert.equal(shouldCacheWalletScanResult([
      chain("SOLANA", 8, ["native balance: no strict consensus (1/2 agree) using max reported balance"]),
      chain("COSMOS_HUB", 0, ["balances HTTP 400"]),
    ], undefined), false);
  });

  test("does not cache wallets containing partial critical scan failures", () => {
    assert.equal(shouldCacheWalletScanResult([
      chain("SOLANA", 3.6, ["token accounts: no data from any RPC endpoint"]),
    ], undefined), false);

    assert.equal(shouldCacheWalletScanResult([
      chain("COSMOS_HUB", 0.12, ["balances fetch: This operation was aborted"]),
    ], undefined), false);
  });

  test("does not cache scans where a major priceable token has no price", () => {
    const ethereum = chain("ETHEREUM", 16.32, ["WBTC price: NO_PRICE"]);
    ethereum.tokens = [{
      contract: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
      symbol: "WBTC",
      name: "Wrapped BTC",
      decimals: 8,
      balance: 0.0041221,
      priceEur: null,
      priceSource: null,
      valueEur: null,
      flags: ["NO_PRICE"],
    }];

    assert.equal(shouldCacheWalletScanResult([ethereum], undefined), false);
  });
});
