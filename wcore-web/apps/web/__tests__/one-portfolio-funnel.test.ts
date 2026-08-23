import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildScanFinishedEvent,
  serializeFunnelEvent,
} from "../lib/funnel-analytics";

const homeSource = readFileSync(new URL("../app/HomePageClient.tsx", import.meta.url), "utf8");
const homePageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const walletPageSource = readFileSync(new URL("../app/wallet/[address]/page.tsx", import.meta.url), "utf8");
const walletContentSource = readFileSync(new URL("../components/WalletContent.tsx", import.meta.url), "utf8");
const summarySource = readFileSync(new URL("../components/PortfolioSummaryCard.tsx", import.meta.url), "utf8");
const orchestratorSource = readFileSync(new URL("../hooks/useScanOrchestrator.ts", import.meta.url), "utf8");

describe("One portfolio frontend funnel contracts", () => {
  test("home wraps campaign search params in a suspense boundary", () => {
    assert.match(homePageSource, /import\s*\{\s*Suspense\s*\}\s*from\s*["']react["']/);
    assert.match(homePageSource, /<Suspense[\s\S]*<HomePageClient\s[\s\S]*\/>[\s\S]*<\/Suspense>/);
  });

  test("home reads campaign, deduplicates the landing view, tracks scan start, and propagates campaign", () => {
    assert.match(homeSource, /useSearchParams/);
    assert.match(homeSource, /landingTrackedRef\.current/);
    assert.match(homeSource, /event:\s*["']campaign_landing_viewed["']/);
    assert.match(homeSource, /event:\s*["']scan_started["'][\s\S]*router\.push/);
    assert.match(homeSource, /campaign=\$\{campaign\}/);
  });

  test("landing view tracking covers every known campaign, not a single hard-coded one", () => {
    assert.doesNotMatch(homeSource, /campaign\s*!==\s*["']one_portfolio["']/);
    assert.match(homeSource, /campaign === "unknown"/);
  });

  test("wallet page passes campaign through to WalletContent and the orchestrator", () => {
    assert.match(walletPageSource, /campaign\?:\s*string/);
    assert.match(walletPageSource, /<WalletContent[\s\S]*campaign=/);
    assert.match(walletContentSource, /campaign:\s*FunnelCampaign/);
    assert.match(walletContentSource, /useScanOrchestrator\(\{[\s\S]*campaign/);
    assert.match(orchestratorSource, /campaign:\s*FunnelCampaign/);
  });

  test("portfolio controls and tabs emit allowlisted portfolio actions", () => {
    for (const action of ["add", "refresh", "export", "share"] as const) {
      assert.match(summarySource, new RegExp(`trackAction\\(["']${action}["']\\)`));
    }
    for (const action of ["tab_overview", "tab_wallets", "tab_tokens"] as const) {
      assert.match(walletContentSource, new RegExp(action));
    }
  });
});

describe("aggregated scan completion analytics", () => {
  test("emits a completed success for a clean aggregate", () => {
    assert.deepEqual(buildScanFinishedEvent({
      campaign: "one_portfolio",
      walletCount: 2,
      durationMs: 7_000,
      wallets: [{ chains: [{ chainKey: "BASE", degraded: false, errors: [], hasAssets: true }] }],
    }), {
      event: "scan_completed",
      campaign: "one_portfolio",
      surface: "wallet",
      variant: "control",
      dimensions: { walletCount: "2_3", chainCount: "1_5", duration: "5_15s", result: "success" },
    });
  });

  test("emits one completed partial when at least one chain succeeds and another degrades", () => {
    const event = buildScanFinishedEvent({
      campaign: "one_portfolio",
      walletCount: 1,
      durationMs: 20_000,
      wallets: [{ chains: [
        { chainKey: "BASE", degraded: false, errors: [], hasAssets: true },
        { chainKey: "ETHEREUM", degraded: true, errors: ["timeout"], hasAssets: false },
      ] }],
    });

    assert.equal(event.event, "scan_completed");
    assert.equal(event.dimensions.result, "partial");
  });

  test("emits one failed aggregate when no chain succeeds", () => {
    const event = buildScanFinishedEvent({
      campaign: "one_portfolio",
      walletCount: 1,
      durationMs: 70_000,
      wallets: [{ error: "scan_failed", chains: [{ chainKey: "BASE", degraded: true, errors: ["timeout"], hasAssets: false }] }],
    });

    assert.equal(event.event, "scan_failed");
    assert.equal(event.dimensions.result, "failed");
  });

  test("analytics failures cannot reject the scan action", async () => {
    const { trackFunnelEvent } = await import("../lib/funnel-analytics");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("offline"); };
    try {
      await assert.doesNotReject(trackFunnelEvent({
        event: "scan_started",
        campaign: "one_portfolio",
        surface: "home",
        variant: "control",
        dimensions: { walletCount: "1", chainCount: "1_5", authState: "anonymous", scanMode: "standard" },
      }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("serialization strips forbidden and unknown payload fields", () => {
    const payload = serializeFunnelEvent({
      event: "portfolio_action",
      campaign: "one_portfolio",
      surface: "wallet",
      variant: "control",
      dimensions: {
        action: "export",
        address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080",
        url: "/wallet/private",
        label: "Treasury",
        amount: 123,
        asset: "ETH",
      } as never,
    });

    assert.deepEqual(payload.events[0]?.dimensions, { action: "export" });
    assert.doesNotMatch(JSON.stringify(payload), /17d518|private|Treasury|123|ETH/);
  });
});
