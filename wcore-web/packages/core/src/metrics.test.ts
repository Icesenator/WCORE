import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MetricsStore } from "./metrics.js";

describe("MetricsStore", () => {
  test("separe les totaux de scan des echantillons d'erreur", () => {
    const store = new MetricsStore();
    store.recordScan("DEGEN", 100, 1, 0, 3, 0, 0, true);
    store.recordRpcError("DEGEN", "first RPC failure");
    store.recordRpcError("DEGEN", "second RPC failure");
    store.recordRpcError("DEGEN", "third RPC failure");

    const snapshot = store.snapshot();
    assert.equal(snapshot.scans.byChain.DEGEN?.rpcErrors, 3);
    assert.equal(snapshot.scans.byChain.DEGEN?.unreachableScans, 1);
    assert.equal(snapshot.errors.byChain.DEGEN?.rpc, 3);
    assert.equal(snapshot.errors.rpcTotal, 3);
  });
});
