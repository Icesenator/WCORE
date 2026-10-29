import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScanResult } from "@wcore/shared";
import { readFileSync } from "node:fs";

test("history mounts health below summary with receipt time, without changing totals", () => {
  const source = readFileSync(new URL("../app/scans/[id]/ScanDetailClient.tsx", import.meta.url), "utf8");
  assert.match(source, /setObservedAt\(new Date\(\)\.toISOString\(\)\)/);
  assert.match(source, /projectHistoricalPortfolioHealth\(scan, observedAt\)/);
  assert.match(source, /<PortfolioHealthPanel health=\{health\} formatValue=\{formatValue\}/);
  assert.ok(source.indexOf("<PortfolioHealthPanel") > source.indexOf("Scan Result"));
  assert.match(source, /const totalEur = scan.totalEur/);
});

const address = "0x1111111111111111111111111111111111111111";
const now = "2026-10-26T12:00:00.000Z";
const result: ScanResult = {
  address, requestedChains: ["BASE"], generatedAt: "2026-10-26T11:00:00.000Z",
  chains: [{ chainKey: "BASE", chainName: "Base", vm: "EVM", native: null,
    tokens: [{ contract: "native", symbol: "ETH", name: "Ether", decimals: 18, balance: 1, priceEur: 2, valueEur: 2, priceSource: "fixture", flags: [] }],
    totals: { valueEur: 2, tokenCount: 1, pricedCount: 1 }, errors: [], degraded: false, fxRate: 1, scanMs: 1, cachedAt: null, scriptVersion: "fixture" }],
  totals: { valueEur: 2, tokenCount: 1, pricedCount: 1, chainsWithErrors: 0 },
};

async function adapter() {
  const mod = await import("../lib/historical-portfolio-health").catch(() => null);
  assert.ok(mod, "historical health adapter exists");
  return mod.projectHistoricalPortfolioHealth;
}

test("historical health uses result request scope and explicit time, without staleness policy", async () => {
  const project = await adapter();
  const health = project({ address, chains: ["OTHER"], result }, now);
  assert.equal(health.sources[0]!.requestedChainsSource, "RESULT");
  assert.deepEqual(health.scope.requested, ["base"]);
  assert.equal(health.sources[0]!.scanAgeMs, 3600000);
  assert.equal(health.sources[0]!.stale, null);
  assert.equal(health.totals.staleEvaluated, false);
  assert.equal(health.sources[0]!.priceObservedAt, null);
  assert.equal(health.sources[0]!.balanceObservedAt, null);
});

test("legacy history uses attested persisted request, never responded chains", async () => {
  const project = await adapter();
  const { requestedChains: _, ...legacy } = result;
  const health = project({ address, chains: ["BASE", "ETHEREUM"], result: legacy }, now);
  assert.equal(health.sources[0]!.requestedChainsSource, "FILTER");
  assert.deepEqual(health.scope.missing, ["ethereum"]);
  assert.equal(health.sources[0]!.state, "PARTIAL");
  assert.equal(health.totals.knownValueEur, 2);
  assert.equal(health.totals.valueComplete, false);
});

test("missing results remain not scanned, never zero or synthetic time", async () => {
  const project = await adapter();
  const health = project({ address, chains: ["BASE"] }, now);
  assert.equal(health.sources[0]!.state, "NOT_SCANNED");
  assert.equal(health.sources[0]!.requestedChainsSource, "NONE");
  assert.equal(health.sources[0]!.generatedAtRaw, null);
  assert.equal(health.totals.knownValueEur, null);
});

for (const generatedAt of ["2027-01-01T00:00:00Z", "unreadable", undefined]) {
  test(`unproven timestamp stays UNKNOWN with raw provenance: ${generatedAt}`, async () => {
    const project = await adapter();
    const health = project({ address, chains: ["BASE"], result: { ...result, generatedAt } }, now);
    assert.equal(health.sources[0]!.state, "UNKNOWN");
    assert.equal(health.sources[0]!.generatedAtRaw, generatedAt ?? null);
    assert.equal(health.sources[0]!.scanAgeMs, null);
    assert.equal(health.totals.knownValueEur, null);
    assert.equal(health.totals.valueComplete, false);
  });
}

test("health panel renders English, known-only qualifiers and unknown freshness", async () => {
  const project = await adapter();
  const mod = await import("../components/PortfolioHealthPanel").catch(() => null);
  assert.ok(mod, "health panel exists");
  const html = renderToStaticMarkup(createElement(mod.PortfolioHealthPanel, {
    health: project({ address, chains: ["BASE"], result }, now), formatValue: (n: number) => `EUR ${n}`,
  }));
  assert.match(html, /Portfolio health/);
  assert.match(html, /Complete known value/);
  assert.match(html, /Not an exhaustive portfolio total/);
  assert.match(html, /Price freshness: Unknown/);
  assert.match(html, /Balance freshness: Unknown/);
  assert.match(html, /Staleness: Not evaluated/);
  assert.match(html, /RESULT/);
});

test("health panel exposes unknown pricing and balance evidence", async () => {
  const project = await adapter();
  const mod = await import("../components/PortfolioHealthPanel");
  const partial = { ...result, chains: result.chains.map(c => ({ ...c, errors: [{ stage: "balances", message: "unavailable" }], tokens: c.tokens.map(t => ({ ...t, priceEur: null, valueEur: null })) })) };
  const html = renderToStaticMarkup(createElement(mod.PortfolioHealthPanel, {
    health: project({ address, chains: ["BASE"], result: partial }, now), formatValue: String,
  }));
  assert.match(html, /Partial/);
  assert.match(html, /Unknown-price positions: <\/dt><dd class="inline">1/);
  assert.match(html, /Unknown-balance chains: <\/dt><dd class="inline break-words">BASE/);
});

test("history summary never shows an unknown value as zero and qualifies partial totals", async () => {
  const project = await adapter();
  const mod = await import("../lib/historical-portfolio-health");
  assert.equal(typeof mod.historicalSummaryValue, "function", "summary helper exists");
  const unpriced = { ...result, chains: result.chains.map(c => ({ ...c, tokens: c.tokens.map(t => ({ ...t, priceEur: null, valueEur: null })) })) };
  assert.deepEqual(mod.historicalSummaryValue(project({ address, chains: ["BASE"] }, now), 0), { value: null, qualifier: "UNKNOWN" });
  assert.deepEqual(mod.historicalSummaryValue(project({ address, chains: ["BASE"], result: unpriced }, now), 0), { value: null, qualifier: "UNKNOWN" });
  assert.deepEqual(mod.historicalSummaryValue(project({ address, chains: ["BASE"], result: { ...result, generatedAt: "2099-01-01T00:00:00Z" } }, now), 2), { value: null, qualifier: "UNKNOWN" });
  const { requestedChains: _, ...legacy } = result;
  assert.deepEqual(mod.historicalSummaryValue(project({ address, chains: ["BASE", "ETHEREUM"], result: legacy }, now), 2), { value: 2, qualifier: "PARTIAL" });
  assert.deepEqual(mod.historicalSummaryValue(project({ address, chains: ["BASE"], result }, now), 2), { value: 2, qualifier: "COMPLETE" });
  const source = readFileSync(new URL("../app/scans/[id]/ScanDetailClient.tsx", import.meta.url), "utf8");
  assert.match(source, /historicalSummaryValue\(health, totalEur\)/);
  assert.doesNotMatch(source, /\{formatValue\(totalEur\)\}/, "summary must not format the raw total directly");
});

test("history chain card never shows an unpriced chain as zero", async () => {
  const mod = await import("../lib/historical-portfolio-health");
  assert.equal(typeof mod.historicalChainValue, "function", "chain helper exists");
  assert.deepEqual(mod.historicalChainValue({ valueEur: 0, tokenCount: 1, pricedCount: 0 }), { value: null, qualifier: "UNKNOWN" });
  assert.deepEqual(mod.historicalChainValue({ valueEur: 5, tokenCount: 3, pricedCount: 2 }), { value: 5, qualifier: "PARTIAL" });
  assert.deepEqual(mod.historicalChainValue({ valueEur: 5, tokenCount: 2, pricedCount: 2 }), { value: 5, qualifier: "COMPLETE" });
  assert.deepEqual(mod.historicalChainValue({ valueEur: 0, tokenCount: 0, pricedCount: 0 }), { value: 0, qualifier: "COMPLETE" });
  // W1 contre-revue : une chaîne en erreur ou dégradée n'est jamais un 0 complet.
  const failed = { errors: [{ stage: "balances", message: "unavailable" }], degraded: false };
  assert.deepEqual(mod.historicalChainValue({ valueEur: 0, tokenCount: 1, pricedCount: 1 }, failed), { value: null, qualifier: "UNKNOWN" });
  assert.deepEqual(mod.historicalChainValue({ valueEur: 0, tokenCount: 1, pricedCount: 1 }, { errors: [], degraded: true }), { value: null, qualifier: "UNKNOWN" });
  assert.deepEqual(mod.historicalChainValue({ valueEur: 5, tokenCount: 2, pricedCount: 2 }, failed), { value: 5, qualifier: "PARTIAL" });
  assert.deepEqual(mod.historicalChainValue({ valueEur: 5, tokenCount: 2, pricedCount: 2 }, { errors: [], degraded: true }), { value: 5, qualifier: "PARTIAL" });
  assert.deepEqual(mod.historicalChainValue({ valueEur: 5, tokenCount: 2, pricedCount: 2 }, { errors: [], degraded: false }), { value: 5, qualifier: "COMPLETE" });
  const source = readFileSync(new URL("../app/scans/[id]/ScanDetailClient.tsx", import.meta.url), "utf8");
  assert.match(source, /historicalChainValue\(chain\.totals, chain\)/);
  assert.doesNotMatch(source, /formatValue\(chain\.totals\.valueEur\)/);
});

test("health panel does not format unknown value as zero", async () => {
  const project = await adapter();
  const mod = await import("../components/PortfolioHealthPanel").catch(() => null);
  assert.ok(mod, "health panel exists");
  let formats = 0;
  const html = renderToStaticMarkup(createElement(mod.PortfolioHealthPanel, {
    health: project({ address, chains: [] }, now), formatValue: () => { formats++; return "ZERO"; },
  }));
  assert.equal(formats, 0);
  assert.match(html, /Not scanned/);
  assert.match(html, /Known value: Unknown/);
});
