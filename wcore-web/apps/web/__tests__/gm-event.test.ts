import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isGmDoneForChain } from "../components/gm-event";

describe("GM done events", () => {
  test("matches the chain from a Header on-chain GM event", () => {
    assert.equal(isGmDoneForChain({ chain: "abstract" }, "abstract"), true);
  });

  test("does not mark another chain as done", () => {
    assert.equal(isGmDoneForChain({ chain: "abstract" }, "base"), false);
  });
});
