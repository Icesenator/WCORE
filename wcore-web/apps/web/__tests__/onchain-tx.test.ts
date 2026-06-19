import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { switchChainAny, sendTransactionAny, type RawProvider } from "../lib/onchain-tx";

function mockProvider(handlers: Record<string, (params?: unknown) => Promise<unknown> | unknown>): {
  provider: RawProvider;
  calls: Array<{ method: string; params?: unknown }>;
} {
  const calls: Array<{ method: string; params?: unknown }> = [];
  const provider: RawProvider = {
    request: async ({ method, params }) => {
      calls.push({ method, params });
      const h = handlers[method];
      if (!h) throw new Error(`unexpected method ${method}`);
      return h(params);
    },
  };
  return { provider, calls };
}

describe("switchChainAny", () => {
  test("uses wagmi when a connector is connected", async () => {
    let wagmiCalled = 0;
    await switchChainAny(
      {
        wagmiConnected: true,
        wagmiSwitch: async (id) => { wagmiCalled = id; },
        rawProvider: undefined,
      },
      8453,
    );
    assert.equal(wagmiCalled, 8453);
  });

  test("falls back to raw wallet_switchEthereumChain with hex chainId", async () => {
    const { provider, calls } = mockProvider({
      wallet_switchEthereumChain: () => null,
    });
    await switchChainAny(
      { wagmiConnected: false, wagmiSwitch: async () => { throw new Error("should not be called"); }, rawProvider: provider },
      8453,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "wallet_switchEthereumChain");
    assert.deepEqual(calls[0]?.params, [{ chainId: "0x2105" }]);
  });

  test("throws when no provider and wagmi disconnected", async () => {
    await assert.rejects(
      () => switchChainAny(
        { wagmiConnected: false, wagmiSwitch: async () => undefined, rawProvider: undefined },
        1,
      ),
      /No wallet provider available/,
    );
  });
});

describe("sendTransactionAny", () => {
  const txParams = { to: "0xcontract", value: 1000n, data: "0xdeadbeef" };

  test("uses wagmi sender when connected", async () => {
    const hash = await sendTransactionAny(
      {
        wagmiConnected: true,
        wagmiSend: async () => "0xwagmihash",
        rawProvider: undefined,
        from: "0xwallet",
      },
      txParams,
    );
    assert.equal(hash, "0xwagmihash");
  });

  test("falls back to raw eth_sendTransaction with hex-encoded value", async () => {
    const { provider, calls } = mockProvider({
      eth_sendTransaction: () => "0xrawhash",
    });
    const hash = await sendTransactionAny(
      { wagmiConnected: false, wagmiSend: async () => { throw new Error("should not be called"); }, rawProvider: provider, from: "0xWALLET" },
      txParams,
    );
    assert.equal(hash, "0xrawhash");
    assert.equal(calls[0]?.method, "eth_sendTransaction");
    assert.deepEqual(calls[0]?.params, [
      { from: "0xWALLET", to: "0xcontract", value: "0x3e8", data: "0xdeadbeef" },
    ]);
  });

  test("throws when raw provider returns a non-hash", async () => {
    const { provider } = mockProvider({ eth_sendTransaction: () => null });
    await assert.rejects(
      () => sendTransactionAny(
        { wagmiConnected: false, wagmiSend: async () => "x", rawProvider: provider, from: "0xwallet" },
        txParams,
      ),
      /did not return a transaction hash/,
    );
  });

  test("throws when from address missing in raw path", async () => {
    const { provider } = mockProvider({ eth_sendTransaction: () => "0xhash" });
    await assert.rejects(
      () => sendTransactionAny(
        { wagmiConnected: false, wagmiSend: async () => "x", rawProvider: provider, from: null },
        txParams,
      ),
      /Wallet address unavailable/,
    );
  });
});
