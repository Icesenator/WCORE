// Run: node --import tsx --test packages/shared/src/scam-detector.test.ts
import { test } from "vitest";
import { detectScam, SCAM_RULES_VERSION } from "./scam-detector.js";
import { expect } from "vitest";

test("SCAM_RULES_VERSION bumped for the phantom-value rule", () => {
  expect(SCAM_RULES_VERSION >= 19).toBe(true);
});

test("blocks the World Chain Coffee2Coin phantom-price scam", () => {
  const result = detectScam("Coffee2", "Coffee2Coin", 10, 1.74, "0x51c707920d1ee9b308b5754675a0bf856cd25eea");
  expect(result.level).toBe("scam");
});

test("blocks the known zkanalyst ZK impersonator contract", () => {
  const result = detectScam("ZK", "zkanalyst", 1, 0.006870557357, "0x2937489455711b275e854fb8e2238d0b7cc5fa7b");
  expect(result.isSuspicious).toBe(true);
  expect(result.level).toBe("scam");
  expect(result.reasons.some((r: string) => r.toLowerCase().includes("blocked"))).toBe(true);
});

test("flags a ZK-ticker impersonator with an unrelated name via the heuristic", () => {
  const result = detectScam("ZK", "Analyst Token", 1, 0.0068, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  expect(result.isSuspicious).toBe(true);
  expect(result.score >= 2).toBe(true);
  expect(result.reasons.some((r: string) => r.includes("ZK"))).toBe(true);
});

test("does not flag the real ZK token (name contains the ticker)", () => {
  const result = detectScam("ZK", "ZKsync", 100, 0.0068, "0x5A7d6b2F92C77FAD6CCaBd7EE9d4c5a17c9fD9b2");
  expect(result.isSuspicious).toBe(false);
});

test("does not flag WIF meme token whose name matches the ticker", () => {
  const result = detectScam("WIF", "dogwifhat", 5000, 2.4, "0x9sadasdasd");
  expect(result.isSuspicious).toBe(false);
});

test("does not flag stETH whose name mentions the ticker", () => {
  const result = detectScam("STETH", "Lido Staked Ether", 1.5, 3000, "0xae7ab96520de3a18e5e111b5eaab095312d7fe84");
  expect(result.isSuspicious).toBe(false);
});

test("does not flag ARB with a name matching Arbitrum", () => {
  const result = detectScam("ARB", "Arbitrum", 10, 0.9, "0x912ce59144191c1204e64559fe8253a0e49e6548");
  expect(result.isSuspicious).toBe(false);
});

test("flags OP ticker with an unrelated financial name", () => {
  const result = detectScam("OP", "OperaFinance", 1, 0.005, "0x1111111111111111111111111111111111111111");
  expect(result.isSuspicious).toBe(true);
});

test("blocks the World Chain AnimeCoin phantom-price scam", () => {
  const result = detectScam("Anime", "AnimeCoin", 20, 19.05, "0xffb41fbf0935e16e1cbf25a4c8e05e437c1c6f95");
  expect(result.level).toBe("scam");
  expect(result.reasons.some((r: string) => r.toLowerCase().includes("blocked"))).toBe(true);
});

test("blocks the World Chain RamenCoin phantom-price scam", () => {
  const result = detectScam("Ramen", "RamenCoin", 10, 13.04, "0xc6f44893a558d9ae0576a2bb6bfa9c1c3f313815");
  expect(result.level).toBe("scam");
});

test("blocks the World Chain CoffeeCoin phantom-price scam", () => {
  const result = detectScam("Coffee", "CoffeeCoin", 10, 11.33, "0x5ef30ba3a27b92399a46ee86d2b810ee7e9d8abc");
  expect(result.level).toBe("scam");
});

test("flags generic <Noun>Coin with phantom high value via heuristic", () => {
  const result = detectScam("Foo", "FooCoin", 50, 15, "0xbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  expect(result.isSuspicious).toBe(true);
  expect(result.score >= 4).toBe(true);
});

test("does not flag real tokens with generic names and genuine value", () => {
  const real: Array<[string, string, number, number, string]> = [
    ["BONK", "Bonk", 100_000_000, 0.00000005, "0x1151cb3d861920e07a38e03eead12d6657e9f9e1"], // real BONK (Bonk on Solana) - low value per token
    ["LINK", "ChainLink Token", 5, 18, "0x514910771af9ca656af840dff83e8264ecf986ca"], // real LINK
    ["UNI", "Uniswap", 2, 9, "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"], // real UNI
    ["AAVE", "Aave", 1, 90, "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9"], // real AAVE
  ];
  for (const entry of real) {
    const [symbol, name, balance, price, contract] = entry;
    const result = detectScam(symbol, name, balance, price, contract);
    expect(result.isSuspicious).toBe(false);
  }
});

test("does not flag genuine project tokens with noun+Token names", () => {
  const real: Array<[string, string, number, number, string]> = [
    ["COMP", "Compound", 3, 45, "0xc00e94cb662c3520282e6f5717214004a7f26888"],
    ["MKR", "Maker", 0.5, 1200, "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2"],
    ["CRV", "Curve DAO Token", 100, 0.35, "0xd533a949740bb3306d119cc777fa900ba034cd52"],
    ["PEPE", "Pepe", 1_000_000, 0.000001, "0x6982508145454ce325ddbe47a25d4ec3d2311933"],
  ];
  for (const entry of real) {
    const [symbol, name, balance, price, contract] = entry;
    const result = detectScam(symbol, name, balance, price, contract);
    expect(result.isSuspicious).toBe(false);
  }
});

test("does not flag WLD/Worldcoin (real World Chain token)", () => {
  const result = detectScam("WLD", "Worldcoin", 10, 2, "0x1237");
  expect(result.isSuspicious).toBe(false);
  expect(result.level).toBe("clean");
});
