import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getTodayGmStatus } from "../components/gm-status";

function storage(values: Record<string, string | null>) {
  return {
    getItem(key: string) {
      return values[key] ?? null;
    },
  };
}

describe("GM local status", () => {
  test("marks Header on-chain as done from ChainCard localStorage state", () => {
    const status = getTodayGmStatus(storage({
      wc_gm_date: "2026-05-08",
      wc_gm_onchain_date: "2026-05-08",
      wc_gm_onchain_chain: "base",
    }), "2026-05-08");

    assert.equal(status.alreadyOffChain, true);
    assert.equal(status.alreadyOnChain, true);
  });

  test("does not carry yesterday's on-chain GM into today", () => {
    const status = getTodayGmStatus(storage({
      wc_gm_date: "2026-05-07",
      wc_gm_onchain_date: "2026-05-07",
    }), "2026-05-08");

    assert.equal(status.alreadyOffChain, false);
    assert.equal(status.alreadyOnChain, false);
  });
});
