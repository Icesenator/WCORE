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

// v0.3.x: Ethos - Base airdrop scam tokens (2026-06-29)
test("detectScam flags BASED 0xf34f... as scam (hardcoded blocked contract on Base)", () => {
  const result = detectScam("BASED", "Based", 1_000_000, 0.00001, "0xf34f722fc7617300ad37f499d7a36780d81daa29");
  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((r) => r.includes("blocked contract")));
});

test("detectScam flags IMOUT 0x208e... as scam (hardcoded blocked contract on Base)", () => {
  const result = detectScam("IMOUT", "I AM OUT", 1_000_000, 0.00001, "0x208e0664114880b76471fec59fdd1bead62620d3");
  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((r) => r.includes("blocked contract")));
});

test("detectScam flags SEC (Secury Wallet) 0x0d4d... as scam (typo-phishing impersonating 'Secure')", () => {
  const result = detectScam("SEC", "Secury Wallet", 1, 0.5, "0x0d4d191a72c1d8d6703d6d3ed1a532b67d5a5f14");
  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((r) => /blocked|typo|secury/i.test(r)));
});

test("detectScam flags SHIT (ShitToken) 0xf21d... as scam (hardcoded blocked contract on Base)", () => {
  const result = detectScam("SHIT", "ShitToken", 1_000_000, 0.00001, "0xf21dbea34ca178d424a6f2184b094f279de915ff");
  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((r) => r.includes("blocked contract")));
});

// v0.3.x: World Chain LuckyCoin airdrop scam (2026-06-29)
test("detectScam flags LUCKY (LuckyCoin) 0x3a27... as scam on World Chain", () => {
  const result = detectScam("LUCKY", "LuckyCoin", 1_000_000, 0.0001, "0x3a27edadf19d362a60b0b5a7bd3e8c48273c5e2e");
  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((r) => r.includes("blocked contract")));
});

// v0.3.x: World Chain XDogeCoin airdrop scam (2026-06-29)
test("detectScam flags XDoge (XDogeCoin) 0x37cf... as scam on World Chain", () => {
  const result = detectScam("XDoge", "XDogeCoin", 1_000_000, 0.0001, "0x37cff256e4aed256493060669a04b59d87d509d1");
  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((r) => r.includes("blocked contract")));
});

test("detectScam does not block BONSAI by contract when pricing is sane", () => {
  const result = detectScam("BONSAI", "Bonsai Token", 1491.775, 0.000073, "0x474f4cb764df9da079d94052fed39625c147c12c");
  assert.equal(result.isSuspicious, false);
});

// v0.3.x: Generic Base meme name pattern (catches other "BASED*" tokens)
test("detectScam flags ultra-generic 'Based' symbol/name as scam (Base chain impersonation)", () => {
  // No contract address (rules 1-3 + blocked won't trigger); relies on name pattern
  const result = detectScam("BASED", "Based", 1_000_000, 0.00001, "0x1111111111111111111111111111111111111abc");
  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((r) => /generic.*base|base.*generic|BASED/i.test(r)));
});

// v0.3.x: Typo-phishing pattern detection (catches other "Secury*" tokens without hardcoding)
test("detectScam flags typo-phishing names like 'Secury Wallet' as scam", () => {
  // Use a fresh contract (not in hardcoded blocklist) to exercise the heuristic
  const result = detectScam("SEC2", "Secury Vault", 100, 0.1, "0x9999999999999999999999999999999999999def");
  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((r) => /typo|secury|impersonat/i.test(r)));
});

// Negative test: legitimate "Secure" wallet token (no typo) stays clean
test("detectScam does NOT flag a real 'Secure Wallet' (no typo) as scam", () => {
  const result = detectScam("SEC3", "Secure Wallet", 100, 0.1, "0x8888888888888888888888888888888888888abc");
  assert.equal(result.isSuspicious, false);
  assert.equal(result.level, "clean");
});
