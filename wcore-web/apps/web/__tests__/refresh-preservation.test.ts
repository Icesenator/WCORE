import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChainScan } from "@wcore/shared";
import { mergeChainRefreshResult, applyRefreshedChain } from "../hooks/useScanOrchestrator";
import { applyRefreshToLastKnown, chainCurrentValue, lastKnownKey, type LastKnownState } from "../lib/refresh-outcome";
import { portfolioOutputAvailability } from "../lib/share-card";
import { buildPortfolioCsv, hasFailedChains, withoutFailedChains } from "../lib/csv-export";

const A = "0x000000000000000000000000000000000000dEaD";
const B = "0x1111111111111111111111111111111111111111";

const known = (key = "BASE", value = 25): ChainScan => ({
  chainKey: key, chainName: key, vm: "EVM",
  native: null,
  tokens: [{ contract: "0x1", symbol: "USDC", name: "USD Coin", decimals: 6, balance: value, priceEur: 1, priceSource: "test", valueEur: value, flags: [] }],
  totals: { valueEur: value, tokenCount: 1, pricedCount: 1 },
  errors: [], degraded: false, fxRate: 0.92, scanMs: 10, cachedAt: null, scriptVersion: "test",
});

// Real API failure shape (buildChainScan): zero native placeholder, tokenCount 1, cachedAt null.
const apiFailure = (key = "BASE", message = "chain_timeout after 90000ms"): ChainScan => ({
  chainKey: key, chainName: key, vm: "EVM",
  native: { contract: "native", symbol: "NATIVE", name: "NATIVE", decimals: 18, balance: 0, priceEur: null, priceSource: null, valueEur: null, flags: [] },
  tokens: [], totals: { valueEur: 0, tokenCount: 1, pricedCount: 0 },
  errors: [{ stage: "scan", message }], degraded: true, fxRate: 0.92, scanMs: 0, cachedAt: null, scriptVersion: "test",
});

const confirmedZero = (key = "BASE", errors: ChainScan["errors"] = []): ChainScan => ({
  ...apiFailure(key), errors, degraded: errors.length > 0,
});

const partialWithAssets = (key = "BASE"): ChainScan => ({
  ...known(key, 7), errors: [{ stage: "scan", message: "balances HTTP 503" }], degraded: true,
});

describe("refresh failure never becomes a current zero nor a fresh old value", () => {
  for (const message of ["chain_timeout after 90000ms", "native balance failed on all 3 RPCs", "fetch failed", "unexpected upstream failure"]) {
    test(`API-shaped failure '${message}' keeps old assets out of the current result`, () => {
      const merged = mergeChainRefreshResult([known()], "BASE", "EVM", apiFailure("BASE", message));
      assert.equal(merged.totalEur, 0, "old value must not feed the current total");
      assert.equal(merged.chains[0]?.tokens.length, 0, "old tokens must not be mixed into the current result");
      assert.equal(chainCurrentValue(merged.chains[0]!), null, "current value is unknown, not zero");
      assert.equal(merged.lastKnown?.tokens[0]?.symbol, "USDC");
      assert.match(merged.failure ?? "", new RegExp(message.split(" ")[0]!));
    });
  }

  test("missing response keeps old assets out of the current result", () => {
    const merged = mergeChainRefreshResult([known()], "BASE", "EVM", undefined, "batch_scan_failed");
    assert.equal(merged.totalEur, 0);
    assert.equal(chainCurrentValue(merged.chains[0]!), null);
    assert.equal(merged.lastKnown?.totals.valueEur, 25);
    assert.match(merged.failure ?? "", /batch_scan_failed/);
  });

  test("a confirmed zero replaces the old value and keeps no last-known copy", () => {
    const merged = mergeChainRefreshResult([known()], "BASE", "EVM", confirmedZero());
    assert.equal(merged.totalEur, 0);
    assert.equal(chainCurrentValue(merged.chains[0]!), 0);
    assert.equal(merged.lastKnown, undefined);
    assert.equal(merged.failure, undefined);
  });

  test("a zero with only a benign NO_PRICE error is confirmed, not a failure", () => {
    const merged = mergeChainRefreshResult([known()], "BASE", "EVM", confirmedZero("BASE", [{ stage: "pricing", message: "native price: NO_PRICE" }]));
    assert.equal(chainCurrentValue(merged.chains[0]!), 0);
    assert.equal(merged.lastKnown, undefined);
  });

  test("a partial result with valid assets stays current and is not mixed with old assets", () => {
    const merged = mergeChainRefreshResult([known()], "BASE", "EVM", partialWithAssets());
    assert.equal(merged.totalEur, 7);
    assert.equal(merged.chains.length, 1);
    assert.equal(merged.lastKnown, undefined);
  });

  test("no previous reliable value: failure stays unknown and nothing is invented", () => {
    const merged = mergeChainRefreshResult([], "BASE", "EVM", apiFailure());
    assert.equal(chainCurrentValue(merged.chains[0]!), null);
    assert.equal(merged.lastKnown, undefined);
    const again = mergeChainRefreshResult(merged.chains, "BASE", "EVM", apiFailure());
    assert.equal(again.lastKnown, undefined, "a previous failure is never promoted to last known");
  });

  test("current output guards see the failed chain: share blocked, CSV partial without old value", () => {
    const merged = mergeChainRefreshResult([known("BASE", 1200), known("ETHEREUM", 40)], "BASE", "EVM", apiFailure());
    const rows = [{ address: A, label: "", totalEur: merged.totalEur, chains: merged.chains }];
    const out = portfolioOutputAvailability({ scanComplete: true, chains: merged.chains });
    assert.equal(out.share, false);
    assert.equal(out.partial, true);
    assert.equal(hasFailedChains(rows), true);
    const csv = buildPortfolioCsv(withoutFailedChains(rows));
    assert.doesNotMatch(csv, /,BASE,/);
    assert.doesNotMatch(csv, /1200/);
    assert.match(csv, /,ETHEREUM,/);
    assert.equal(merged.totalEur, 40);
  });
});

describe("documented counter-example: a stale marker never passes as fresh", () => {
  const staleKept: ChainScan = {
    ...known("BASE", 1200),
    errors: [{ stage: "scan", message: "chain_timeout after 90000ms" }, { stage: "scan", message: "stale_refresh_failed: chain_timeout after 90000ms" }],
    degraded: true,
    cachedAt: "2026-10-27T00:00:00.000Z",
  };

  test("share blocked, export partial, stale rows excluded, value unknown", () => {
    const rows = [{ address: A, label: "", totalEur: 1200, chains: [staleKept, known("ETHEREUM", 40)] }];
    const out = portfolioOutputAvailability({ scanComplete: true, chains: rows[0]!.chains });
    assert.equal(out.share, false);
    assert.equal(out.partial, true);
    assert.equal(hasFailedChains(rows), true);
    assert.doesNotMatch(buildPortfolioCsv(withoutFailedChains(rows)), /1200/);
    assert.equal(chainCurrentValue(staleKept), null);
  });
});

describe("last-known registry is separate, keyed by wallet and chain, and explicitly stale", () => {
  const T1 = "2026-10-28T10:00:00.000Z";
  const T2 = "2026-10-28T10:05:00.000Z";

  test("success records an observation, a later failure exposes stale_refresh_failed with that browser time", () => {
    let state: LastKnownState = { entries: {}, observedAt: {} };
    state = applyRefreshToLastKnown(state, A, "BASE", mergeChainRefreshResult([], "BASE", "EVM", known()), T1);
    assert.deepEqual(state.entries, {});
    state = applyRefreshToLastKnown(state, A, "BASE", mergeChainRefreshResult([known()], "BASE", "EVM", apiFailure()), T2);
    const entry = state.entries[lastKnownKey(A, "BASE")];
    assert.equal(entry?.status, "stale_refresh_failed");
    assert.equal(entry?.provenance, "browser_session_previous_result");
    assert.equal(entry?.observedAt, T1, "observation time is the earlier browser receipt, never the failure time");
    assert.equal(entry?.chain.totals.valueEur, 25);
  });

  test("unknown observation time stays null instead of a fabricated date", () => {
    const state = applyRefreshToLastKnown({ entries: {}, observedAt: {} }, A, "BASE", mergeChainRefreshResult([known()], "BASE", "EVM", apiFailure()), T2);
    assert.equal(state.entries[lastKnownKey(A, "BASE")]?.observedAt, null);
  });

  test("a later success or confirmed zero clears the stale entry", () => {
    let state = applyRefreshToLastKnown({ entries: {}, observedAt: {} }, A, "BASE", mergeChainRefreshResult([known()], "BASE", "EVM", apiFailure()), T1);
    state = applyRefreshToLastKnown(state, A, "BASE", mergeChainRefreshResult([apiFailure()], "BASE", "EVM", confirmedZero()), T2);
    assert.equal(state.entries[lastKnownKey(A, "BASE")], undefined);
    assert.equal(state.observedAt[lastKnownKey(A, "BASE")], T2);
  });

  test("a repeated failure keeps the original stale entry", () => {
    let state = applyRefreshToLastKnown({ entries: {}, observedAt: {} }, A, "BASE", mergeChainRefreshResult([known()], "BASE", "EVM", apiFailure()), T1);
    state = applyRefreshToLastKnown(state, A, "BASE", mergeChainRefreshResult([apiFailure()], "BASE", "EVM", apiFailure()), T2);
    assert.equal(state.entries[lastKnownKey(A, "BASE")]?.chain.totals.valueEur, 25);
  });

  test("entries of wallets that are no longer scanned are purged (review W4)", async () => {
    const { pruneLastKnown } = await import("../lib/refresh-outcome");
    let state = applyRefreshToLastKnown({ entries: {}, observedAt: {} }, A, "BASE", mergeChainRefreshResult([known()], "BASE", "EVM", apiFailure()), T1);
    state = applyRefreshToLastKnown(state, B, "BASE", mergeChainRefreshResult([known()], "BASE", "EVM", apiFailure()), T1);
    const pruned = pruneLastKnown(state, [B.toUpperCase()]);
    assert.deepEqual(Object.keys(pruned.entries), [lastKnownKey(B, "BASE")]);
    const hook = readFileSync(new URL("../hooks/useScanOrchestrator.ts", import.meta.url), "utf8");
    assert.match(hook, /pruneLastKnown\(lastKnownRef\.current, validEnabledAddresses\)/);
  });

  test("wallets and chains never share entries, whatever the arrival order", () => {
    const events: Array<[string, string, ReturnType<typeof mergeChainRefreshResult>]> = [
      [B, "BASE", mergeChainRefreshResult([known("BASE", 9)], "BASE", "EVM", known("BASE", 9))],
      [A, "BASE", mergeChainRefreshResult([known("BASE", 25)], "BASE", "EVM", apiFailure())],
      [A, "ETHEREUM", mergeChainRefreshResult([known("ETHEREUM", 3)], "ETHEREUM", "EVM", known("ETHEREUM", 3))],
    ];
    for (const order of [events, [...events].reverse()]) {
      let state: LastKnownState = { entries: {}, observedAt: {} };
      for (const [addr, chain, merged] of order) state = applyRefreshToLastKnown(state, addr, chain, merged, T1);
      assert.deepEqual(Object.keys(state.entries), [lastKnownKey(A, "BASE")]);
      assert.equal(state.entries[lastKnownKey(A, "BASE")]?.chain.totals.valueEur, 25);
      assert.equal(state.entries[lastKnownKey(B, "BASE")], undefined);
    }
  });
});

describe("display keeps stale values visibly separate", () => {
  test("last-known notice says not current, excluded from totals, with known or Unknown observation time", async () => {
    const mod = await import("../components/LastKnownChainNotice").catch(() => null);
    assert.ok(mod, "LastKnownChainNotice exists");
    const entry = { status: "stale_refresh_failed" as const, provenance: "browser_session_previous_result" as const, chain: known(), observedAt: "2026-10-28T10:00:00.000Z", failure: "chain_timeout" };
    const html = renderToStaticMarkup(createElement(mod.LastKnownChainNotice, { entry, formatValue: (n: number) => `EUR ${n}` }));
    assert.match(html, /data-testid="last-known-chain"/);
    assert.match(html, /Last known value/);
    assert.match(html, /not current/i);
    assert.match(html, /EUR 25/);
    assert.match(html, /not included in totals, share or export/);
    assert.match(html, /2026-10-28 10:00 UTC/);
    const unknownHtml = renderToStaticMarkup(createElement(mod.LastKnownChainNotice, { entry: { ...entry, observedAt: null }, formatValue: (n: number) => `EUR ${n}` }));
    assert.match(unknownHtml, /Observed: Unknown/);
  });

  test("chain card shows Unknown instead of a zero for failed chains and hides the placeholder native row", () => {
    const card = readFileSync(new URL("../components/ChainCard.tsx", import.meta.url), "utf8");
    assert.match(card, /const currentValue = chainCurrentValue\(chain\);/);
    assert.match(card, /currentValue === null \?/);
    assert.match(card, />Unknown</);
    assert.match(card, /native=\{currentValue === null \? null : chain\.native\}/);
    assert.match(card, /<LastKnownChainNotice entry=\{lastKnown\}/);
  });

  test("Unknown takes precedence over the timeout/circuit value icons (QA F-STALE-TIMEOUT-CARD-NOT-UNKNOWN)", () => {
    const card = readFileSync(new URL("../components/ChainCard.tsx", import.meta.url), "utf8");
    const unknownAt = card.indexOf("currentValue === null ? (");
    const timeoutValueAt = card.indexOf("isTimedOut ? (\n            <p");
    assert.ok(unknownAt > 0 && timeoutValueAt > 0, "both value branches exist");
    assert.ok(unknownAt < timeoutValueAt, "the Unknown value branch must be evaluated before the timeout icon");
  });

  test("last-known notice is shown only while the current value is unknown (review W2)", () => {
    const card = readFileSync(new URL("../components/ChainCard.tsx", import.meta.url), "utf8");
    assert.match(card, /\{lastKnown && currentValue === null \? <LastKnownChainNotice/);
  });

  test("wallet view never lists failed chains among the confirmed zero chains and wires the separate registry", () => {
    const wc = readFileSync(new URL("../components/WalletContent.tsx", import.meta.url), "utf8");
    assert.match(wc, /c\.totals\.valueEur !== 0 \|\| isFailedChain\(c\)/);
    assert.match(wc, /c\.totals\.valueEur === 0 && !isFailedChain\(c\)/);
    assert.match(wc, /lastKnown=\{scanOrch\.lastKnownChains\[lastKnownKey\(wallet\.address, chain\.chainKey\)\] \?\? null\}/);
    assert.match(wc, /scanOrch\.applyChainRefresh\(wallet\.address, chainKey, d\.chains\[0\], d\.error\)/);
  });

  test("hook records every refresh path in the separate registry", () => {
    const hook = readFileSync(new URL("../hooks/useScanOrchestrator.ts", import.meta.url), "utf8");
    assert.equal((hook.match(/recordRefresh\(/g) ?? []).length >= 3, true);
    assert.match(hook, /lastKnownChains,/);
    assert.match(hook, /applyChainRefresh,/);
  });
});
describe("identity and missing-chain handling (review follow-ups)", () => {
  test("a lower-case VM is still recognised as the same chain", () => {
    // A refresh that still returned assets (even with an error) is a current result, not a failure:
    // the previous value is replaced and there is no last-known copy.
    const outcome = mergeChainRefreshResult([known()], "BASE", "EVM", { ...known(), vm: "evm" as ChainScan["vm"], errors: [{ stage: "scan", message: "balances HTTP 503" }] });
    assert.equal(outcome.chains.length, 1);
    assert.equal(outcome.chains[0]?.vm, "evm");
    assert.equal(outcome.failure, undefined);
    assert.equal(outcome.lastKnown, undefined);
  });

  test("a chain absent from the outcome is shown as Unknown, not as the stale value", () => {
    const outcome = mergeChainRefreshResult([known("BASE"), known("ETHEREUM")], "BASE", "EVM", undefined, "batch_scan_failed");
    const wallet = { address: A, label: "", chains: [known("BASE"), known("ETHEREUM")], totalEur: 50 };
    const updated = applyRefreshedChain(wallet, "BASE", outcome);
    const base = updated.chains.find(c => c.chainKey === "BASE")!;
    assert.equal(base.errors.some(e => e.message === "batch_scan_failed"), true);
    assert.equal(base.totals.valueEur, 0);
    assert.equal(updated.totalEur, 25, "the other fresh chain is kept");
  });

  test("a mismatched identity is rejected and the previous value of the requested chain is kept as last known", () => {
    const outcome = mergeChainRefreshResult([known("BASE", 12)], "BASE", "EVM", { ...known("ETHEREUM"), errors: [{ stage: "scan", message: "chain_timeout" }] });
    assert.equal(outcome.failure, "refresh_identity_mismatch");
    assert.equal(outcome.lastKnown?.chainKey, "BASE");
    assert.equal(outcome.lastKnown?.totals.valueEur, 12);
  });
});