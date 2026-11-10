import test from "node:test";
import assert from "node:assert/strict";

// Elysium is Kinetiq's mainnet (99901). Two other networks share the name: Kinetiq's testnet
// (99801) and Vulcan Forged's Elysium (1339). An RPC answering either must never be used: a scan
// against the wrong network would report a wallet that does not exist there as an attested zero.
// Each case loads a fresh module instance, so the identity cache of one case cannot answer another.
async function verifiedFor(answer: number | Error): Promise<string[]> {
  const mod = (await import(`./endpoints.js?elysium=${answer instanceof Error ? "error" : answer}`)) as typeof import("./endpoints.js");
  const rpc = {
    async chainId() {
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
  return mod.getVerifiedEvmRpcEndpoints("ELYSIUM", { includeDynamic: false, useHealth: false, rpc: rpc as never });
}

test("the Kinetiq mainnet RPC (99901) is accepted", async () => {
  assert.deepEqual(await verifiedFor(99901), ["https://rpc.elysium.kinetiq.xyz"]);
});

for (const [name, id] of [["Kinetiq testnet", 99801], ["Vulcan Forged Elysium", 1339], ["Vulcan Forged testnet", 1338]] as const) {
  test(`an RPC answering ${id} (${name}) is rejected`, async () => {
    assert.deepEqual(await verifiedFor(id), []);
  });
}

test("an RPC whose chain ID cannot be read is rejected", async () => {
  assert.deepEqual(await verifiedFor(new Error("timeout")), []);
});
