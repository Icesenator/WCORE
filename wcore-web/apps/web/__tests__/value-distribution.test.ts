// Run: pnpm exec tsx --test apps/web/__tests__/value-distribution.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getDistributionVm } from "../lib/value-distribution";

test("getDistributionVm keeps CEX out of EVM totals", () => {
  assert.equal(getDistributionVm({ chainKey: "CEX_BYBIT", vm: "EVM" }), "CEX");
  assert.equal(getDistributionVm({ chainKey: "CEX_BINANCE", vm: "EVM" as const }), "CEX");
});

test("getDistributionVm keeps normal VM labels", () => {
  assert.equal(getDistributionVm({ chainKey: "ETHEREUM", vm: "EVM" }), "EVM");
  assert.equal(getDistributionVm({ chainKey: "SOLANA", vm: "SVM" }), "SVM");
  assert.equal(getDistributionVm({ chainKey: "TON", vm: "TON" }), "TON");
});
