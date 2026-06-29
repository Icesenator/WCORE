import assert from "node:assert/strict";
import { test } from "node:test";

import { detectScam } from "@wcore/shared";

test("blocks the known BASE scam contract 0x260b...", () => {
  const result = detectScam("BASE", "Base", 1, 1, "0x260b9ac75753fbd67f2ea6d10724dd89a52c1913");

  assert.equal(result.isSuspicious, true);
  assert.equal(result.level, "scam");
  assert.ok(result.reasons.includes("blocked contract"));
});

test("blocks known Ethereum DOGE/SHIB impersonator contracts", () => {
  const cases = [
    ["DOGE", "Trump Doge", "0x290b3b9f7661a6834135be44c3475aef987fa3b2"],
    ["DOGE", "Royal Doge", "0x05cd8430676f04b63b33c1ece124818858edfc4f"],
    ["SHIB", "Trump Shib", "0x5497b1ab5bb59b194e25764ea0b61871b122a43f"],
  ] as const;

  for (const [symbol, name, contract] of cases) {
    const result = detectScam(symbol, name, 1, 0.001, contract);

    assert.equal(result.isSuspicious, true, `${symbol} ${contract} should be blocked`);
    assert.equal(result.level, "scam");
    assert.ok(result.reasons.includes("blocked contract"));
  }
});

test("does not block known escrow tokens only because the name is generic and unpriced", () => {
  const result = detectScam("xGRAIL", "Camelot escrowed token", 0.00000058, null, "0x3caae25ee616f2c8e13c74da0813402eae3f496b");

  assert.equal(result.isSuspicious, false);
  assert.equal(result.level, "clean");
  assert.equal(result.score, 0);
});

test("does not block known wrapped stablecoins with tiny balances", () => {
  const result = detectScam("aRUSDC", "Ample Arbitrum USDC", 0.009971, 0.87809575, "0xd1be1f98991cf69355e468ad15b6d0b6429bcfcb");

  assert.equal(result.isSuspicious, false);
  assert.equal(result.level, "clean");
  assert.equal(result.score, 0);
});

test("does not block known STONE liquid-staking wrappers with sub-cent value", () => {
  const rSTONE = detectScam("rSTONE", "StakeStone Ether", 0.00000001923341776, 1473.87, "0xad3d07d431b85b525d81372802504fa18dbd554c");
  const lSTONE = detectScam("lSTONE", "LayerBank STONE", 0.000064365024883053, 1473.87, "0xe5c40a3331d4fb9a26f5e48b494813d977ec0a8e");

  assert.equal(rSTONE.isSuspicious, false);
  assert.equal(rSTONE.level, "clean");
  assert.equal(rSTONE.score, 0);
  assert.equal(lSTONE.isSuspicious, false);
  assert.equal(lSTONE.level, "clean");
  assert.equal(lSTONE.score, 0);
});

test("does not block known Re7USDC with generic name when priced as yield-bearing USDC", () => {
  const result = detectScam("Re7USDC", "Re7 USDC", 100, 0.91, "0xb1e80387ebe53ff75a89736097d34dc8d9e9045b");

  assert.equal(result.isSuspicious, false);
  assert.equal(result.level, "clean");
  assert.equal(result.score, 0);
});
