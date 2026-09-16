import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveHasDeployed } from "../lib/gm-deploy-status";

// WC-09 — behavioral coverage of the GM "has deployed" decision.
//
// The invariant under test: a GM deploy-status check that could not be trusted must
// resolve to UNKNOWN (null), never to "not deployed" (false). Otherwise the UI offers a
// Deploy button to a user who already has a contract on that chain.
describe("GM has-deployed decision (failure is UNKNOWN, never absent)", () => {
  test("no chain key → unknown", () => {
    assert.equal(resolveHasDeployed({ chainPresent: false, lsDeployed: false, ok: true }), null);
  });

  test("localStorage proof wins without any network call", () => {
    assert.equal(resolveHasDeployed({ chainPresent: true, lsDeployed: true, ok: false }), true);
  });

  test("trustworthy positive response → deployed", () => {
    assert.equal(resolveHasDeployed({ chainPresent: true, lsDeployed: false, ok: true, hasDeployed: true }), true);
  });

  test("trustworthy negative response → definitively not deployed", () => {
    assert.equal(resolveHasDeployed({ chainPresent: true, lsDeployed: false, ok: true, hasDeployed: false }), false);
  });

  test("trustworthy response missing the field → not deployed", () => {
    assert.equal(resolveHasDeployed({ chainPresent: true, lsDeployed: false, ok: true }), false);
  });

  test("failed request → unknown, NOT 'not deployed'", () => {
    assert.equal(resolveHasDeployed({ chainPresent: true, lsDeployed: false, ok: false, hasDeployed: false }), null);
  });

  test("failed request never trusts a stray positive body", () => {
    assert.equal(resolveHasDeployed({ chainPresent: true, lsDeployed: false, ok: false, hasDeployed: true }), null);
  });
});
