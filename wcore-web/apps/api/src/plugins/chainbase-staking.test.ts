import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getRpcEndpoints } from "@wcore/core";
import { getChainbaseLocked, getChainbaseRpcEndpoints, getChainbaseStaking } from "./chainbase-staking.js";

test("Chainbase staking uses project BASE RPC endpoints", () => {
  assert.deepEqual(getChainbaseRpcEndpoints(), getRpcEndpoints("BASE"));
});

test("API Docker image includes the Chainbase airdrop config next to compiled plugins", () => {
  const dockerfile = fs.readFileSync(path.resolve(import.meta.dirname, "../../Dockerfile.railway"), "utf8");
  assert.match(dockerfile, /chainbase-airdrop\.json/);
});

test("Chainbase locked call uses the verified getDelegationAmount selector", async () => {
  const previousFetch = globalThis.fetch;
  let data = "";
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    data = String(body.params?.[0]?.data || "");
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: "0x" + (58_581_439_720_000_000_000n).toString(16),
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const locked = await getChainbaseLocked("0x17d518736Ee9341dcDc0A2498e013D33CFCDD080");
    assert.equal(data.slice(0, 10), "0x15c4642e");
    assert.equal(locked, 58.58143972);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Chainbase staking becomes flex when every undelegate request is mature", async () => {
  const previousFetch = globalThis.fetch;
  const responses = [
    // getDelegationAmount(address)
    58_581_439_720_000_000_000n,
    // balanceOf(address) -> one delegation NFT
    1n,
    // tokenOfOwnerByIndex(address, 0) -> tokenId 42
    42n,
    // undelegateRequests(42) -> amount, unlockTime in the past
    [58_581_439_720_000_000_000n, 1_700_000_000n],
  ];
  globalThis.fetch = (async () => {
    const next = responses.shift();
    if (next === undefined) throw new Error("unexpected extra RPC call");
    const result = Array.isArray(next)
      ? "0x" + next.map((value) => value.toString(16).padStart(64, "0")).join("")
      : "0x" + next.toString(16).padStart(64, "0");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const staking = await getChainbaseStaking("0x17d518736Ee9341dcDc0A2498e013D33CFCDD080");
    assert.equal(staking.locked, 58.58143972);
    assert.equal(staking.liquidityStatus, "flex");
    assert.equal(responses.length, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
