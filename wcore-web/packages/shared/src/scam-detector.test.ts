// Run: pnpm --filter @wcore/shared test
import { test } from "vitest";
import assert from "node:assert/strict";
import { detectScam, SCAM_RULES_VERSION } from "./scam-detector.js";

test("SCAM_RULES_VERSION includes confirmed honeypot blocking", () => {
  assert.ok(SCAM_RULES_VERSION >= 30, "rules version must be bumped to 30");
});

test("blocks the World Chain Coffee2Coin phantom-price scam", () => {
  const result = detectScam("Coffee2", "Coffee2Coin", 10, 1.74, "0x51c707920d1ee9b308b5754675a0bf856cd25eea");
  assert.equal(result.level, "scam", "Coffee2Coin must be hard-blocked");
});

test("blocks the Ethos - Base SKYAI honeypot dusting contract", () => {
  const result = detectScam("SKYAI", "SKYAI", 82331103, 0, "0xce014b9c1ac69e01792e9db7393075146a1d4055");
  assert.equal(result.isSuspicious, true, "SKYAI must be flagged");
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.some((r) => r.toLowerCase().includes("blocked")), "blocked contract reason expected");
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

test("blocks the World Chain AnimeCoin phantom-price scam", () => {
  const result = detectScam("Anime", "AnimeCoin", 20, 19.05, "0xffb41fbf0935e16e1cbf25a4c8e05e437c1c6f95");
  assert.equal(result.level, "scam", "AnimeCoin must be hard-blocked");
  assert.ok(result.reasons.some((r) => r.toLowerCase().includes("blocked")));
});

test("blocks the World Chain RamenCoin phantom-price scam", () => {
  const result = detectScam("Ramen", "RamenCoin", 10, 13.04, "0xc6f44893a558d9ae0576a2bb6bfa9c1c3f313815");
  assert.equal(result.level, "scam", "RamenCoin must be hard-blocked");
});

test("blocks the World Chain CoffeeCoin phantom-price scam", () => {
  const result = detectScam("Coffee", "CoffeeCoin", 10, 11.33, "0x5ef30ba3a27b92399a46ee86d2b810ee7e9d8abc");
  assert.equal(result.level, "scam", "CoffeeCoin must be hard-blocked");
});

test("flags generic <Noun>Coin with phantom high value via heuristic", () => {
  const result = detectScam("Foo", "FooCoin", 50, 15, "0xbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(result.isSuspicious, true, "generic noun+Coin with high phantom value must be suspicious");
  assert.ok(result.score >= 4, `score should be scam-level, got ${result.score}`);
});

test("does not flag real tokens with generic names and genuine value", () => {
  const real = [
    ["BONK", "Bonk", 100_000_000, 0.00000005, "0x1151cb3d861920e07a38e03eead12d6657e9f9e1"], // real BONK (Bonk on Solana) - low value per token
    ["LINK", "ChainLink Token", 5, 18, "0x514910771af9ca656af840dff83e8264ecf986ca"], // real LINK
    ["UNI", "Uniswap", 2, 9, "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"], // real UNI
    ["AAVE", "Aave", 1, 90, "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9"], // real AAVE
  ];
  for (const entry of real as Array<[string, string, number, number, string]>) {
    const [symbol, name, balance, price, contract] = entry;
    const result = detectScam(symbol, name, balance, price, contract);
    assert.equal(result.isSuspicious, false, `${symbol} (${name}) must not be flagged`);
  }
});

test("does not flag genuine project tokens with noun+Token names", () => {
  const real = [
    ["COMP", "Compound", 3, 45, "0xc00e94cb662c3520282e6f5717214004a7f26888"],
    ["MKR", "Maker", 0.5, 1200, "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2"],
    ["CRV", "Curve DAO Token", 100, 0.35, "0xd533a949740bb3306d119cc777fa900ba034cd52"],
    ["PEPE", "Pepe", 1_000_000, 0.000001, "0x6982508145454ce325ddbe47a25d4ec3d2311933"],
  ];
  for (const entry of real as Array<[string, string, number, number, string]>) {
    const [symbol, name, balance, price, contract] = entry;
    const result = detectScam(symbol, name, balance, price, contract);
    assert.equal(result.isSuspicious, false, `${symbol} (${name}) must not be flagged`);
  }
});

test("does not flag WLD/Worldcoin (real World Chain token)", () => {
  const result = detectScam("WLD", "Worldcoin", 10, 2, "0x1237");
  assert.equal(result.isSuspicious, false, "Worldcoin is legitimate");
  assert.equal(result.level, "clean");
});

test("blocks a GoPlus-confirmed honeypot without relying on a manual blocklist", () => {
  const result = detectScam(
    "Moon",
    "MoonCoin",
    70,
    0.01,
    "0xd418f9fe0052856558b88f3f530130e0dd306a82",
    {
      goPlus: {
        available: true,
        isHoneypot: true,
        isBlacklisted: true,
        canTakeBackOwnership: false,
      },
    },
  );
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.includes("goplus: honeypot"));
});

test("flags a phantom-price dust token via dead screen pool enrichment (SKYAI pattern)", () => {
  const result = detectScam(
    "SKYAI",
    "SKYAI",
    82.33,
    0.0000005,
    "0x00000000000000000000000000000000000d4055",
    { dexLiquidityUsd: 0.05, dexVolume24h: 0, dexBuys24h: 0 },
  );
  assert.equal(result.level, "scam", "dead screen pool must be scam regardless of unit price");
  assert.ok(result.reasons.some((r) => r.includes("dead screen pool")), `reason expected: ${result.reasons.join("; ")}`);
});

test("flags xBTC-style token via GT score + holder concentration despite clean GoPlus", () => {
  const result = detectScam(
    "xBTC", "xBTC", 808680065542, 0.00000001148,
    "0xc99fc7cfa3faf9de133e25bdf5164bc16bee5377",
    {
      goPlus: { available: true, isHoneypot: false, isBlacklisted: false },
      gt: {
        available: true,
        gtScore: 38.8,
        holderCount: 382237,
        holderDistribution: { top_10: 88.7, "11_30": 4.5, "31_50": 4.2, rest: 2.6 },
      },
    },
  );
  assert.equal(result.level, "scam", `GT score+concentration must detect scam: ${result.reasons.join("; ")}`);
  assert.ok(result.reasons.some((r) => r.includes("gt score") || r.includes("top 10 holders")));
});

test("does not flag XCLAW-style legit token via GT score alone (score 53, high top10 = burn)", () => {
  const result = detectScam(
    "XCLAW", "XClaw", 91866741, 0.001621,
    "0xd8b3bf4b2ec7be2bb2d590c378400990abb2bfce",
    {
      goPlus: { available: true, isHoneypot: false },
      gt: {
        available: true,
        gtScore: 53.1,
        holderCount: 11348,
        holderDistribution: { top_10: 99.4, "11_30": 0.07, "31_50": 0.04, rest: 0.5 },
      },
    },
  );
  assert.equal(result.level, "clean", `XCLAW pattern must stay clean: ${result.reasons.join("; ")}`);
});

test("flags vBTC via GT score 38.8 plus 100% top-10 concentration", () => {
  const result = detectScam(
    "vBTC", "vBTC", 3226, 0.000004822,
    "0x992d55321d3e8f5778b11a3789467c4711fe580c",
    {
      goPlus: { available: true, isHoneypot: false, isBlacklisted: false },
      gt: {
        available: true,
        gtScore: 38.80597014925373,
        holderCount: 296160,
        holderDistribution: { top_10: 100, "11_30": 0, "31_50": 0, rest: 0 },
      },
    },
  );
  assert.equal(result.level, "scam", `GT score+100% concentration must detect scam: ${result.reasons.join("; ")}`);
  assert.ok(result.reasons.some((r) => r.includes("top 10 holders")));
});

test("GT score 0 means unrated — never scam on the score alone (World Chain OnePiece: GT honeypot flag still catches it)", () => {
  // OnePiece: GT score 0, honeypot true, no holder distribution.
  const result = detectScam(
    "OnePiece", "OnePieceCoin", 1, null,
    "0x75c2385621efabcafbe3eb18ddd9fae0cc67a426",
    { gt: { available: true, gtScore: 0, isHoneypot: true, holderCount: 0 } },
  );
  assert.equal(result.level, "scam", `GT honeypot flag must catch OnePiece: ${result.reasons.join("; ")}`);
  assert.ok(result.reasons.some((r) => r.includes("gt: flagged as honeypot")));
});

test("GT score 0 with honeypot false is unrated — no score-based scam signal", () => {
  const result = detectScam(
    "NewToken", "NewToken", 1, 0.5,
    "0x00000000000000000000000000000000000abcde",
    { gt: { available: true, gtScore: 0, isHoneypot: false, holderCount: 42 } },
  );
  assert.notEqual(result.level, "scam", `unrated GT must not be scam: ${result.reasons.join("; ")}`);
  assert.ok(!result.reasons.some((r) => r.includes("gt score")), `no gt score reason expected: ${result.reasons.join("; ")}`);
});

test("flags hard-scam GT score < 35 on its own", () => {
  const result = detectScam(
    "SKYAI", "SKYAI", 82331103, 0.0000005,
    "0x00000000000000000000000000000000000d4055",
    { gt: { available: true, gtScore: 31.0, holderCount: 230257, holderDistribution: { top_10: 0, rest: 100 } } },
  );
  assert.equal(result.level, "scam", `GT score 31 must be scam: ${result.reasons.join("; ")}`);
});

test("does not flag a legit low-price micro-cap with real liquidity and buys", () => {
  const result = detectScam(
    "MICRO",
    "Micro Cap Token",
    1000,
    0.02,
    "0x0000000000000000000000000000000000001234",
    { dexLiquidityUsd: 500, dexVolume24h: 120, dexBuys24h: 8 },
  );
  assert.notEqual(result.level, "scam", `legit micro-cap flagged: ${result.reasons.join("; ")}`);
});

test("flags a vanity factory address (0x…4444) with generic name and no price", () => {
  const result = detectScam(
    "AIX",
    "AIX",
    1,
    null,
    "0x5dc5b8cae2055195b9272be45ff136accdb04444",
  );
  assert.equal(result.level, "scam", `vanity factory must be scam: ${result.reasons.join("; ")}`);
  assert.ok(result.reasons.some((r) => r.toLowerCase().includes("vanity")), `vanity reason expected: ${result.reasons.join("; ")}`);
});

test("flags a vanity factory address (0x…3333) with non-latin name and no price", () => {
  const result = detectScam(
    "小狗币",
    "小狗币",
    1,
    null,
    "0xeb0c2729420696ad4e36b9ce56380e3cd3543333",
  );
  assert.equal(result.level, "scam", `vanity + non-latin must be scam: ${result.reasons.join("; ")}`);
});

test("does not flag a legit token that happens to have a vanity address", () => {
  const result = detectScam(
    "LEGIT",
    "Legitimate Project",
    100,
    1.5,
    "0x1234567890abcdef1234567890abcdef12344444",
    { dexLiquidityUsd: 500_000, dexVolume24h: 100_000, dexBuys24h: 200 },
  );
  assert.notEqual(result.level, "scam", `legit vanity flagged: ${result.reasons.join("; ")}`);
});
