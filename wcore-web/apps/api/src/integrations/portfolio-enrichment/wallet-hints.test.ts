import assert from "node:assert/strict";
import { test } from "node:test";
import type { WalletAssetProvenance, WalletAssets } from "@wcore/core";
import {
  createWalletHintVerifierDeps,
  verifyWalletHints,
  type WalletHintVerifierDeps,
} from "./wallet-hints.js";
import type { ProviderWalletHint } from "./types.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SOL_MINT_A = "So11111111111111111111111111111111111111112";
const SOL_MINT_B = "Es9vMFrzaCERmJfrF4H2FYD6K6YQ6V9ZVQjH5w8nG7r";

const INTERNAL_PROVENANCE: WalletAssetProvenance = {
  providerVerified: true,
  providerId: "zerion",
  providerPositionId: "position-1",
  providerGroupId: "group-1",
};
void INTERNAL_PROVENANCE;

// @ts-expect-error Provider hints deliberately cannot carry provider-owned authority fields.
const INVALID_PROVIDER_HINT: ProviderWalletHint = { chain: "BASE", contract: TOKEN_A, balance: 999 };
void INVALID_PROVIDER_HINT;

function assets(chain: string, tokens: Array<Record<string, unknown>> = []): WalletAssets {
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

function evmToken(contract: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract,
    symbol: "TKN",
    name: "WCORE Token",
    decimals: 18,
    balance: 2,
    priceEur: 3,
    valueEur: 999,
    logoUrl: "https://example.com/token.png",
    metadata: { verified: "wcore" },
    priceSource: "dex",
    ...overrides,
  };
}

function svmToken(mint: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mint,
    symbol: "SOLT",
    name: "Solana Token",
    decimals: 6,
    balance: 2,
    priceEur: 3,
    valueEur: 6,
    ...overrides,
  };
}

function deps(overrides: Partial<WalletHintVerifierDeps> = {}): WalletHintVerifierDeps {
  return {
    scanEvmHints: async (chain, _address, contracts) => assets(chain, contracts.map((contract) => evmToken(contract))),
    scanSolana: async (chain) => assets(chain),
    ...overrides,
  };
}

test("uses only WCORE balance and price and preserves WCORE token metadata", async () => {
  const original = assets("BASE");
  const verified = evmToken(TOKEN_A, { providerVerified: true, providerId: "zerion", DEFI: true });
  const result = await verifyWalletHints({
    address: ADDRESS,
    hints: [{ chain: "BASE", contract: TOKEN_A }],
    assetsByChain: new Map([["BASE", original]]),
  }, deps({ scanEvmHints: async (chain) => assets(chain, [verified]) }));

  const enriched = result.get("BASE")!;
  assert.notEqual(enriched, original);
  assert.equal(enriched.tokens.length, 1);
  assert.deepEqual(enriched.tokens[0], { ...evmToken(TOKEN_A), valueEur: 6 });
  assert.equal(enriched.totalValueEur, 6);
  assert.equal((enriched.tokens[0] as Record<string, unknown>).providerVerified, undefined);
  assert.equal((enriched.tokens[0] as Record<string, unknown>).DEFI, undefined);
});

test("defaults missing WCORE pricing provenance to pricing-cascade", async () => {
  const result = await verifyWalletHints({
    address: ADDRESS,
    hints: [{ chain: "BASE", contract: TOKEN_A }],
    assetsByChain: new Map([["BASE", assets("BASE")]]),
  }, deps({
    scanEvmHints: async (chain) => assets(chain, [evmToken(TOKEN_A, { priceSource: undefined })]),
  }));

  assert.equal((result.get("BASE")!.tokens[0] as Record<string, unknown>).priceSource, "pricing-cascade");
});

test("excludes zero balances, missing or invalid prices, and mismatched returned contracts", async () => {
  const result = await verifyWalletHints({
    address: ADDRESS,
    hints: [
      { chain: "BASE", contract: TOKEN_A },
      { chain: "BASE", contract: TOKEN_B },
    ],
    assetsByChain: new Map([["BASE", assets("BASE")]]),
  }, deps({
    scanEvmHints: async (chain) => assets(chain, [
      evmToken(TOKEN_A, { balance: 0 }),
      evmToken(TOKEN_B, { priceEur: null }),
      evmToken("0xcccccccccccccccccccccccccccccccccccccccc"),
    ]),
  }));

  assert.deepEqual(result.get("BASE")!.tokens, []);
});

test("fails open per chain and ignores unsupported chains", async () => {
  let calls = 0;
  const original = assets("BASE");
  const result = await verifyWalletHints({
    address: ADDRESS,
    hints: [
      { chain: "BASE", contract: TOKEN_A },
      { chain: "UNKNOWN", contract: TOKEN_B },
    ],
    assetsByChain: new Map([["BASE", original]]),
  }, deps({
    scanEvmHints: async () => {
      calls += 1;
      throw new Error("RPC unavailable");
    },
  }));

  assert.equal(calls, 1);
  assert.equal(result.get("BASE"), original);
  assert.equal(result.has("UNKNOWN"), false);
});

test("deduplicates EVM hints case-insensitively and existing WCORE contracts win", async () => {
  let received: readonly string[] = [];
  const existing = evmToken(TOKEN_A.toUpperCase(), { symbol: "OLD", valueEur: 10 });
  const result = await verifyWalletHints({
    address: ADDRESS,
    hints: [
      { chain: "base", contract: TOKEN_A.toUpperCase() },
      { chain: "BASE", contract: TOKEN_A },
      { chain: "BASE", contract: TOKEN_B.toUpperCase() },
    ],
    assetsByChain: new Map([["BASE", assets("BASE", [existing])]]),
  }, deps({
    scanEvmHints: async (chain, _address, contracts) => {
      received = contracts;
      return assets(chain, contracts.map((contract) => evmToken(contract)));
    },
  }));

  assert.deepEqual(received, [TOKEN_B]);
  assert.equal(result.get("BASE")!.tokens[0], existing);
  assert.equal(result.get("BASE")!.tokens.length, 2);
});

test("scans Solana once and filters exact hinted mints and existing collisions", async () => {
  let calls = 0;
  const existing = svmToken(SOL_MINT_A, { symbol: "OLD" });
  const result = await verifyWalletHints({
    address: "9xQeWvG816bUx9EPjHmaT23yvVMd5eJ6XDZHL7Qn2QF",
    hints: [
      { chain: "SOLANA", contract: SOL_MINT_A },
      { chain: "solana", contract: SOL_MINT_A },
      { chain: "SOLANA", contract: SOL_MINT_B },
    ],
    assetsByChain: new Map([["SOLANA", assets("SOLANA", [existing])]]),
  }, deps({
    scanSolana: async (chain) => {
      calls += 1;
      return assets(chain, [
        svmToken(SOL_MINT_A),
        svmToken(SOL_MINT_B),
        svmToken("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iWv4GkJfVQ7"),
      ]);
    },
  }));

  assert.equal(calls, 1);
  assert.equal(result.get("SOLANA")!.tokens[0], existing);
  assert.deepEqual(result.get("SOLANA")!.tokens.slice(1).map((token) => (token as { mint: string }).mint), [SOL_MINT_B]);
});

test("production adapter passes bounded contracts with strictTokens and performs one Solana scan", async () => {
  const evmCalls: unknown[][] = [];
  const walletCalls: unknown[][] = [];
  const contracts = Array.from({ length: 1_001 }, (_, index) => `0x${index.toString(16).padStart(40, "0")}`);
  const adapter = createWalletHintVerifierDeps({
    getEvmWalletAssets: async (...args: unknown[]) => {
      evmCalls.push(args);
      return assets("BASE");
    },
    getWalletAssets: async (...args: unknown[]) => {
      walletCalls.push(args);
      return assets("SOLANA");
    },
  });

  await adapter.scanEvmHints("BASE", ADDRESS, contracts);
  await adapter.scanSolana("SOLANA", "9xQeWvG816bUx9EPjHmaT23yvVMd5eJ6XDZHL7Qn2QF");

  assert.equal((evmCalls[0]![2] as { customTokens: string[] }).customTokens.length, 1_000);
  assert.equal((evmCalls[0]![2] as { strictTokens: boolean }).strictTokens, true);
  assert.deepEqual(evmCalls[0]!.slice(0, 2), [ADDRESS, "BASE"]);
  assert.deepEqual(walletCalls, [["9xQeWvG816bUx9EPjHmaT23yvVMd5eJ6XDZHL7Qn2QF", "SOLANA"]]);
});
