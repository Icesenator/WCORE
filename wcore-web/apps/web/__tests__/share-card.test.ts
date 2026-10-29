import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roundTotalForShare, buildShareCardUrl, portfolioOutputAvailability, portfolioCsvFilename } from "../lib/share-card";
import { serializeFunnelEvent } from "../lib/funnel-analytics";

const summarySource = readFileSync(new URL("../components/PortfolioSummaryCard.tsx", import.meta.url), "utf8");
const walletContentSource = readFileSync(new URL("../components/WalletContent.tsx", import.meta.url), "utf8");
const scanDetailSource = readFileSync(new URL("../app/scans/[id]/ScanDetailClient.tsx", import.meta.url), "utf8");

// Minimal chain shapes, matching makeErrorChainScan (failed) and a successful scan.
const ok = (key: string, withAsset = true) => ({ chainKey: key, errors: [] as Array<{ message: string }>, native: withAsset ? { symbol: "ETH" } : null, tokens: [] as unknown[] });
const failed = (key: string, message = "chain_timeout") => ({ chainKey: key, errors: [{ message }], native: null, tokens: [] as unknown[] });
const degradedWithAssets = (key: string) => ({ chainKey: key, errors: [{ message: "pricing_partial" }], native: { symbol: "ETH", balance: 1.5 }, tokens: [] as unknown[] });

// Real API failure shape: buildChainScan always emits a native asset (apps/api/src/plugins/scan.ts:448,533,690).
const apiFailed = (key: string, message: string) => ({ chainKey: key, errors: [{ message }], native: { symbol: "NATIVE", balance: 0 }, tokens: [] as unknown[] });
const emptyWalletNoPrice = (key: string) => ({ chainKey: key, errors: [{ message: "native price: NO_PRICE" }], native: { symbol: "ETH", balance: 0 }, tokens: [] as unknown[] });
const staleKept = (key: string) => ({ chainKey: key, errors: [{ message: "stale_refresh_failed: chain_timeout after 90000ms" }], native: { symbol: "ETH", balance: 0.5 }, tokens: [] as unknown[] });

describe("portfolio outputs with real API failure shapes", () => {
  for (const message of ["chain_timeout after 90000ms", "circuit_open", "scan_failed", "batch_scan_failed", "batch_missing_chain_result"]) {
    test(`an API chain failing with '${message}' and a zero native is a failed chain`, () => {
      const state = portfolioOutputAvailability({ scanComplete: true, chains: [ok("BASE"), apiFailed("ETHEREUM", message)] });
      assert.equal(state.failedChains, 1);
      assert.equal(state.usableChains, 1);
      assert.equal(state.share, false);
      assert.equal(state.partial, true);
    });
  }

  for (const message of [
    "no chain-verified RPC endpoints for FOO",
    "no REST URL for osmosis",
    "chain disabled: FOO",
    "fetch failed",
    "native balance failed on all 3 RPCs",
    "token accounts: no data from any RPC endpoint",
    "balances HTTP 503",
  ]) {
    test(`a free-form engine failure '${message}' with no asset is a failed chain`, () => {
      const state = portfolioOutputAvailability({ scanComplete: true, chains: [ok("BASE"), apiFailed("X", message)] });
      assert.equal(state.failedChains, 1);
      assert.equal(state.partial, true);
      assert.equal(state.share, false);
    });
  }

  for (const message of ["[BAL_CACHE] hit", "decimals_unknown for ibc/ABC", "explorer API No tokens found"]) {
    test(`a benign '${message}' error on an empty chain stays usable`, () => {
      const state = portfolioOutputAvailability({ scanComplete: true, chains: [apiFailed("BASE", message)] });
      assert.equal(state.failedChains, 0);
      assert.equal(state.share, true);
    });
  }

  test("an empty wallet with only a benign NO_PRICE error stays usable", () => {
    const state = portfolioOutputAvailability({ scanComplete: true, chains: [emptyWalletNoPrice("BASE")] });
    assert.deepEqual({ share: state.share, partial: state.partial, failed: state.failedChains }, { share: true, partial: false, failed: 0 });
  });

  // Revised 2026-10-28: an old value kept after a failed refresh is not fresh data.
  test("a stale refresh that kept previous non-zero assets is not usable for share or a complete export", () => {
    const state = portfolioOutputAvailability({ scanComplete: true, chains: [ok("ETHEREUM"), staleKept("BASE")] });
    assert.equal(state.failedChains, 1);
    assert.equal(state.share, false);
    assert.equal(state.partial, true);
  });

  test("failed chains are counted once per chain key across wallets", () => {
    const state = portfolioOutputAvailability({ scanComplete: true, chains: [ok("BASE"), apiFailed("ETHEREUM", "chain_timeout"), apiFailed("ethereum", "chain_timeout")] });
    assert.equal(state.failedChains, 1);
  });
});

describe("portfolio outputs after failed or partial scans", () => {
  test("a finished scan where every chain failed exposes neither share nor export", () => {
    const state = portfolioOutputAvailability({ scanComplete: true, chains: [failed("BASE"), failed("ETHEREUM", "batch_scan_failed")] });
    assert.equal(state.share, false);
    assert.equal(state.export, false);
    assert.equal(state.reason, "no_result");
  });

  test("a finished scan with some failed chains blocks the public card and labels the export as partial", () => {
    const state = portfolioOutputAvailability({ scanComplete: true, chains: [ok("BASE"), failed("ETHEREUM")] });
    assert.equal(state.share, false);
    assert.equal(state.export, true);
    assert.equal(state.partial, true);
    assert.equal(state.failedChains, 1);
    assert.equal(state.reason, "partial_result");
  });

  test("failed chains are not counted in the share card chain bucket", () => {
    const state = portfolioOutputAvailability({ scanComplete: true, chains: [ok("BASE"), ok("ETHEREUM", false)] });
    assert.equal(state.share, true);
    assert.equal(state.usableChains, 2);
  });

  test("a degraded chain that still returned assets is usable, not failed", () => {
    const state = portfolioOutputAvailability({ scanComplete: true, chains: [degradedWithAssets("CEX_KRAKEN")] });
    assert.deepEqual({ share: state.share, export: state.export, partial: state.partial }, { share: true, export: true, partial: false });
  });

  test("a CEX-only finished scan keeps share and export", () => {
    const state = portfolioOutputAvailability({ scanComplete: true, chains: [ok("CEX_BINANCE")] });
    assert.equal(state.share, true);
    assert.equal(state.export, true);
  });

  test("partial export filename is explicit", () => {
    assert.match(portfolioCsvFilename(new Date("2026-10-28T10:00:00Z"), true), /^wcore-scan-2026-10-28-partial\.csv$/);
    assert.match(portfolioCsvFilename(new Date("2026-10-28T10:00:00Z"), false), /^wcore-scan-2026-10-28\.csv$/);
  });

  test("summary card passes chain results, not a raw chain count, to the gate", () => {
    assert.match(summarySource, /portfolioOutputAvailability\(\{ scanComplete, chains: allChainCards \}\)/);
    assert.match(summarySource, /chainCount: outputs\.usableChains/);
  });
});

describe("portfolio outputs during incomplete scans", () => {
  test("zero chains never produces a share card url (no '1-5 chains' label)", () => {
    assert.equal(buildShareCardUrl("https://api.example.com", { totalEur: 0, walletCount: 1, chainCount: 0 }), null);
  });

  test("share and export are unavailable while the scan is running", () => {
    const state = portfolioOutputAvailability({ scanComplete: false, chains: [ok("BASE")] });
    assert.equal(state.share, false);
    assert.equal(state.export, false);
    assert.equal(state.reason, "scan_in_progress");
  });

  test("share and export are unavailable when a finished scan has no chain result", () => {
    const state = portfolioOutputAvailability({ scanComplete: true, chains: [] });
    assert.equal(state.share, false);
    assert.equal(state.export, false);
    assert.equal(state.reason, "no_result");
  });

  test("share and export stay available on a finished scan with results", () => {
    assert.deepEqual(portfolioOutputAvailability({ scanComplete: true, chains: [ok("BASE")] }), { share: true, export: true, partial: false, usableChains: 1, failedChains: 0, reason: null });
  });

  test("summary card gates share and export on scan completion", () => {
    assert.match(summarySource, /portfolioOutputAvailability\(/);
    assert.match(summarySource, /disabled=\{!outputs\.export\}/);
    assert.match(walletContentSource, /scanComplete=\{!isLoading\}/);
  });

  test("non-finite chain counts never produce a card", () => {
    assert.equal(buildShareCardUrl("https://api.example.com", { totalEur: 1, walletCount: 1, chainCount: Number.POSITIVE_INFINITY }), null);
    assert.equal(buildShareCardUrl("https://api.example.com", { totalEur: 1, walletCount: 1, chainCount: Number.NaN }), null);
  });

  test("blocked share is a real disabled button, not an inert span", () => {
    assert.match(summarySource, /<button[^>]*disabled[^>]*>\s*↗ Share<\/button>/);
    assert.doesNotMatch(summarySource, /aria-disabled="true"/);
  });

  test("saved-scan action row wraps on mobile instead of overflowing (390px QA: 416px scrollWidth)", () => {
    assert.match(scanDetailSource, /<div className="flex flex-wrap items-start justify-between gap-3">/);
    assert.match(scanDetailSource, /<div className="flex flex-wrap gap-2">/);
    assert.match(scanDetailSource, /<div className="flex min-w-0 gap-1">/);
    assert.match(scanDetailSource, /min-w-0 w-40 max-w-full/);
  });

  test("saved-scan public link warns that the full address becomes visible before creation", () => {
    assert.match(scanDetailSource, /full wallet address/i);
    const confirmAt = scanDetailSource.indexOf("window.confirm(SHARE_SCAN_ADDRESS_WARNING)");
    const postAt = scanDetailSource.indexOf('`/api/scans/${id}/share`, { method: "POST" }');
    assert.ok(confirmAt > 0 && postAt > 0, "confirm and POST must both exist");
    assert.ok(confirmAt < postAt, "confirm must run before the POST that creates the public link");
    assert.match(scanDetailSource.slice(confirmAt, postAt), /return;/);
  });
});

describe("share card url builder", () => {
  test("rounds totals into compact share-safe strings", () => {
    assert.equal(roundTotalForShare(0), "0");
    assert.equal(roundTotalForShare(999), "999");
    assert.equal(roundTotalForShare(1234), "1.2k");
    assert.equal(roundTotalForShare(12400), "12.4k");
    assert.equal(roundTotalForShare(1_234_567), "1.2M");
    assert.equal(roundTotalForShare(-50), "0");
  });

  test("builds a bucketed api url without any raw address or exact total", () => {
    const url = buildShareCardUrl("https://api.example.com", {
      totalEur: 12400,
      walletCount: 2,
      chainCount: 25,
      cexCount: 3,
    });
    assert.ok(url);
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, "https://api.example.com/api/share/clean-total-card.png");
    assert.equal(parsed.searchParams.get("total"), "12.4k");
    assert.equal(parsed.searchParams.get("cur"), "eur");
    assert.equal(parsed.searchParams.get("wallets"), "2_3");
    assert.equal(parsed.searchParams.get("chains"), "21_50");
    assert.equal(parsed.searchParams.get("cex"), "3");
  });

  test("clamps out-of-range cex counts", () => {
    const url = buildShareCardUrl("https://api.example.com", {
      totalEur: 500,
      walletCount: 1,
      chainCount: 3,
      cexCount: 99,
    });
    assert.ok(url);
    assert.equal(new URL(url).searchParams.get("cex"), "20");
  });

  test("portfolio summary exposes a share action wired to the card builder", () => {
    assert.match(summarySource, /trackAction\("share"\)/);
    assert.match(summarySource, /buildShareCardUrl\(getApiUrl\(\)/);
    assert.match(walletContentSource, /cexCount=/);
  });

  test("funnel serialization accepts the share portfolio action", () => {
    const payload = serializeFunnelEvent({
      event: "portfolio_action",
      campaign: "one_portfolio",
      surface: "wallet",
      variant: "control",
      dimensions: { action: "share" },
    });
    assert.deepEqual(payload.events[0]?.dimensions, { action: "share" });
  });
});
