// Run: node --import tsx --test packages/shared/src/scam-detector.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectScam, SCAM_RULES_VERSION } from "./scam-detector.js";

test("SCAM_RULES_VERSION bumped for the ZK impersonation rule", () => {
  assert.ok(SCAM_RULES_VERSION >= 17, "rules version must be bumped to 17");
});

test("blocks the known zkanalyst ZK impersonator contract", () => {
  const result = detectScam("ZK", "zkanalyst", 1, 0.006870557357, "0x2937489455711b275e854fb8e2238d0b7cc5fa7b");
  assert.equal(result.isSuspicious, true, "zkanalyst must be flagged");
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((r) => r.toLowerCase().includes("blocked")), "blocked contract reason expected");
});

test("flags a ZK-ticker impersonator with an unrelated name via the heuristic", () => {
  const result = detectScam("ZK", "Analyst Token", 1, 0.0068, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(result.isSuspicious, true, "ZK + unrelated name must be suspicious");
  assert.ok(result.score >= 2, `score should reach suspicious, got ${result.score}`);
  assert.ok(result.reasons.some((r) => r.includes("ZK")), "reason should mention the impersonated ticker");
});

test("does not flag the real ZK token (name contains the ticker)", () => {
  const result = detectScam("ZK", "ZKsync", 100, 0.0068, "0x5A7d6b2F92C77FAD6CCaBd7EE9d4c5a17c9fD9b2");
  assert.equal(result.isSuspicious, false, "real ZKsync must stay clean");
});

test("does not flag WIF meme token whose name matches the ticker", () => {
  const result = detectScam("WIF", "dogwifhat", 5000, 2.4, "0x9sadasdasd");
  assert.equal(result.isSuspicious, false, "dogwifhat is the real WIF");
});

test("does not flag stETH whose name mentions the ticker", () => {
  const result = detectScam("STETH", "Lido Staked Ether", 1.5, 3000, "0xae7ab96520de3a18e5e111b5eaab095312d7fe84");
  assert.equal(result.isSuspicious, false, "Lido stETH is legitimate");
});

test("does not flag ARB with a name matching Arbitrum", () => {
  const result = detectScam("ARB", "Arbitrum", 10, 0.9, "0x912ce59144191c1204e64559fe8253a0e49e6548");
  assert.equal(result.isSuspicious, false, "Arbitrum ARB is legitimate");
});

test("flags OP ticker with an unrelated financial name", () => {
  const result = detectScam("OP", "OperaFinance", 1, 0.005, "0x1111111111111111111111111111111111111111");
  assert.equal(result.isSuspicious, true, "OP + unrelated name must be suspicious");
});
