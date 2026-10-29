import { describe, it, expect } from "vitest";
import type { ChainScan, ScanResult, TokenAsset } from "./scan-result";
import { projectPortfolioHealth, HEALTH_STATES } from "./portfolio-health";

function token(over: Partial<TokenAsset> = {}): TokenAsset {
  return {
    contract: "native", symbol: "ETH", name: "Ether", decimals: 18,
    balance: 1, priceEur: 2000, priceSource: "defillama", valueEur: 2000, flags: [],
    ...over,
  };
}
function chain(over: Partial<ChainScan> = {}): ChainScan {
  const native = over.native === undefined ? token() : over.native;
  const tokens = over.tokens ?? [];
  return {
    chainKey: "ethereum", chainName: "Ethereum", vm: "EVM" as const,
    native, tokens,
    totals: { valueEur: 2000, tokenCount: 1 + tokens.length, pricedCount: 1 + tokens.length },
    errors: [], degraded: false, fxRate: 1, scanMs: 10,
    cachedAt: null, scriptVersion: "test",
    ...over,
  };
}
function scan(over: Partial<ScanResult> = {}): ScanResult {
  return {
    address: "0x0000000000000000000000000000000000000001",
    requestedChains: ["ethereum"],
    chains: [chain()],
    totals: { valueEur: 2000, tokenCount: 1, pricedCount: 1, chainsWithErrors: 0 },
    generatedAt: "2026-10-22T10:00:00.000Z",
    ...over,
  };
}
const source = { id: "s1", address: "0x0000000000000000000000000000000000000001", label: null };

describe("health state classification", () => {
  it("exposes a closed set of states, never a numeric score", () => {
    expect(HEALTH_STATES).toEqual(["NOT_SCANNED", "KNOWN", "PARTIAL", "DEGRADED", "ERROR", "UNKNOWN"]);
  });

  it("marks a source without scan result as NOT_SCANNED, not zero", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [], filter: null });
    expect(h.sources[0]!.state).toBe("NOT_SCANNED");
    expect(h.sources[0]!.knownValueEur).toBeNull();
    expect(h.sources[0]!.zeroBalancePositions).toBeNull();
  });

  it("marks a fully priced, error-free scan as KNOWN", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan()], filter: null });
    expect(h.sources[0]!.state).toBe("KNOWN");
    expect(h.sources[0]!.knownValueEur).toBe(2000);
    expect(h.sources[0]!.unknownPricePositions).toBe(0);
  });

  it("distinguishes DEGRADED from PARTIAL", () => {
    const degraded = projectPortfolioHealth({ sources: [source], results: [scan({ chains: [chain({ degraded: true })] })], filter: null });
    expect(degraded.sources[0]!.state).toBe("DEGRADED");

    const partial = projectPortfolioHealth({
      sources: [source],
      results: [scan({ requestedChains: ["ethereum", "base"], totals: { ...scan().totals, tokenCount: 3, pricedCount: 1 } })],
      filter: null,
    });
    expect(partial.sources[0]!.state).toBe("PARTIAL");
    expect(partial.sources[0]!.missingChains).toEqual(["base"]);
  });

  it("marks a scan with zero chain results as ERROR", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ chains: [] })], filter: null });
    expect(h.sources[0]!.state).toBe("ERROR");
    expect(h.sources[0]!.knownValueEur).toBeNull();
  });

  it("keeps chain errors visible and preserves them verbatim", () => {
    const h = projectPortfolioHealth({
      sources: [source],
      results: [scan({ chains: [chain({ errors: [{ stage: "balances", message: "rpc timeout" }] })] })],
      filter: null,
    });
    expect(h.sources[0]!.state).toBe("PARTIAL");
    expect(h.sources[0]!.errors).toEqual([{ chainKey: "ethereum", stage: "balances", message: "rpc timeout" }]);
  });
});

describe("unknown is never zero", () => {
  it("keeps aggregate value unknown when no source has a proven value", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [], filter: null });
    expect(h.totals.knownValueEur).toBeNull();
    const empty = projectPortfolioHealth({ sources: [], results: [], filter: null });
    expect(empty.totals.knownValueEur).toBeNull();
  });

  it("does not call an empty failed result complete", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ chains: [], requestedChains: [] })], filter: null });
    expect(h.sources[0]!.state).toBe("ERROR");
    expect(h.sources[0]!.valueComplete).toBe(false);
    expect(h.sources[0]!.zeroBalancePositions).toBeNull();
  });
  it("does not treat a synthetic zero on balance failure as a known balance", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ chains: [chain({ native: token({ balance: 0, priceEur: null, valueEur: null }), errors: [{ stage: "balances", message: "timeout" }], totals: { valueEur: 0, tokenCount: 1, pricedCount: 0 } })] })], filter: null });
    expect(h.sources[0]!.knownValueEur).toBeNull();
    expect(h.sources[0]!.zeroBalancePositions).toBeNull();
  });

  it("exposes unknown balance chains even when an error placeholder contains a price and value zero", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ chains: [chain({ native: token({ balance: 0, valueEur: 0 }), errors: [{ stage: "balances", message: "timeout" }] })] })], filter: null });
    expect(h.sources[0]!.unknownBalanceChains).toEqual(["ethereum"]);
    expect(h.sources[0]!.knownValueEur).toBeNull();
    expect(h.sources[0]!.zeroBalancePositions).toBeNull();
  });

  it("derives known value from finite positions rather than an inconsistent chain total", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ chains: [chain({ totals: { valueEur: 9999, tokenCount: 1, pricedCount: 1 } })] })], filter: null });
    expect(h.sources[0]!.knownValueEur).toBe(2000);
  });

  it("counts unpriced positions separately from zero balances", () => {
    const unknownPrice = token({ priceEur: null, valueEur: null, priceSource: null, contract: "0xa", symbol: "ABC" });
    const zeroButKnown = token({ balance: 0, valueEur: 0, contract: "0xb", symbol: "ZED" });
    const c = chain({ tokens: [unknownPrice, zeroButKnown], totals: { valueEur: 2000, tokenCount: 3, pricedCount: 1 } });
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ chains: [c] })], filter: null });

    expect(h.sources[0]!.zeroBalancePositions).toBe(1);
    expect(h.sources[0]!.unknownPricePositions).toBe(1);
    expect(h.sources[0]!.knownValueEur).toBe(2000);
    expect(h.sources[0]!.valueComplete).toBe(false);
    expect(h.sources[0]!.state).toBe("PARTIAL");
  });

  it("reports aggregate unknown-price positions without inventing a total", () => {
    const h = projectPortfolioHealth({
      sources: [source],
      results: [scan({ chains: [chain({ tokens: [token({ priceEur: null, valueEur: null })] })] })],
      filter: null,
    });
    expect(h.totals.unknownPricePositions).toBe(1);
    expect(h.totals.valueComplete).toBe(false);
    expect(h.totals.knownValueEur).toBe(2000);
    expect(h.totals.exhaustiveValueEur).toBeNull();
  });

  it("marks missing generatedAt as UNKNOWN provenance instead of assuming freshness", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ generatedAt: "not-a-date" })], filter: null });
    expect(h.sources[0]!.scanObservedAt).toBeNull();
    expect(h.sources[0]!.state).toBe("UNKNOWN");
  });

  it("never claims price freshness from cachedAt", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ chains: [chain({ cachedAt: "2026-10-22T08:00:00.000Z" })] })], filter: null });
    expect(h.sources[0]!.cacheObservedAt).toBe("2026-10-22T08:00:00.000Z");
    expect(h.sources[0]!.priceObservedAt).toBeNull();
    expect(h.sources[0]!.balanceObservedAt).toBeNull();
  });
});

describe("scope, duplicates and filters", () => {
  it("matches EVM results through canonical identity rather than display case", () => {
    const address = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const h = projectPortfolioHealth({ sources: [{ ...source, address: address.toUpperCase().replace("0X", "0x") }], results: [scan({ address })], filter: null });
    expect(h.sources[0]!.state).toBe("KNOWN");
  });

  it("filters values and coverage to selected sources and chains", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ requestedChains: ["ethereum", "base"], chains: [chain(), chain({ chainKey: "base" })] }), scan({ address: "0x0000000000000000000000000000000000000002", requestedChains: ["solana"], chains: [chain({ chainKey: "solana" })] })], filter: { chains: ["base"] } });
    expect(h.totals.knownValueEur).toBe(2000);
    expect(h.scope.covered).toEqual(["base"]);
    expect(h.scope.missing).toEqual([]);
  });

  it("matches chain filter keys without case drift", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan()], filter: { chains: ["ETHEREUM"] } });
    expect(h.totals.knownValueEur).toBe(2000);
    expect(h.scope.consistent).toBe(true);
  });

  it("does not silently choose a winner for conflicting duplicate source results", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan(), scan({ chains: [chain({ native: token({ valueEur: 123 }) })] })], filter: null });
    expect(h.sources[0]!.state).toBe("UNKNOWN");
    expect(h.sources[0]!.knownValueEur).toBeNull();
  });

  it("does not count duplicate chain results twice", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ chains: [chain(), chain()] })], filter: null });
    expect(h.totals.knownValueEur).toBe(2000);
  });
  it("deduplicates the same source present twice before scanning or counting", () => {
    const h = projectPortfolioHealth({ sources: [source, { ...source, id: "s2" }], results: [scan()], filter: null });
    expect(h.sources).toHaveLength(1);
    expect(h.totals.sources).toBe(1);
    expect(h.totals.knownValueEur).toBe(2000);
  });

  it("keeps a filter restricted to scanned chains and flags an out-of-scope chain", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan()], filter: { chains: ["ethereum", "solana"] } });
    expect(h.scope.requested).toEqual(["ethereum", "solana"]);
    expect(h.scope.covered).toEqual(["ethereum"]);
    expect(h.scope.missing).toEqual(["solana"]);
    expect(h.scope.consistent).toBe(false);
    expect(h.totals.knownValueEur).toBe(2000);
  });

  it("does not merge two distinct wallets holding the same asset", () => {
    const other = { id: "s2", address: "0x0000000000000000000000000000000000000002", label: null };
    const otherScan = { ...scan(), address: other.address };
    const h = projectPortfolioHealth({ sources: [source, other], results: [scan(), otherScan], filter: null });
    expect(h.sources).toHaveLength(2);
    expect(h.totals.knownValueEur).toBe(4000);
    expect(h.totals.sourcesWithUnknown).toBe(0);
  });

  it("reports an unscanned source in totals without lowering known value to zero", () => {
    const other = { id: "s2", address: "0x0000000000000000000000000000000000000002", label: null };
    const h = projectPortfolioHealth({ sources: [source, other], results: [scan()], filter: null });
    expect(h.totals.sources).toBe(2);
    expect(h.totals.sourcesNotScanned).toBe(1);
    expect(h.totals.knownValueEur).toBe(2000);
    expect(h.totals.valueComplete).toBe(false);
  });
});

describe("staleness provenance", () => {
  it("keeps the raw generatedAt string when it cannot be parsed", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan({ generatedAt: "not-a-date" })], filter: null, now: "2026-10-22T12:00:00.000Z" });
    expect(h.sources[0]!.generatedAtRaw).toBe("not-a-date");
    expect(h.sources[0]!.scanObservedAt).toBeNull();
    expect(h.sources[0]!.scanAgeMs).toBeNull();
    expect(h.sources[0]!.stale).toBeNull();
  });

  it("computes an age only from an explicit now, never from the wall clock", () => {
    const withoutNow = projectPortfolioHealth({ sources: [source], results: [scan()], filter: null });
    expect(withoutNow.sources[0]!.scanAgeMs).toBeNull();
    expect(withoutNow.sources[0]!.stale).toBeNull();

    const withNow = projectPortfolioHealth({ sources: [source], results: [scan()], filter: null, now: "2026-10-22T11:00:00.000Z" });
    expect(withNow.sources[0]!.scanAgeMs).toBe(3_600_000);
  });

  it("flags stale only against a caller-provided threshold, never a hardcoded one", () => {
    const params = { sources: [source], results: [scan()], filter: null, now: "2026-10-22T13:00:00.000Z" };
    expect(projectPortfolioHealth({ ...params, maxScanAgeMs: 3_600_000 }).sources[0]!.stale).toBe(true);
    expect(projectPortfolioHealth({ ...params, maxScanAgeMs: 14_400_000 }).sources[0]!.stale).toBe(false);
    expect(projectPortfolioHealth(params).sources[0]!.stale).toBeNull();
  });

  it("treats a future-dated scan as unknown age instead of fresh", () => {
    const h = projectPortfolioHealth({ sources: [source], results: [scan()], filter: null, now: "2026-10-22T09:00:00.000Z", maxScanAgeMs: 3_600_000 });
    expect(h.sources[0]!.scanAgeMs).toBeNull();
    expect(h.sources[0]!.stale).toBeNull();
  });

  it("records which requestedChains list produced the coverage", () => {
    const fromResult = projectPortfolioHealth({ sources: [source], results: [scan()], filter: null });
    expect(fromResult.sources[0]!.requestedChainsSource).toBe("RESULT");

    const fromFilter = projectPortfolioHealth({ sources: [source], results: [scan()], filter: { chains: ["ethereum"] } });
    expect(fromFilter.sources[0]!.requestedChainsSource).toBe("FILTER");
  });

  it("aggregates stale sources only when staleness is actually evaluated", () => {
    const evaluated = projectPortfolioHealth({ sources: [source], results: [scan()], filter: null, now: "2026-10-23T10:00:00.000Z", maxScanAgeMs: 3_600_000 });
    expect(evaluated.totals.staleEvaluated).toBe(true);
    expect(evaluated.totals.staleSources).toBe(1);

    const notEvaluated = projectPortfolioHealth({ sources: [source], results: [scan()], filter: null });
    expect(notEvaluated.totals.staleEvaluated).toBe(false);
    expect(notEvaluated.totals.staleSources).toBeNull();
  });
});
