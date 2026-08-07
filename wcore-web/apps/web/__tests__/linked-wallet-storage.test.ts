import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { linkedWalletStorageKey, readLinkedWallets, writeLinkedWallets } from "../lib/linked-wallet-storage";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("linked wallet storage isolation", () => {
  test("namespaces wallets by normalized authenticated owner", () => {
    assert.equal(linkedWalletStorageKey(" 0xAbC "), "wcore_linked:0xabc");
  });

  test("does not merge owner A wallets into owner B or an anonymous session", () => {
    const storage = memoryStorage();
    writeLinkedWallets(storage, "0xA", [{ address: "0xlinkedA", label: "A wallet" }]);
    writeLinkedWallets(storage, "0xB", [{ address: "0xlinkedB", label: "B wallet" }]);

    assert.deepEqual(readLinkedWallets(storage, "0xA"), [{ address: "0xlinkedA", label: "A wallet" }]);
    assert.deepEqual(readLinkedWallets(storage, "0xB"), [{ address: "0xlinkedB", label: "B wallet" }]);
    assert.deepEqual(readLinkedWallets(storage, null), []);
  });
});
