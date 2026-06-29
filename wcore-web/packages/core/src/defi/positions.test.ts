import { test } from "node:test";
import assert from "node:assert/strict";
import { liquiditySuffix, withLiquiditySuffix, positionToTokenLike } from "./positions.js";
import { getDeFiPositionMetadata } from "./registry.js";
import { TOKEN_REGISTRY } from "../tokens/registry.js";

test("liquiditySuffix maps internal status to visible Sheet suffix", () => {
  assert.equal(liquiditySuffix("flex"), "[Flex]");
  assert.equal(liquiditySuffix("lock"), "[Lock]");
  assert.equal(liquiditySuffix("unknown"), "[Unknown]");
  assert.equal(liquiditySuffix(undefined), "");
});

test("withLiquiditySuffix does not suffix normal wallet tokens", () => {
  assert.equal(withLiquiditySuffix("WalletConnect Token", { type: "wallet_token" }), "WalletConnect Token");
});

test("withLiquiditySuffix appends suffix for DeFi positions and avoids duplicates", () => {
  assert.equal(withLiquiditySuffix("WCT Stake Weight", { type: "staking_locked", liquidityStatus: "lock" }), "WCT Stake Weight [Lock]");
  assert.equal(withLiquiditySuffix("WCT Stake Weight [Lock]", { type: "staking_locked", liquidityStatus: "lock" }), "WCT Stake Weight [Lock]");
});

test("positionToTokenLike preserves negative debt values", () => {
  const token = positionToTokenLike({
    id: "optimism:compound-v3:weth-borrow",
    chain: "OPTIMISM",
    protocol: "compound-v3",
    type: "lending_debt",
    label: "Comp WETH Borrow",
    name: "Compound V3 cWETHv3 Borrowed",
    contract: "0xe36a30d249f7761327fd973001a32010b521b6fd",
    balance: -0.006,
    decimals: 18,
    priceEur: 1400,
    valueEur: -8.4,
    liquidityStatus: "flex",
    source: "registry+rpc",
    confidence: "high",
  });

  assert.equal(token.symbol, "Comp WETH Borrow");
  assert.equal(token.name, "Compound V3 cWETHv3 Borrowed [Flex]");
  assert.equal(token.balance, -0.006);
  assert.equal(token.valueEur, -8.4);
});

test("registry identifies WCT stake and claimable liquidity", () => {
  const stake = getDeFiPositionMetadata("OPTIMISM", "0x521b4c065bbdbe3e20b3727340730936912dfa46", "WCT Stake");
  const claimable = getDeFiPositionMetadata("OPTIMISM", "0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf", "WCT Claimable");

  assert.equal(stake?.type, "staking_locked");
  assert.equal(stake?.liquidityStatus, "lock");
  assert.equal(claimable?.type, "claimable");
  assert.equal(claimable?.liquidityStatus, "flex");
});

test("registry uses symbol-specific Compound collateral over Comet debt default", () => {
  const comet = "0xe36a30d249f7761327fd973001a32010b521b6fd";
  const debt = getDeFiPositionMetadata("OPTIMISM", comet, "Comp WETH Borrow");
  const collateral = getDeFiPositionMetadata("OPTIMISM", comet, "Comp wrsETH");

  assert.equal(debt?.type, "lending_debt");
  assert.equal(debt?.pricing?.sign, "debt");
  assert.equal(collateral?.type, "lending_collateral");
  assert.equal(collateral?.pricing?.sign, "asset");
});

test("registry returns undefined for normal tokens", () => {
  assert.equal(getDeFiPositionMetadata("OPTIMISM", "0xef4461891dfb3ac8572ccf7c794664a8dd927945", "WCT"), undefined);
});

test("existing token registry entries can carry DeFi metadata during migration", () => {
  const optimism = TOKEN_REGISTRY.OPTIMISM ?? [];
  const stake = optimism.find((token) => token.symbol === "WCT Stake");
  const borrow = optimism.find((token) => token.symbol === "Comp WETH Borrow");

  assert.equal(stake?.defi?.type, "staking_locked");
  assert.equal(stake?.defi?.liquidityStatus, "lock");
  assert.equal(borrow?.defi?.type, "lending_debt");
  assert.equal(borrow?.defi?.pricing?.sign, "debt");
});
