import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketChainCount,
  bucketDuration,
  bucketWalletCount,
  normalizeCampaign,
  serializeFunnelEvent,
  trackFunnelEvent,
} from "../lib/funnel-analytics";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("privacy-first funnel analytics", () => {
  test("normalizes campaign and buckets dimensions", () => {
    assert.equal(normalizeCampaign("one_portfolio"), "one_portfolio");
    assert.equal(normalizeCampaign("raw-utm-value"), "unknown");
    assert.equal(bucketWalletCount(1), "1");
    assert.equal(bucketWalletCount(3), "2_3");
    assert.equal(bucketWalletCount(9), "4_plus");
    assert.equal(bucketChainCount(5), "1_5");
    assert.equal(bucketChainCount(20), "6_20");
    assert.equal(bucketChainCount(50), "21_50");
    assert.equal(bucketChainCount(80), "51_plus");
    assert.equal(bucketDuration(4_999), "lt_5s");
    assert.equal(bucketDuration(15_000), "15_60s");
    assert.equal(bucketDuration(80_000), "60s_plus");
  });

  test("serializes only allowlisted dimensions", () => {
    const payload = serializeFunnelEvent({
      event: "scan_started",
      campaign: "one_portfolio",
      surface: "home",
      variant: "control",
      dimensions: {
        walletCount: "2_3",
        chainCount: "6_20",
        authState: "anonymous",
        scanMode: "standard",
      },
    });
    const serialized = JSON.stringify(payload);

    assert.deepEqual(payload, {
      events: [{
        event: "scan_started",
        campaign: "one_portfolio",
        surface: "home",
        variant: "control",
        dimensions: {
          walletCount: "2_3",
          chainCount: "6_20",
          authState: "anonymous",
          scanMode: "standard",
        },
      }],
    });
    assert.doesNotMatch(serialized, /0x[a-f0-9]{40}|walletAddress|pathname|amount/i);
  });

  test("sends analytics best-effort without throwing", async () => {
    const bodies: unknown[] = [];
    globalThis.fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      throw new Error("analytics offline");
    };

    await assert.doesNotReject(trackFunnelEvent({
      event: "campaign_landing_viewed",
      campaign: "one_portfolio",
      surface: "home",
      variant: "control",
      dimensions: {},
    }));
    assert.equal(bodies.length, 1);
  });
});
