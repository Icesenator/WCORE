import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roundTotalForShare, buildShareCardUrl } from "../lib/share-card";
import { serializeFunnelEvent } from "../lib/funnel-analytics";

const summarySource = readFileSync(new URL("../components/PortfolioSummaryCard.tsx", import.meta.url), "utf8");
const walletContentSource = readFileSync(new URL("../components/WalletContent.tsx", import.meta.url), "utf8");

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
