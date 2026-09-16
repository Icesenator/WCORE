import assert from "node:assert/strict";
import { test } from "node:test";

import type { MulticallCall, MulticallResult } from "@wcore/core";
import { createRpcContractVerifier } from "./rpc-verifier.js";

const WALLET = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";

function word(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}
function endpoints(): string[] {
  return ["https://rpc.invalid.test"];
}
function verifierFor(results: MulticallResult[] | (() => Promise<MulticallResult[]>)) {
  const multicallFn = async (_e: string[], _c: MulticallCall[]): Promise<MulticallResult[]> =>
    typeof results === "function" ? await results() : results;
  return createRpcContractVerifier({ endpointsFor: endpoints, multicallFn });
}

test("unknown chain => UNVERIFIED (null)", async () => {
  const v = verifierFor([{ success: true, returnData: word(1n) }, { success: true, returnData: word(18n) }]);
  assert.equal(await v({ chain: "NOT_A_REAL_CHAIN_XYZ", address: WALLET, contract: TOKEN }), null);
});

test("non-EVM chain => UNVERIFIED (null)", async () => {
  const v = verifierFor([{ success: true, returnData: word(1n) }, { success: true, returnData: word(18n) }]);
  assert.equal(await v({ chain: "SOLANA", address: WALLET, contract: TOKEN }), null);
});

test("malformed contract => UNVERIFIED (null)", async () => {
  const v = verifierFor([{ success: true, returnData: word(1n) }, { success: true, returnData: word(18n) }]);
  assert.equal(await v({ chain: "ETHEREUM", address: WALLET, contract: "0xnothex" }), null);
});

test("no RPC endpoints => UNVERIFIED (null)", async () => {
  const v = createRpcContractVerifier({ endpointsFor: () => [], multicallFn: async () => [{ success: true, returnData: word(5n) }] });
  assert.equal(await v({ chain: "ETHEREUM", address: WALLET, contract: TOKEN }), null);
});

test("balance is RPC-derived in whole tokens, never the provider value", async () => {
  const v = verifierFor([{ success: true, returnData: word(2500000000000000000n) }, { success: true, returnData: word(18n) }]);
  const r = await v({ chain: "ETHEREUM", address: WALLET, contract: TOKEN.toUpperCase() });
  assert.equal(r?.balance, 2.5);
  assert.equal(r?.contract, TOKEN, "contract lower-cased for canonical compare");
});

test("zero RPC balance => balance 0 (merge will reject)", async () => {
  const v = verifierFor([{ success: true, returnData: word(0n) }, { success: true, returnData: word(18n) }]);
  const r = await v({ chain: "ETHEREUM", address: WALLET, contract: TOKEN });
  assert.equal(r?.balance, 0);
});

test("balanceOf call failure => UNVERIFIED (null)", async () => {
  const v = verifierFor([{ success: false, returnData: "0x" }, { success: true, returnData: word(18n) }]);
  assert.equal(await v({ chain: "ETHEREUM", address: WALLET, contract: TOKEN }), null);
});

test("decimals call failure falls back to 18", async () => {
  const v = verifierFor([{ success: true, returnData: word(1000000000000000000n) }, { success: false, returnData: "0x" }]);
  const r = await v({ chain: "ETHEREUM", address: WALLET, contract: TOKEN });
  assert.equal(r?.balance, 1);
});

test("transport error => fail-closed (null), never thrown", async () => {
  const v = verifierFor(async () => { throw new Error("rpc timeout"); });
  assert.equal(await v({ chain: "ETHEREUM", address: WALLET, contract: TOKEN }), null);
});
