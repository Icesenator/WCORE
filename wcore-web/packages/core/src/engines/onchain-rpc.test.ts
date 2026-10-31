import { test } from "node:test";
import assert from "node:assert/strict";
import { createOnchainBatchRpc } from "./onchain-rpc.js";

const A = "https://a.example-provider.test/k";
const B = "https://b.example-provider.test/k";
const CALLS = [{ to: "0x01", data: "0xaa" }, { to: "0x02", data: "0xbb" }];

function fakeRpc(answers: Record<string, Array<string | null> | Error>) {
  return {
    batch: async (endpoint: string, calls: unknown[]) => {
      const a = answers[endpoint];
      if (a instanceof Error) throw a;
      return (a ?? []).slice(0, calls.length).map((result) => (result == null ? { error: { code: -32000 } } : { result }));
    },
  } as never;
}

test("prix onchain, quorum strict : un seul fournisseur répondant ne fournit aucun résultat", async () => {
  const rpc = fakeRpc({ [A]: ["0x10", "0x20"], [B]: new Error("down") });
  const batch = createOnchainBatchRpc({ chainKey: "B3", endpoints: [A, B], rpc, strict: true });
  assert.deepEqual(await batch.batch(CALLS), [null, null]);
});

test("prix onchain, quorum strict : seuls les résultats concordants sont retenus", async () => {
  const rpc = fakeRpc({ [A]: ["0x10", "0x20"], [B]: ["0x10", "0x99"] });
  const batch = createOnchainBatchRpc({ chainKey: "B3", endpoints: [A, B], rpc, strict: true });
  assert.deepEqual(await batch.batch(CALLS), ["0x10", null]);
});

test("prix onchain, mode historique : le premier fournisseur qui répond suffit", async () => {
  const rpc = fakeRpc({ [A]: new Error("down"), [B]: ["0x10", "0x20"] });
  const batch = createOnchainBatchRpc({ chainKey: "BASE", endpoints: [A, B], rpc, strict: false });
  assert.deepEqual(await batch.batch(CALLS), ["0x10", "0x20"]);
});
