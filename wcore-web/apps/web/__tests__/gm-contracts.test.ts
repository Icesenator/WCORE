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

  test("resolves Moonbeam factory after deployment", () => {
    assert.equal(getGmContractChainId("MOONBEAM"), 1284);
    assert.equal(getGmChainId("moonbeam"), 1284);
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
});
