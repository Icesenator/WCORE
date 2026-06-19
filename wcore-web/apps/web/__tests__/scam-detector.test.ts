import { test } from "node:test";
import assert from "node:assert/strict";
import { detectScam } from "../components/scam-detector.js";
import { addAdminBlocked } from "@wcore/shared";

test("detectScam flags inflated unknown game tokens with fake high value", () => {
  const result = detectScam(
    "ETHG",
    "Ethereum Games",
    2_000_000,
    0.247867085,
    "0x3fc29836e84e471a053d2d9e80494a867d670ead",
  );

  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((reason) => reason.includes("inflated unknown game token")));
});

test("detectScam treats admin-blocked contracts as scam", () => {
  const contract = "0x1111111111111111111111111111111111111111";
  addAdminBlocked("USDC", contract);

  const result = detectScam("USDC", "USD Coin", 1, 0.92, contract);

  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
});

test("detectScam treats RealToken property tokens as clean even with long symbol and no price", () => {
  const result = detectScam(
    "REALTOKEN-S-13895-SARATOGA-ST-DETROIT-MI",
    "RealToken 13895 Saratoga St Detroit MI",
    50,
    null,
    "0x7af2c0df2789c2620794aeb24b3019fc350c369d",
  );

  assert.equal(result.isSuspicious, false);
  assert.equal(result.level, "clean");
  assert.equal(result.score, 0);
});
