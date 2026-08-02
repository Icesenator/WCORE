import assert from "node:assert/strict";
import { test } from "node:test";
import type { WalletAssets } from "@wcore/core";

import { createWalletHintVerifierDeps, verifyWalletHints } from "./wallet-hints.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function assets(chain: string, tokens: Record<string, unknown>[] = []): WalletAssets {
  return {
    chain,
    chainName: chain,
    native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
    tokens,
    errors: [],
    totalValueEur: 0,
    scanMs: 1,
  } as unknown as WalletAssets;
}

function token(contract: string, overrides: Record<string, unknown> = {}) {
  return {
    contract,
    symbol: "TKN",
    name: "WCORE Token",
    decimals: 18,
    balance: 2,
    priceEur: 3,
    valueEur: 999,
    priceSource: "dex",
    ...overrides,
  };
}

test("accepts hints only after WCORE independently verifies balance and price", async () => {
  const verified = token(TOKEN_A, { providerVerified: true, providerId: "zerion", DEFI: true });
  const result = await verifyWalletHints({
    address: ADDRESS,
    hints: [{ chain: "BASE", contract: TOKEN_A }],
    assetsByChain: new Map([["BASE", assets("BASE")]]),
  }, {
    scanEvmHints: async (chain) => assets(chain, [verified]),
    scanSolana: async (chain) => assets(chain),
  });
  const added = result.get("BASE")!.tokens[0] as Record<string, unknown>;
  assert.equal(added.valueEur, 6);
  assert.equal(added.providerVerified, undefined);
  assert.equal(added.providerId, undefined);
  assert.equal(added.DEFI, undefined);
  assert.equal(result.get("BASE")!.totalValueEur, 6);
});

test("deduplicates hints, preserves existing tokens, and rejects unpriced or mismatched additions", async () => {
  let requested: readonly string[] = [];
  const existing = token(TOKEN_A.toUpperCase(), { symbol: "OLD" });
  const result = await verifyWalletHints({
    address: ADDRESS,
    hints: [
      { chain: "base", contract: TOKEN_A },
      { chain: "BASE", contract: TOKEN_A.toUpperCase() },
      { chain: "BASE", contract: TOKEN_B },
    ],
    assetsByChain: new Map([["BASE", assets("BASE", [existing])]]),
  }, {
    scanEvmHints: async (chain, _address, contracts) => {
      requested = contracts;
      return assets(chain, [token(TOKEN_B, { priceEur: null }), token("0xcccccccccccccccccccccccccccccccccccccccc")]);
    },
    scanSolana: async (chain) => assets(chain),
  });
  assert.deepEqual(requested, [TOKEN_B]);
  assert.equal(result.get("BASE")!.tokens.length, 1);
  assert.equal(result.get("BASE")!.tokens[0], existing);
});

test("fails open per chain and ignores unsupported chains", async () => {
  const original = assets("BASE");
  const result = await verifyWalletHints({
    address: ADDRESS,
    hints: [{ chain: "BASE", contract: TOKEN_A }, { chain: "UNKNOWN", contract: TOKEN_B }],
    assetsByChain: new Map([["BASE", original]]),
  }, {
    scanEvmHints: async () => { throw new Error("RPC unavailable"); },
    scanSolana: async (chain) => assets(chain),
  });
  assert.equal(result.get("BASE"), original);
  assert.equal(result.has("UNKNOWN"), false);
});

test("production verifier bounds EVM hints and enables strict token scanning", async () => {
  const calls: unknown[][] = [];
  const adapter = createWalletHintVerifierDeps({
    getEvmWalletAssets: async (...args) => {
      calls.push(args);
      return assets("BASE");
    },
    getWalletAssets: async (...args) => {
      calls.push(args);
      return assets("SOLANA");
    },
  });
  const contracts = Array.from({ length: 1_001 }, (_, index) => `0x${index.toString(16).padStart(40, "0")}`);
  await adapter.scanEvmHints("BASE", ADDRESS, contracts);
  assert.equal((calls[0]![2] as { customTokens: string[] }).customTokens.length, 1_000);
  assert.equal((calls[0]![2] as { strictTokens: boolean }).strictTokens, true);
});
