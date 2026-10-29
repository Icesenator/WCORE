import { test } from "node:test";
import assert from "node:assert/strict";
import { isRetiredChain, filterActiveChainKeys } from "@wcore/shared";
import { mergeChainResults } from "../components/scan-results";
import { matchCompatibleChains } from "../lib/chain-filter";
import type { ChainScan } from "../../../packages/shared/src/scan-result";

const scan = (chainKey: string, valueEur: number) => ({ chainKey, totals: { valueEur } }) as ChainScan;

test("legacy selections discard only retired L2 aliases, preserving Ethereum and SUPR", () => {
  for (const key of ["SUPERSEED", " sseed ", "5330", "0x14d2"]) assert.equal(isRetiredChain(key), true);
  assert.deepEqual(filterActiveChainKeys(["SUPERSEED", "ETHEREUM", "SUPR", "NEW_CHAIN"]), ["ETHEREUM", "SUPR", "NEW_CHAIN"]);
  assert.deepEqual(matchCompatibleChains("EVM", ["SUPERSEED", "5330", "ETHEREUM", "SUPR"], {}), ["ETHEREUM", "SUPR"]);
});

test("retired cached and incoming results do not contribute to totals", () => {
  const result = mergeChainResults([scan("SUPERSEED", 100), scan("ETHEREUM", 20)], [scan("sseed", 200), scan("SUPR", 3)]);
  assert.deepEqual(result.chains.map(c => c.chainKey), ["ETHEREUM", "SUPR"]);
  assert.equal(result.totalEur, 23);
});
