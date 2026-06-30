import { test } from "node:test";
import assert from "node:assert/strict";
import { getWCTStakeLockStatus, WCT_STAKE_CONTRACT } from "./wct-stake.js";
import type { EvmRpc } from "../rpc/index.js";

function mockRpc(responses: Map<string, string>): EvmRpc {
  return {
    ethCall: async (_e: string, to: string, data: string) => {
      const v = responses.get(`${to.toLowerCase()}::${data.toLowerCase()}`);
      if (v === undefined) throw new Error(`unexpected call to=${to} data=${data}`);
      return v;
    },
  } as unknown as EvmRpc;
}

const USER = "0x1111111111111111111111111111111111111111";
const LOCK_UNTIL_SELECTOR = "0x025b22f4"; // keccak256("lockUntil(address)")[:4]

test("getWCTStakeLockStatus returns 'lock' when lockUntil > now", async () => {
  const future = BigInt(Math.floor(Date.now() / 1000) + 3600); // +1h
  const responses = new Map<string, string>();
  responses.set(`${WCT_STAKE_CONTRACT}::${LOCK_UNTIL_SELECTOR}${USER.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`, "0x" + future.toString(16).padStart(64, "0"));
  const rpc = mockRpc(responses);
  const status = await getWCTStakeLockStatus(rpc, "https://any-rpc", USER);
  assert.equal(status, "lock");
});

test("getWCTStakeLockStatus returns 'flex' when lockUntil <= now", async () => {
  const past = BigInt(Math.floor(Date.now() / 1000) - 3600); // -1h
  const responses = new Map<string, string>();
  responses.set(`${WCT_STAKE_CONTRACT}::${LOCK_UNTIL_SELECTOR}${USER.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`, "0x" + past.toString(16).padStart(64, "0"));
  const rpc = mockRpc(responses);
  const status = await getWCTStakeLockStatus(rpc, "https://any-rpc", USER);
  assert.equal(status, "flex");
});

test("getWCTStakeLockStatus returns 'flex' on RPC failure (safe default)", async () => {
  const rpc = mockRpc(new Map());
  const status = await getWCTStakeLockStatus(rpc, "https://any-rpc", USER);
  assert.equal(status, "flex", "RPC failure should default to flex (not lock, to avoid stuck UI)");
});
