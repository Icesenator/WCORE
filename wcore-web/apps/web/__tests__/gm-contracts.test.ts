import { describe, test } from "node:test";
import assert from "node:assert/strict";
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
});
