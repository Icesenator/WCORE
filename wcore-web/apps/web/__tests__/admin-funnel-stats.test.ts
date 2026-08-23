import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { processFunnelEvents, formatFunnelRate } from "../lib/admin-funnel-stats";

describe("admin funnel stats", () => {
  test("aggregates event counts and computes rates", () => {
    const events = [
      { event: "campaign_landing_viewed", campaign: "one_portfolio", surface: "home", variant: "control", dimensionKey: "none", count: 10 },
      { event: "scan_started", campaign: "one_portfolio", surface: "home", variant: "control", dimensionKey: "walletCount=1|chainCount=1_5|authState=anonymous|scanMode=standard", count: 6 },
      { event: "scan_completed", campaign: "one_portfolio", surface: "wallet", variant: "control", dimensionKey: "result=success", count: 3 },
      { event: "scan_failed", campaign: "one_portfolio", surface: "wallet", variant: "control", dimensionKey: "result=failed", count: 1 },
      { event: "portfolio_action", campaign: "one_portfolio", surface: "wallet", variant: "control", dimensionKey: "action=add", count: 4 },
    ];
    const stats = processFunnelEvents(events);
    assert.equal(stats.landingEvents, 10);
    assert.equal(stats.scanStarts, 6);
    assert.equal(stats.scanOutcomes, 4);
    assert.equal(stats.startRate, 0.6);
    assert.equal(stats.outcomeRate, 4 / 6);
    assert.equal(stats.successRate, 0.75);
    assert.equal(stats.eventCounts.campaign_landing_viewed, 10);
    assert.equal(stats.eventCounts.scan_started, 6);
    assert.equal(stats.eventCounts.scan_completed, 3);
    assert.equal(stats.eventCounts.scan_failed, 1);
    assert.equal(stats.portfolioActions.add, 4);
  });

  test("returns null rates when denominator is zero", () => {
    const events = [
      { event: "campaign_landing_viewed", campaign: "one_portfolio", surface: "home", variant: "control", dimensionKey: "none", count: 0 },
    ];
    const stats = processFunnelEvents(events);
    assert.equal(stats.landingEvents, 0);
    assert.equal(stats.startRate, null);
    assert.equal(stats.outcomeRate, null);
    assert.equal(stats.successRate, null);
  });

  test("ignores other campaigns but keeps unknown dimensions", () => {
    const events = [
      { event: "campaign_landing_viewed", campaign: "other_campaign", surface: "home", variant: "control", dimensionKey: "none", count: 5 },
      { event: "scan_started", campaign: "one_portfolio", surface: "home", variant: "control", dimensionKey: "unknownDim=x", count: 2 },
    ];
    const stats = processFunnelEvents(events);
    assert.equal(stats.landingEvents, 0);
    assert.equal(stats.scanStarts, 2);
  });

  test("formats null rate as em dash", () => {
    assert.equal(formatFunnelRate(null), "—");
    assert.equal(formatFunnelRate(0.6), "60%");
    assert.equal(formatFunnelRate(0.755), "76%");
  });
});
