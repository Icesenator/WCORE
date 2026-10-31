import assert from "node:assert/strict";
import { test } from "node:test";

import type { EvmRpc } from "@wcore/core";
import { createRpcContractVerifier } from "./rpc-verifier.js";

const A = "https://a.provider-alpha.test/key-a";
const B = "https://b.provider-beta.test/key-b";
const WALLET = "0x00000000000000000000000000000000000000a1";
const TOKEN = "0x00000000000000000000000000000000000000b2";

const word = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");

// tryAggregate result for [balanceOf -> 5, decimals -> 0]
function aggregate(balance: bigint): string {
  const tuple = (value: bigint) => word(1) + word(0x40) + word(32) + word(value);
  return "0x" + word(0x20) + word(2) + word(0x40) + word(0xc0) + tuple(balance) + tuple(0n);
}

function withOverride<T>(fn: () => Promise<T>): Promise<T> {
  const before = process.env.WCORE_RPC_OVERRIDES;
  process.env.WCORE_RPC_OVERRIDES = JSON.stringify({ B3: [A, B] });
  return fn().finally(() => {
    if (before === undefined) delete process.env.WCORE_RPC_OVERRIDES;
    else process.env.WCORE_RPC_OVERRIDES = before;
  });
}

test("surcharge B3 : un seul fournisseur répondant ne vérifie jamais un contrat", () => withOverride(async () => {
  const rpc = { call: async (endpoint: string) => {
    if (endpoint === A) return aggregate(5n);
    throw new Error("upstream unavailable");
  } } as unknown as EvmRpc;
  const verify = createRpcContractVerifier({ rpc });
  for (let i = 0; i < 4; i++) {
    assert.equal(await verify({ chain: "b3", address: WALLET, contract: TOKEN }), null, `appel ${i + 1}`);
  }
}));

test("surcharge B3 : deux fournisseurs concordants vérifient le contrat", () => withOverride(async () => {
  const rpc = { call: async () => aggregate(5n) } as unknown as EvmRpc;
  const verify = createRpcContractVerifier({ rpc });
  assert.deepEqual(await verify({ chain: "b3", address: WALLET, contract: TOKEN }), { contract: TOKEN, balance: 5 });
}));
