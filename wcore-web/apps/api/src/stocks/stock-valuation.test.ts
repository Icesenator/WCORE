import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import {
  computePremiumDiscountPct,
  deriveStockValuation,
} from "./stock-valuation.js";

// WC-10 — the reference/spot price of a tokenized stock must never be presented as its
// executable claim value, and missing executable data must stay UNKNOWN (never 0).

test("spot known + executable unknown → reference shown, executable UNKNOWN (no copy)", () => {
  const v = deriveStockValuation({ referencePriceEur: 100, referenceSource: "yahoo:relay" });
  assert.equal(v.reference.priceEur, 100);
  assert.equal(v.reference.status, "AVAILABLE");
  assert.equal(v.reference.source, "yahoo:relay");
  assert.equal(v.executable.priceEur, null);
  assert.equal(v.executable.status, "UNKNOWN");
  assert.notEqual(v.executable.priceEur, v.reference.priceEur);
});

test("spot + executable known → distinct values kept and premium/discount computed", () => {
  const v = deriveStockValuation({
    referencePriceEur: 100,
    referenceSource: "yahoo:relay",
    executable: { priceEur: 110, venue: "Xetra", source: "venue:xetra", stale: false },
  });
  assert.equal(v.reference.priceEur, 100);
  assert.equal(v.executable.priceEur, 110);
  assert.equal(v.executable.status, "AVAILABLE");
  assert.equal(v.executable.venue, "Xetra");
  assert.equal(v.premiumDiscount.status, "AVAILABLE");
  assert.equal(v.premiumDiscount.pct, 0.1); // +10% premium
  assert.equal(computePremiumDiscountPct(100, 90), -0.1); // -10% discount
});

test("stale executable → explicit STALE state", () => {
  const v = deriveStockValuation({
    referencePriceEur: 100,
    executable: { priceEur: 105, venue: "Xetra", stale: true },
  });
  assert.equal(v.executable.status, "STALE");
  assert.equal(v.executable.stale, true);
});

test("spot absent → reference UNKNOWN and no premium/discount", () => {
  const v = deriveStockValuation({ referencePriceEur: null });
  assert.equal(v.reference.priceEur, null);
  assert.equal(v.reference.status, "UNKNOWN");
  assert.equal(v.premiumDiscount.pct, null);
  assert.equal(v.premiumDiscount.status, "UNKNOWN");
});

test("executable absent → no fabricated premium/discount even with a valid spot", () => {
  const v = deriveStockValuation({ referencePriceEur: 100 });
  assert.equal(v.premiumDiscount.pct, null);
  assert.equal(v.premiumDiscount.status, "UNKNOWN");
});

test("liquidity absent → UNKNOWN, never 0", () => {
  const v = deriveStockValuation({ referencePriceEur: 100 });
  assert.equal(v.liquidity.notionalEur, null);
  assert.equal(v.liquidity.status, "UNKNOWN");
});

test("fees / redemption absent → UNKNOWN (no generic promise)", () => {
  const v = deriveStockValuation({ referencePriceEur: 100 });
  assert.equal(v.fees.costEur, null);
  assert.equal(v.fees.status, "UNKNOWN");
  assert.equal(v.redemption.status, "UNKNOWN");
});

test("provider error (no reference at all) → everything UNKNOWN, nothing fabricated", () => {
  const v = deriveStockValuation({ referencePriceEur: null, referenceSource: null, referenceStale: false });
  assert.deepEqual(
    [v.reference.status, v.executable.status, v.premiumDiscount.status, v.liquidity.status, v.fees.status, v.redemption.status],
    ["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
  );
  assert.equal(v.reference.source, null);
});

test("premium/discount is never computed from a non-positive reference", () => {
  assert.equal(computePremiumDiscountPct(0, 110), null);
  assert.equal(computePremiumDiscountPct(-5, 110), null);
  assert.equal(computePremiumDiscountPct(100, 0), null);
  assert.equal(computePremiumDiscountPct(100, null), null);
});

test("legacy priceEur stays the reference (compatibility, no mutation)", () => {
  const v = deriveStockValuation({ referencePriceEur: 42.5, referenceSource: "companiesmarketcap", referenceStale: true });
  assert.equal(v.reference.priceEur, 42.5);
  assert.equal(v.reference.status, "STALE");
  assert.equal(v.reference.source, "companiesmarketcap");
});

test("the valuation module triggers no transaction/signature/wallet behaviour", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, "stock-valuation.ts"), "utf8");
  assert.doesNotMatch(source, /sendTransaction|signTransaction|signMessage|signTypedData|eth_sendTransaction|writeContract|window\.ethereum|privateKey|walletClient/i);
});
