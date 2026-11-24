import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getGmContractChainId } from "../hooks/useGmContracts";
import { getGmChainId } from "../hooks/useOnChainGm";

describe("GM contract helpers", () => {
  test("resolves factory chain IDs case-insensitively", () => {
    assert.equal(getGmContractChainId("base"), 8453);
    assert.equal(getGmContractChainId("BASE"), 8453);
    assert.equal(getGmContractChainId("  Base  "), 8453);
  });

  test("resolves uppercase random-contract chain keys from the API", () => {
    assert.equal(getGmChainId("BASE"), 8453);
  });

  test("resolves an active factory chain after deployment", () => {
    assert.equal(getGmContractChainId("CRONOS"), 25);
    assert.equal(getGmChainId("cronos"), 25);
  });

  test("keeps the chain ID needed to withdraw from retired DuckChain contracts", () => {
    assert.equal(getGmContractChainId("DUCKCHAIN"), 5545);
  });

  test("withdraw senders provide wallet_addEthereumChain fallback for unknown chains", () => {
    // Regression: clicking "Fees Earned" on Merlin (4200) did nothing because
    // useGmContracts built senders without lookupAddChain, so switchChainAny
    // threw on 4902 instead of adding the chain. See lib/onchain-tx.ts.
    const source = readFileSync(new URL("../hooks/useGmContracts.ts", import.meta.url), "utf8");
    assert.match(source, /lookupAddChain:/,
      "useGmContracts buildSenders must pass lookupAddChain so withdrawals can add missing chains");
  });

  test("a balance below the withdraw floor explains itself instead of doing nothing", () => {
    // Regression (B2, 24/11/2026): 7.5e-7 BTC is below MIN_WITHDRAW_WEI, so the click
    // refreshed the balance and returned silently. It must now show the reason.
    const source = readFileSync(new URL("../components/GmWithdrawButton.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(source, /!hasWithdrawableBalance\(refreshed\)\) return;/, "no silent return under the floor");
    assert.match(source, /Montant sous le minimum retirable/);
    assert.match(source, /Below the minimum withdrawable amount/);
  });
});
