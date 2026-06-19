import test from "node:test";
import assert from "node:assert/strict";
import { switchWalletChain, type WalletRequest } from "./chain-switch";
import type { AddEthereumChainParams } from "./chain-params";

function makeEthereum(calls: { method: string; params: unknown[] }[], responses: Array<unknown | { code: number; message: string }>): WalletRequest {
  return {
    request: async (args: { method: string; params?: unknown[] }) => {
      calls.push({ method: args.method, params: args.params ?? [] });
      const r = responses.shift();
      if (r && typeof r === "object" && "code" in r) throw r;
      return r;
    },
  };
}

const KCC_PARAMS: AddEthereumChainParams = {
  chainId: "0x141",
  chainName: "KCC",
  nativeCurrency: { name: "KuCoin Token", symbol: "KCS", decimals: 18 },
  rpcUrls: ["https://rpc-mainnet.kcc.network"],
};

const lookupKcc = (id: number) => (id === 321 ? KCC_PARAMS : null);
const lookupNull = () => null;

test("switchWalletChain: chain known to wallet — no fallback to add", async () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const eth = makeEthereum(calls, [null]);
  await switchWalletChain(eth, "0x141", lookupKcc);
  assert.equal(calls.length, 1, "should only call switchEthereumChain once");
  assert.equal(calls[0]?.method, "wallet_switchEthereumChain");
  assert.deepEqual(calls[0]?.params, [{ chainId: "0x141" }]);
});

test("switchWalletChain: 4902 → adds the chain, no retry of switch", async () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const eth = makeEthereum(calls, [
    { code: 4902, message: "Unrecognized chain ID" }, // switch fails
    null, // add succeeds
  ]);
  await switchWalletChain(eth, "0x141", lookupKcc);
  // CRITICAL: no second wallet_switchEthereumChain after add.
  // MetaMask selects the new chain via wallet_addEthereumChain;
  // retrying switch causes 4902 race condition and surfaces the error to the user.
  assert.equal(calls.length, 2, "should call switch ONCE, then add, NO retry");
  assert.equal(calls[0]?.method, "wallet_switchEthereumChain");
  assert.equal(calls[1]?.method, "wallet_addEthereumChain");
  assert.deepEqual(calls[1]?.params, [KCC_PARAMS]);
});

test("switchWalletChain: 4902 but chain not in our list — throws clear error", async () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const eth = makeEthereum(calls, [{ code: 4902, message: "Unrecognized chain ID" }]);
  await assert.rejects(
    () => switchWalletChain(eth, "0x999999", lookupNull),
    /Chain 0x999999 is not in the WCORE deploy chain list/
  );
  assert.equal(calls.length, 1, "switch attempted once, no add attempted");
});

test("switchWalletChain: user rejected switch (4001) — propagates, no add", async () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const eth = makeEthereum(calls, [{ code: 4001, message: "User rejected" }]);
  await assert.rejects(
    () => switchWalletChain(eth, "0x141", lookupKcc),
    { code: 4001 }
  );
  assert.equal(calls.length, 1, "switch attempted, no add attempted");
});

test("switchWalletChain: no window.ethereum — returns silently", async () => {
  await switchWalletChain(undefined, "0x141", lookupKcc);
  // No throw
});

test("switchWalletChain: error code is a string '4902' — still adds chain", async () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const eth = makeEthereum(calls, [
    { code: "4902", message: "Unrecognized chain ID" }, // string code (some wallets)
    null, // add succeeds
  ]);
  await switchWalletChain(eth, "0x141", lookupKcc);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.method, "wallet_switchEthereumChain");
  assert.equal(calls[1]?.method, "wallet_addEthereumChain");
});

test("switchWalletChain: error code nested at data.originalError.code — still adds", async () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const eth = makeEthereum(calls, [
    { code: -32603, message: "Internal error", data: { originalError: { code: 4902, message: "Unrecognized chain ID" } } },
    null,
  ]);
  await switchWalletChain(eth, "0x141", lookupKcc);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.method, "wallet_addEthereumChain");
});

test("switchWalletChain: unknown error code (not 4001, not 4902) — tries add as fallback", async () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const eth = makeEthereum(calls, [
    { code: -32000, message: "Unknown error from wallet" },
    null, // add succeeds
  ]);
  await switchWalletChain(eth, "0x141", lookupKcc);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.method, "wallet_addEthereumChain");
});

test("switchWalletChain: unknown error code + add fails — re-throws original", async () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const eth = makeEthereum(calls, [
    { code: -32000, message: "Unknown error from wallet" },
    { code: -32000, message: "Add failed too" },
  ]);
  await assert.rejects(
    () => switchWalletChain(eth, "0x141", lookupKcc),
    { code: -32000, message: "Unknown error from wallet" }
  );
});
