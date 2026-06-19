import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { matchCompatibleChains } from "../lib/chain-filter";

describe("matchCompatibleChains", () => {
  test("filters disabled chains from URL-provided chain lists", () => {
    const matched = matchCompatibleChains("EVM", ["ETHEREUM", "POLYNOMIAL", "TON"], {
      ETHEREUM: { vm: "EVM", disabled: false },
      POLYNOMIAL: { vm: "EVM", disabled: true },
      TON: { vm: "TON", disabled: false },
    });

    assert.deepEqual(matched, ["ETHEREUM"]);
  });

  test("keeps unknown chains as a safe fallback", () => {
    const matched = matchCompatibleChains("EVM", ["NEW_CHAIN"], {});

    assert.deepEqual(matched, ["NEW_CHAIN"]);
  });
});
