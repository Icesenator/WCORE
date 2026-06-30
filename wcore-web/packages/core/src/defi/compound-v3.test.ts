import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverCompoundV3CTokens, getCompoundV3Tokens } from "./compound-v3.js";
import type { EvmRpc } from "../rpc/index.js";

// Mock EvmRpc — only ethCall is needed for the discoverer
function mockRpc(responses: Map<string, string>): EvmRpc {
  return {
    ethCall: async (_endpoint: string, to: string, data: string) => {
      const v = responses.get(`${to.toLowerCase()}::${data.toLowerCase()}`);
      if (v === undefined) throw new Error(`unexpected call to=${to} data=${data}`);
      return v;
    },
  } as unknown as EvmRpc;
}

const COMET_OPTIMISM_WETH = "0xe36a30d249f7761327fd973001a32010b521b6fd";
const CTOKEN_WRSETH = "0x1111111111111111111111111111111111111111";
const CTOKEN_WSTETH = "0x2222222222222222222222222222222222222222";
const CTOKEN_WRSETH_WORD = "0x0000000000000000000000001111111111111111111111111111111111111111";
const CTOKEN_WSTETH_WORD = "0x0000000000000000000000002222222222222222222222222222222222222222";

// numAssets() selector: 0xa46fe83b
// getAssetInfo(uint8) selector: 0xc8c7fe6b
const NUM_ASSETS_SEL = "0xa46fe83b";
const GET_ASSET_INFO_SEL = "0xc8c7fe6b";
const SYMBOL_SEL = "0x95d89b41";
const BORROW_BALANCE_OF_SEL = "0x374c49b4";
const COLLATERAL_BALANCE_OF_SEL = "0x5c2549ee";

// Build a 256-byte (8-word) AssetInfo hex for a given cToken address
function assetInfoHex(cTokenAddress: string): string {
  const addr = cTokenAddress.toLowerCase().replace(/^0x/, "");
  const fields = [
    "0".repeat(64),
    "0".repeat(24) + addr,
    "0".repeat(24) + "feed".repeat(10),
    (1_000_000_000n).toString(16).padStart(64, "0"),
    "0".repeat(64),
    "0".repeat(64),
    "0".repeat(64),
    "0".repeat(64),
  ];
  return "0x" + fields.join("");
}

// ABI-encoded string for symbol() (e.g., "wrsETH")
// Layout: 32-byte offset word (0x20 = 32) + 32-byte length word + data padded to 32 bytes
function symbolHex(sym: string): string {
  const hex = Buffer.from(sym, "utf8").toString("hex");
  const lengthHex = (sym.length).toString(16).padStart(64, "0");
  // offset is 32 (bytes) = 0x20 in hex; pad with leading zeros to 64 hex chars
  const offsetHex = (0x20).toString(16).padStart(64, "0");
  return "0x" + offsetHex + lengthHex + hex.padEnd(Math.ceil(hex.length / 64) * 64, "0");
}

test("discoverCompoundV3CTokens reads numAssets + getAssetInfo via RPC", async () => {
  const responses = new Map<string, string>();
  const cometKey = (d: string) => `${COMET_OPTIMISM_WETH}::${d.toLowerCase()}`;
  responses.set(cometKey(NUM_ASSETS_SEL), "0x" + (2).toString(16).padStart(64, "0"));
  responses.set(cometKey(GET_ASSET_INFO_SEL + "0".padStart(64, "0")), assetInfoHex(CTOKEN_WRSETH));
  responses.set(cometKey(GET_ASSET_INFO_SEL + "1".padStart(64, "0")), assetInfoHex(CTOKEN_WSTETH));

  const rpc = mockRpc(responses);
  const result = await discoverCompoundV3CTokens(rpc, "https://any-rpc", COMET_OPTIMISM_WETH);

  assert.equal(result.cTokenAddresses.length, 2);
  assert.equal(result.cTokenAddresses[0], CTOKEN_WRSETH);
  assert.equal(result.cTokenAddresses[1], CTOKEN_WSTETH);
});

test("getCompoundV3Tokens returns DiscoveredToken[] with cToken contracts + selectors", async () => {
  const responses = new Map<string, string>();
  const cometKey = (d: string) => `${COMET_OPTIMISM_WETH}::${d.toLowerCase()}`;
  const wrsethKey = (d: string) => `${CTOKEN_WRSETH}::${d.toLowerCase()}`;
  const wstethKey = (d: string) => `${CTOKEN_WSTETH}::${d.toLowerCase()}`;
  // Comet calls
  responses.set(cometKey(NUM_ASSETS_SEL), "0x" + (2).toString(16).padStart(64, "0"));
  responses.set(cometKey(GET_ASSET_INFO_SEL + "0".padStart(64, "0")), assetInfoHex(CTOKEN_WRSETH));
  responses.set(cometKey(GET_ASSET_INFO_SEL + "1".padStart(64, "0")), assetInfoHex(CTOKEN_WSTETH));
  // cToken symbol() calls
  responses.set(wrsethKey(SYMBOL_SEL), symbolHex("wrsETH"));
  responses.set(wstethKey(SYMBOL_SEL), symbolHex("wstETH"));

  const rpc = mockRpc(responses);
  const result = await getCompoundV3Tokens("OPTIMISM", "0xuser", rpc, "https://any-rpc", {
    marketAddresses: [COMET_OPTIMISM_WETH],
  });

  // 2 collateral tokens + 1 borrow = 3 tokens total
  assert.equal(result.tokens.length, 3, "2 collaterals + 1 borrow");

  const wrseth = result.tokens.find((t) => t.symbol === "Comp wrsETH")!;
  assert.ok(wrseth, "wrsETH collateral token present");
  assert.equal(wrseth.contract, CTOKEN_WRSETH, "cToken as contract (unique per collateral)");
  assert.equal(wrseth.balanceSelector, COLLATERAL_BALANCE_OF_SEL, "collateralBalanceOf selector");
  assert.deepEqual(wrseth.balanceSelectorExtraArgs, [CTOKEN_WRSETH_WORD], "ABI word cToken as extra arg");
  assert.equal(wrseth.decimals, 18);

  const wsteth = result.tokens.find((t) => t.symbol === "Comp wstETH")!;
  assert.ok(wsteth);
  assert.equal(wsteth.contract, CTOKEN_WSTETH, "different cToken per collateral type");
  assert.equal(wsteth.balanceSelector, COLLATERAL_BALANCE_OF_SEL);
  assert.deepEqual(wsteth.balanceSelectorExtraArgs, [CTOKEN_WSTETH_WORD]);

  const borrow = result.tokens.find((t) => t.balanceSelector === BORROW_BALANCE_OF_SEL)!;
  assert.ok(borrow, "borrow position present");
  assert.equal(borrow.contract, COMET_OPTIMISM_WETH, "borrow uses Comet proxy (1 per market)");
  assert.equal(borrow.balanceSelectorExtraArgs, undefined, "no extra args for borrow");

  // Critical: cToken contracts are unique per collateral type — no collision in Portefeuille Crypto Details
  const contracts = result.tokens.map((t) => t.contract);
  assert.equal(new Set(contracts).size, contracts.length, "all contracts are unique");
});

test("getCompoundV3Tokens with no markets returns empty tokens", async () => {
  const rpc = mockRpc(new Map());
  const result = await getCompoundV3Tokens("ETHEREUM", "0xuser", rpc, "https://any-rpc");
  assert.equal(result.tokens.length, 0);
});

test("getCompoundV3Tokens uses cache when available, no on-chain calls", async () => {
  // Mock cache that returns pre-populated cToken list for the market
  const cachedTokens = [
    { cToken: "0x1111111111111111111111111111111111111111", symbol: "wrsETH" },
    { cToken: "0x2222222222222222222222222222222222222222", symbol: "wstETH" },
  ];
  const cacheStore = {
    async get<T>(key: string): Promise<T | undefined> {
      // Cache key format: "compoundV3:{CHAIN_UPPERCASE}:{market_lowercase}"
      if (key.includes("OPTIMISM") && key.includes(COMET_OPTIMISM_WETH.toLowerCase())) {
        return cachedTokens as unknown as T;
      }
      return undefined;
    },
    async set(): Promise<void> {},
    async delete(): Promise<void> {},
    async clear(): Promise<void> {},
    async mget<T>(): Promise<(T | undefined)[]> { return []; },
    async add(): Promise<boolean> { return true; },
  };
  let ethCallCount = 0;
  const rpc = {
    async ethCall() { ethCallCount++; return "0x"; },
  } as unknown as EvmRpc;

  const result = await getCompoundV3Tokens("OPTIMISM", "0xuser", rpc, "https://any-rpc", {
    marketAddresses: [COMET_OPTIMISM_WETH],
    cache: cacheStore as never,
  });

  assert.equal(ethCallCount, 0, "no on-chain calls when cache is populated");
  assert.equal(result.tokens.length, 3, "2 cached collaterals + 1 borrow");
  const wrseth = result.tokens.find((t) => t.symbol === "Comp wrsETH");
  assert.ok(wrseth);
  assert.equal(wrseth.contract, "0x1111111111111111111111111111111111111111");
});

test("getCompoundV3Tokens drops malformed cached cTokens before building extra args", async () => {
  const cachedTokens = [
    { cToken: "0x1111111111111111111111111111111111111111", symbol: "wrsETH" },
    { cToken: "0xnot-a-token", symbol: "broken" },
  ];
  const cacheStore = {
    async get<T>(key: string): Promise<T | undefined> {
      if (key.includes("OPTIMISM") && key.includes(COMET_OPTIMISM_WETH.toLowerCase())) {
        return cachedTokens as unknown as T;
      }
      return undefined;
    },
    async set(): Promise<void> {},
    async delete(): Promise<void> {},
    async clear(): Promise<void> {},
    async mget<T>(): Promise<(T | undefined)[]> { return []; },
    async add(): Promise<boolean> { return true; },
  };
  const rpc = {
    async ethCall() { throw new Error("cache should avoid on-chain discovery"); },
  } as unknown as EvmRpc;

  const result = await getCompoundV3Tokens("OPTIMISM", "0xuser", rpc, "https://any-rpc", {
    marketAddresses: [COMET_OPTIMISM_WETH],
    cache: cacheStore as never,
  });

  assert.equal(result.tokens.some((t) => t.symbol === "Comp broken"), false);
  const wrseth = result.tokens.find((t) => t.symbol === "Comp wrsETH");
  assert.ok(wrseth);
  assert.deepEqual(wrseth.balanceSelectorExtraArgs, [CTOKEN_WRSETH_WORD]);
  assert.ok(result.errors.some((e) => e.includes("invalid cached cToken")));
});
