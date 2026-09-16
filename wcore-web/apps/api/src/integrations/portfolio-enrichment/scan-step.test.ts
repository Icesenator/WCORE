import assert from "node:assert/strict";
import { test } from "node:test";

import type { WalletAssets } from "@wcore/core";

import type { EnrichmentOutcome, PortfolioEnrichmentFramework } from "./service.js";
import type { PortfolioEnrichmentInput, ProviderPortfolioSnapshot } from "./types.js";
import { createPortfolioEnrichmentScanStep } from "./scan-step.js";

const HINT = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function assets(): WalletAssets {
  return { chain: "ETHEREUM", chainName: "ETHEREUM", native: { symbol: "ETH", balance: 1, priceEur: 1, valueEur: 1 }, tokens: [], errors: [], totalValueEur: 1, scanMs: 1 } as unknown as WalletAssets;
}
function input(): PortfolioEnrichmentInput {
  return { address: "0x1", requestedChains: ["ETHEREUM"], assetsByChain: new Map([["ETHEREUM", assets()]]) };
}
function snapshot(): ProviderPortfolioSnapshot {
  return { provider: "zerion", walletHints: [{ chain: "ETHEREUM", contract: HINT }], positions: [], derivedPositionValueEur: 0, observedAt: "2026-01-01T00:00:00.000Z", diagnostics: {} };
}
const frameworkReturning = (outcomes: readonly EnrichmentOutcome[]): PortfolioEnrichmentFramework =>
  ({ run: async () => outcomes, enrich: async () => ({ assetsByChain: new Map(), diagnostics: {} }) }) as unknown as PortfolioEnrichmentFramework;
const frameworkThrowing = (): PortfolioEnrichmentFramework =>
  ({ run: async () => { throw new Error("boom"); }, enrich: async () => ({ assetsByChain: new Map(), diagnostics: {} }) }) as unknown as PortfolioEnrichmentFramework;

test("disabled: pure passthrough, framework never called", async () => {
  let called = 0;
  const fw = { run: async () => { called += 1; return []; }, enrich: async () => ({ assetsByChain: new Map(), diagnostics: {} }) } as unknown as PortfolioEnrichmentFramework;
  const step = createPortfolioEnrichmentScanStep({ framework: fw, verifyContract: async () => null });
  const inp = input();
  const r = await step.run(inp);
  assert.equal(r.diagnostics.enrichment, "disabled");
  assert.equal(r.assetsByChain.get("ETHEREUM"), inp.assetsByChain.get("ETHEREUM"));
  assert.equal(called, 0);
});

test("provider layer throwing never breaks the scan", async () => {
  const step = createPortfolioEnrichmentScanStep({ framework: frameworkThrowing(), verifyContract: async () => null, enabled: true });
  const inp = input();
  const r = await step.run(inp);
  assert.equal(r.diagnostics.enrichment, "provider_layer_error");
  assert.equal(r.assetsByChain.get("ETHEREUM"), inp.assetsByChain.get("ETHEREUM"));
});

test("enabled + verified hint: assets identity preserved, candidate counted, provider status reported", async () => {
  const fw = frameworkReturning([{ provider: "zerion", status: "SUCCESS", snapshot: snapshot(), stale: false }]);
  const step = createPortfolioEnrichmentScanStep({ framework: fw, verifyContract: async () => ({ contract: HINT, balance: 5 }), enabled: true });
  const inp = input();
  const r = await step.run(inp);
  assert.equal(r.diagnostics.enrichment, "ran");
  assert.equal(r.diagnostics.enrich_zerion, "SUCCESS");
  assert.equal(r.diagnostics.candidates, 1);
  assert.equal(r.diagnostics.mutatedAssets, false);
  assert.equal(r.assetsByChain.get("ETHEREUM"), inp.assetsByChain.get("ETHEREUM"), "WCORE entry unchanged");
});

test("verification failures are swallowed, scan still returns assets", async () => {
  const fw = frameworkReturning([{ provider: "zerion", status: "STALE", snapshot: snapshot(), stale: true }]);
  const step = createPortfolioEnrichmentScanStep({ framework: fw, verifyContract: async () => { throw new Error("rpc down"); }, enabled: true });
  const r = await step.run(input());
  assert.equal(r.diagnostics.enrichment, "ran");
  assert.equal(r.diagnostics.enrich_zerion, "STALE");
  assert.equal(r.diagnostics.candidates, 0);
  assert.equal(r.diagnostics.unverified, 1);
});
