import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ChainScan } from "@wcore/shared";
import { buildScanOrchestratorJobs, mergeChainRefreshResult } from "../hooks/useScanOrchestrator";

const EVM = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";

test("the public scan hook never calls the admin-only circuit endpoint", () => {
  const source = readFileSync(new URL("../hooks/useScanOrchestrator.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\/api\/circuit/);
  assert.match(source, /message\?\.includes\("circuit_open"\)/,
    "public circuit banners must derive from scan result errors");
});

describe("useScanOrchestrator planning", () => {
  test("filters chains by wallet VM and batches compatible chains", () => {
    const jobs = buildScanOrchestratorJobs({
      enabledAddresses: [EVM],
      chains: ["BASE", "SOLANA", "ETHEREUM", "COSMOS_HUB"],
      chainMetaMap: {
        BASE: { vm: "EVM" },
        SOLANA: { vm: "SVM" },
        ETHEREUM: { vm: "EVM" },
        COSMOS_HUB: { vm: "COSMOS" },
      },
      batchSize: 5,
    });

    assert.deepEqual(jobs.map((job) => ({ vm: job.vm, chains: job.chains })), [
      { vm: "EVM", chains: ["BASE", "ETHEREUM"] },
    ]);
    assert.deepEqual(jobs[0]?.tasks.map((task) => task.addr.toLowerCase()), [EVM]);
  });

  test("keeps disabled chains out of scan jobs", () => {
    const jobs = buildScanOrchestratorJobs({
      enabledAddresses: [EVM],
      chains: ["BASE", "KATANA"],
      chainMetaMap: {
        BASE: { vm: "EVM", disabled: true },
        KATANA: { vm: "EVM" },
      },
      batchSize: 5,
    });

    assert.deepEqual(jobs.map((job) => job.chains), [["KATANA"]]);
  });

  test("excludes invalid local addresses without contaminating a valid batch", () => {
    const jobs = buildScanOrchestratorJobs({
      enabledAddresses: [EVM, "not-a-wallet"],
      chains: ["BASE"],
      chainMetaMap: { BASE: { vm: "EVM" } },
      batchSize: 5,
    });

    assert.deepEqual(jobs[0]?.tasks.map(task => task.addr), [EVM]);
  });

  test("preserves prior chain assets and totals when a refresh fails empty", () => {
    const previous: ChainScan = {
      chainKey: "BASE",
      chainName: "Base",
      vm: "EVM",
      native: null,
      tokens: [{ contract: "0x1", symbol: "USDC", name: "USD Coin", decimals: 6, balance: 25, priceEur: 1, priceSource: "test", valueEur: 25, flags: [] }],
      totals: { valueEur: 25, tokenCount: 1, pricedCount: 1 },
      errors: [],
      degraded: false,
      fxRate: 0.92,
      scanMs: 10,
      cachedAt: "2026-08-07T00:00:00.000Z",
      scriptVersion: "test",
    };

    const failedRefresh: ChainScan = {
      ...previous,
      native: null,
      tokens: [],
      totals: { valueEur: 0, tokenCount: 0, pricedCount: 0 },
      errors: [{ stage: "scan", message: "chain_timeout" }],
      degraded: true,
    };
    const merged = mergeChainRefreshResult([previous], "BASE", "EVM", failedRefresh);

    assert.equal(merged.totalEur, 25);
    assert.equal(merged.chains[0]?.tokens[0]?.symbol, "USDC");
    assert.equal(merged.chains[0]?.degraded, true);
    assert.match(merged.chains[0]?.errors.at(-1)?.message ?? "", /stale_refresh_failed: chain_timeout/);
  });
});
