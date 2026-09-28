import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveGmBalance } from "../lib/gm-withdraw-balance";

describe("GM withdraw balance selection", () => {
  test("a fresh server zero beats a stale non-zero cache", () => {
    // Regression (Arc 0x83c3…3978, 2026-09-28): the creator had already
    // withdrawn, so the server read 0, but the localStorage cache still held the
    // pre-withdrawal amount. That stale value won, the button stayed enabled and
    // every click reverted on `withdrawCreator` with "nothing to withdraw".
    assert.equal(
      resolveGmBalance({ backendBalance: "0", cachedBalance: "25501049588540668" }),
      "0",
    );
  });

  test("an authoritative wallet read wins over both server and cache", () => {
    assert.equal(
      resolveGmBalance({ walletBalance: "0", backendBalance: "100", cachedBalance: "200" }),
      "0",
    );
    assert.equal(
      resolveGmBalance({ walletBalance: "42", backendBalance: "0", cachedBalance: "0" }),
      "42",
    );
  });

  test("a positive server balance is used when there is no wallet read", () => {
    assert.equal(
      resolveGmBalance({ backendBalance: "176000000000000", cachedBalance: "1" }),
      "176000000000000",
    );
  });

  test("the cache is only a last resort before any read lands", () => {
    assert.equal(resolveGmBalance({ cachedBalance: "7" }), "7");
    assert.equal(resolveGmBalance({ backendBalance: "", cachedBalance: "" }), "0");
    assert.equal(resolveGmBalance({}), "0");
    assert.equal(resolveGmBalance({ backendBalance: "0" }), "0");
  });
});

describe("GM withdraw button wiring", () => {
  const buttonSource = readFileSync(new URL("../components/GmWithdrawButton.tsx", import.meta.url), "utf8");
  const storageSource = readFileSync(new URL("../lib/gm-storage.ts", import.meta.url), "utf8");

  test("the displayed balance goes through resolveGmBalance", () => {
    assert.match(buttonSource, /resolveGmBalance\(\{/,
      "GmWithdrawButton must select the displayed balance via resolveGmBalance so a confirmed zero is never overridden by the cache");
  });

  test("a confirmed zero clears the cached balance", () => {
    assert.match(buttonSource, /lsClearBalance\(/,
      "GmWithdrawButton must clear the cached balance after a withdrawal");
    assert.match(storageSource, /export function lsClearBalance\(/,
      "gm-storage must expose lsClearBalance to invalidate the cached balance");
  });

  test("withdrawal is guarded by a fresh on-chain read when the balance is unavailable", () => {
    assert.match(buttonSource, /if \(isBalanceUnavailable\) \{[\s\S]*?refreshBalanceViaMetaMask\(\)[\s\S]*?hasWithdrawableBalance\(refreshed\)[\s\S]*?return;/,
      "GmWithdrawButton must re-verify the balance on-chain before withdrawing when the label cannot be trusted");
  });
});
