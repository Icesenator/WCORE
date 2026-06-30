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

// v0.3.x: Compound V3 cToken discovery — each collateral has its own cToken
// contract (no Comet proxy suffix needed). The cToken address is the unique
// key in Portefeuille Crypto Details SUMPRODUCT lookup.
test("positionToTokenLike preserves cToken contract for lending_collateral (Compound V3 cToken)", () => {
  const CTOKEN_WRSETH = "0x1111111111111111111111111111111111111111";
  const token = positionToTokenLike({
    id: "optimism:compound-v3:wrseth-collateral",
    chain: "OPTIMISM",
    protocol: "compound-v3",
    type: "lending_collateral",
    label: "Comp wrsETH",
    name: "Compound V3 cWETHv3 Collateral",
    contract: CTOKEN_WRSETH,
    balance: 0.5,
    decimals: 18,
    priceEur: 1500,
    valueEur: 750,
    liquidityStatus: "flex",
    source: "discovery",
    confidence: "high",
  });

  assert.equal(token.contract, CTOKEN_WRSETH, "cToken contract preserved as-is");
});

test("positionToTokenLike preserves cToken contract for lending_debt (Compound V3 Comet proxy)", () => {
  const COMET = "0xe36a30d249f7761327fd973001a32010b521b6fd";
  const token = positionToTokenLike({
    id: "optimism:compound-v3:weth-borrow",
    chain: "OPTIMISM",
    protocol: "compound-v3",
    type: "lending_debt",
    label: "Comp WETH Borrow",
    name: "Compound V3 cWETHv3 Borrowed",
    contract: COMET,
    balance: -0.006,
    decimals: 18,
    priceEur: 1400,
    valueEur: -8.4,
    liquidityStatus: "flex",
    source: "discovery",
    confidence: "high",
  });

  assert.equal(token.contract, COMET, "Comet contract preserved as-is for borrow (1 borrow per market)");
});

test("positionToTokenLike preserves contract for wallet_token (no transformation)", () => {
  const token = positionToTokenLike({
    id: "ethereum:wallet:usdc",
    chain: "ETHEREUM",
    type: "wallet_token",
    label: "USDC",
    name: "USD Coin",
    contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    balance: 100,
    decimals: 6,
    priceEur: 0.92,
    valueEur: 92,
    source: "registry",
    confidence: "high",
  });

  assert.equal(token.contract, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
});

test("positionToTokenLike preserves contract for staking_locked (WCT-style, distinct contract)", () => {
  const token = positionToTokenLike({
    id: "optimism:walletconnect-staking:wct-stake",
    chain: "OPTIMISM",
    protocol: "walletconnect-staking",
    type: "staking_locked",
    label: "WCT Stake",
    name: "WCT Stake",
    contract: "0x521b4c065bbdbe3e20b3727340730936912dfa46",
    balance: 1000,
    decimals: 18,
    priceEur: 0.5,
    valueEur: 500,
    liquidityStatus: "lock",
    source: "registry+rpc",
    confidence: "high",
  });

  assert.equal(token.contract, "0x521b4c065bbdbe3e20b3727340730936912dfa46");
});

test("registry identifies WCT stake and claimable liquidity", () => {
  const stake = getDeFiPositionMetadata("OPTIMISM", "0x521b4c065bbdbe3e20b3727340730936912dfa46", "WCT Stake");
  const claimable = getDeFiPositionMetadata("OPTIMISM", "0xf368f535e329c6d08dff0d4b2da961c4e7f3fcaf", "WCT Claimable");

  assert.equal(stake?.type, "staking_locked");
  assert.equal(stake?.liquidityStatus, "lock");
  assert.equal(claimable?.type, "claimable");
  assert.equal(claimable?.liquidityStatus, "flex");
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
