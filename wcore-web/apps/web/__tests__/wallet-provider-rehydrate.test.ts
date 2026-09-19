import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { findProviderForAddress, type DiscoveredWallet } from "../lib/wallet-provider-rehydrate";

function wallet(accounts: unknown): DiscoveredWallet & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    provider: {
      request: async ({ method }) => {
        calls.push(method);
        if (accounts instanceof Error) throw accounts;
        return accounts;
      },
    },
  };
}

describe("findProviderForAddress", () => {
  test("returns the provider that owns the address (case-insensitive)", async () => {
    const other = wallet(["0x00000000000000000000000000000000000000aa"]);
    const owner = wallet(["0xABCDEF0000000000000000000000000000000001"]);
    const found = await findProviderForAddress([other, owner], "0xabcdef0000000000000000000000000000000001");
    assert.equal(found, owner);
  });

  test("skips providers that return nothing or throw", async () => {
    const thrower = wallet(new Error("denied"));
    const empty = wallet([]);
    const owner = wallet(["0x1234"]);
    const found = await findProviderForAddress([thrower, empty, owner], "0x1234");
    assert.equal(found, owner);
    assert.deepEqual(thrower.calls, ["eth_accounts"]);
  });

  test("returns undefined for a missing address without probing", async () => {
    const w = wallet(["0x1"]);
    assert.equal(await findProviderForAddress([w], null), undefined);
    assert.equal(await findProviderForAddress([w], "   "), undefined);
    assert.deepEqual(w.calls, []);
  });

  test("returns undefined when no provider owns the address", async () => {
    const w = wallet(["0xdead"]);
    assert.equal(await findProviderForAddress([w], "0xbeef"), undefined);
  });

  test("ignores non-string account entries", async () => {
    const w = wallet([null, 42, { address: "0x1" }]);
    assert.equal(await findProviderForAddress([w], "0x1"), undefined);
  });
});
