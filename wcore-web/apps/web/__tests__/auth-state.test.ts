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
  // Regression guard for the "double Sign In" bug: a stale /api/auth/me from
  // page load fires wcore-auth-expired right after login completes. It must NOT
  // demote an authenticated session or an in-flight login.
  test("ignores expiry while a login is in flight", () => {
    assert.equal(shouldHandleAuthExpired("connecting"), false);
    assert.equal(shouldHandleAuthExpired("signing"), false);
    assert.equal(shouldHandleAuthExpired("verifying"), false);
  });

  test("ignores expiry once authenticated", () => {
    assert.equal(shouldHandleAuthExpired("authenticated"), false);
  });

  test("handles expiry from idle/ready/expired states", () => {
    assert.equal(shouldHandleAuthExpired("idle"), true);
    assert.equal(shouldHandleAuthExpired("ready"), true);
    assert.equal(shouldHandleAuthExpired("expired"), true);
  });
});
