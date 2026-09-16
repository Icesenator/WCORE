import assert from "node:assert/strict";
import { test } from "node:test";

import type { WalletAssets } from "@wcore/core";

import type { EnrichmentOutcome } from "./service.js";
import type { ProviderPortfolioSnapshot } from "./types.js";
import { mergeEnrichmentIntoAssets, type EnrichmentMergeDeps } from "./merge.js";

const WCORE_TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NEW_CONTRACT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function assetsWith(chain: string, contracts: string[]): WalletAssets {
  return {
    chain,
    chainName: chain,
    native: { symbol: "ETH", balance: 1, priceEur: 1000, valueEur: 1000 },
    tokens: contracts.map((contract, i) => ({ symbol: `T${i}`, balance: 5, priceEur: 1, valueEur: 5, contract, name: `T${i}`, decimals: 18 })),
    errors: [],
    totalValueEur: 1000,
    scanMs: 1,
  } as unknown as WalletAssets;
}

function snapshot(provider: ProviderPortfolioSnapshot["provider"], hints: string[] = [], positionContracts: string[] = []): ProviderPortfolioSnapshot {
  return {
    provider,
    walletHints: hints.map((contract) => ({ chain: "ETHEREUM", contract })),
    positions: positionContracts.map((contract, i) => ({
      provider,
      chain: "ETHEREUM",
      protocol: "aave-v3",
      type: "collateral" as const,
      contract,
      positionId: `${provider}-${i}`,
      balance: 999, // provider-reported, must NOT be trusted as the candidate balance
      priceEur: 1,
      valueEur: 999,
      liquidity: "liquid" as const,
      providerVerified: true as const,
    })),
    derivedPositionValueEur: positionContracts.length * 999,
    observedAt: "2026-01-01T00:00:00.000Z",
    diagnostics: {},
  };
}

const outcome = (provider: EnrichmentOutcome["provider"], status: EnrichmentOutcome["status"], snap: ProviderPortfolioSnapshot | null): EnrichmentOutcome => ({
  provider,
  status,
  snapshot: snap,
  stale: status === "STALE",
});

test("collision: a contract WCORE already holds is never a candidate and is not re-verified", async () => {
  let verifyCalls = 0;
  const deps: EnrichmentMergeDeps = {
    verifyContract: async () => { verifyCalls += 1; return { contract: NEW_CONTRACT, balance: 1 }; },
  };
  const r = await mergeEnrichmentIntoAssets(
    { address: "0x1", assetsByChain: new Map([["ETHEREUM", assetsWith("ETHEREUM", [WCORE_TOKEN])]]), outcomes: [outcome("zerion", "SUCCESS", snapshot("zerion", [WCORE_TOKEN]))] },
    deps,
  );
  assert.equal(r.candidates.length, 0);
  assert.equal(r.diagnostics.collisions, 1);
  assert.equal(verifyCalls, 0, "WCORE-owned contracts must not trigger a provider re-verification");
});

test("a non-colliding, RPC-verified hint becomes a candidate with the RPC balance (not the provider value)", async () => {
  const deps: EnrichmentMergeDeps = { verifyContract: async () => ({ contract: NEW_CONTRACT, balance: 42 }) };
  const r = await mergeEnrichmentIntoAssets(
    { address: "0x1", assetsByChain: new Map([["ETHEREUM", assetsWith("ETHEREUM", [])]]), outcomes: [outcome("zerion", "SUCCESS", snapshot("zerion", [NEW_CONTRACT]))] },
    deps,
  );
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0]?.balance, 42, "candidate balance comes from RPC verification only");
  assert.equal(r.candidates[0]?.reason, "wallet-hint");
  assert.equal(r.candidates[0]?.contract, NEW_CONTRACT);
});

test("a non-verifiable suggestion is dropped (fail-closed)", async () => {
  const deps: EnrichmentMergeDeps = { verifyContract: async () => null };
  const r = await mergeEnrichmentIntoAssets(
    { address: "0x1", assetsByChain: new Map([["ETHEREUM", assetsWith("ETHEREUM", [])]]), outcomes: [outcome("zerion", "SUCCESS", snapshot("zerion", [NEW_CONTRACT]))] },
    deps,
  );
  assert.equal(r.candidates.length, 0);
  assert.equal(r.diagnostics.unverified, 1);
});

test("verify throwing is treated as unverified, never propagated", async () => {
  const deps: EnrichmentMergeDeps = { verifyContract: async () => { throw new Error("rpc down"); } };
  const r = await mergeEnrichmentIntoAssets(
    { address: "0x1", assetsByChain: new Map([["ETHEREUM", assetsWith("ETHEREUM", [])]]), outcomes: [outcome("zerion", "SUCCESS", snapshot("zerion", [], [NEW_CONTRACT]))] },
    deps,
  );
  assert.equal(r.candidates.length, 0);
  assert.equal(r.diagnostics.unverified, 1);
  assert.equal(r.candidates.length, 0);
});

test("positions resolve to candidates; receipt-only positions count as metadata", async () => {
  const deps: EnrichmentMergeDeps = { verifyContract: async () => ({ contract: NEW_CONTRACT, balance: 7 }) };
  const r = await mergeEnrichmentIntoAssets(
    { address: "0x1", assetsByChain: new Map([["ETHEREUM", assetsWith("ETHEREUM", [])]]), outcomes: [outcome("zerion", "SUCCESS", snapshot("zerion", [], [NEW_CONTRACT]))] },
    deps,
  );
  assert.equal(r.candidates[0]?.reason, "provider-position");
  assert.equal(r.diagnostics.metadataOnly, 0);
});

test("non-contributing providers (TIMEOUT/PROVIDER_ERROR/DISABLED/EMPTY) never contribute candidates", async () => {
  let verifyCalls = 0;
  const deps: EnrichmentMergeDeps = { verifyContract: async () => { verifyCalls += 1; return { contract: NEW_CONTRACT, balance: 1 }; } };
  const snap = snapshot("zerion", [NEW_CONTRACT]);
  const r = await mergeEnrichmentIntoAssets(
    {
      address: "0x1",
      assetsByChain: new Map([["ETHEREUM", assetsWith("ETHEREUM", [])]]),
      outcomes: [
        outcome("zerion", "TIMEOUT", null),
        outcome("zerion", "PROVIDER_ERROR", null),
        outcome("helius", "DISABLED", null),
        outcome("zerion", "EMPTY", snap),
      ],
    },
    deps,
  );
  assert.equal(r.candidates.length, 0);
  assert.equal(verifyCalls, 0);
});

test("WCORE assets are never mutated: same entries, tokens untouched (WCORE authority)", async () => {
  const original = assetsWith("ETHEREUM", [WCORE_TOKEN]);
  const tokensBefore = original.tokens;
  const input = new Map([["ETHEREUM", original]]);
  const deps: EnrichmentMergeDeps = { verifyContract: async () => ({ contract: NEW_CONTRACT, balance: 3 }) };
  const r = await mergeEnrichmentIntoAssets({ address: "0x1", assetsByChain: input, outcomes: [outcome("zerion", "SUCCESS", snapshot("zerion", [NEW_CONTRACT]))] }, deps);
  assert.equal(r.assetsByChain.get("ETHEREUM"), original, "entry reference preserved");
  assert.equal((r.assetsByChain.get("ETHEREUM") as WalletAssets).tokens, tokensBefore, "tokens array untouched");
  assert.equal((r.assetsByChain.get("ETHEREUM") as WalletAssets).tokens.length, 1);
  assert.equal(r.diagnostics.mutatedAssets, false);
});

test("DON'T invert guard: dedupes the same contract across providers", async () => {
  let verifyCalls = 0;
  const deps: EnrichmentMergeDeps = { verifyContract: async () => { verifyCalls += 1; return { contract: NEW_CONTRACT, balance: 1 }; } };
  const r = await mergeEnrichmentIntoAssets(
    {
      address: "0x1",
      assetsByChain: new Map([["ETHEREUM", assetsWith("ETHEREUM", [])]]),
      outcomes: [outcome("zerion", "SUCCESS", snapshot("zerion", [NEW_CONTRACT])), outcome("zerion", "SUCCESS", snapshot("zerion", [NEW_CONTRACT]))],
    },
    deps,
  );
  assert.equal(r.candidates.length, 1);
  assert.equal(verifyCalls, 1);
});
