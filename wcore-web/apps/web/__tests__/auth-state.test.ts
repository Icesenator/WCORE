import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveRehydratedAuth, shouldHandleAuthExpired } from "../lib/auth-state";

describe("resolveRehydratedAuth", () => {
  test("keeps stored wallet address on auth 401", () => {
    const state = resolveRehydratedAuth("0xABCDEF0000000000000000000000000000000001", 401, false);

    assert.deepEqual(state, {
      address: "0xabcdef0000000000000000000000000000000001",
      authStep: "ready",
      clearStoredAddress: false,
    });
  });

  test("uses verified API address when authenticated", () => {
    const state = resolveRehydratedAuth("0xabc", 200, true, "0xDEF");

    assert.equal(state.address, "0xdef");
    assert.equal(state.authStep, "authenticated");
  });
});

describe("shouldHandleAuthExpired", () => {
  test("ignores expiry from a stale auth generation", () => {
    assert.equal(shouldHandleAuthExpired(1, 2), false);
  });

  test("handles definitive expiry for the current authenticated generation", () => {
    assert.equal(shouldHandleAuthExpired(2, 2), true);
  });
});
