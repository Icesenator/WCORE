import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalChainKey, getFactory, getFactoryAddress } from "@wcore/shared";

test("canonicalChainKey upcases and trims to the DB-canonical form", () => {
  assert.equal(canonicalChainKey("base"), "BASE");
  assert.equal(canonicalChainKey("  arbitrum_one "), "ARBITRUM_ONE");
  assert.equal(canonicalChainKey("BASE"), "BASE");
});

test("getFactory / getFactoryAddress resolve case-insensitively", () => {
  const lower = getFactory("base");
  assert.ok(lower, "lowercase 'base' must resolve");
  assert.deepEqual(getFactory("BASE"), lower);
  assert.deepEqual(getFactory("  Base  "), lower);
  assert.equal(getFactoryAddress("BASE"), getFactoryAddress("base"));
  assert.equal(getFactory("not_a_chain"), undefined);
});
