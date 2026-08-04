import { test } from "node:test";
import assert from "node:assert/strict";
import { listenerCount } from "node:events";
import { linkAbortSignal } from "./abort.js";
import { RpcDispatcher } from "./rpc/dispatcher.js";
import { RpcClient } from "./rpc/client.js";

test("linkAbortSignal forwards an abort to the local controller", () => {
  const caller = new AbortController();
  const local = new AbortController();
  linkAbortSignal(caller.signal, local);

  assert.equal(local.signal.aborted, false);
  caller.abort();
  assert.equal(local.signal.aborted, true);
});

test("linkAbortSignal aborts immediately when the caller is already gone", () => {
  const caller = new AbortController();
  caller.abort();
  const local = new AbortController();

  linkAbortSignal(caller.signal, local);
  assert.equal(local.signal.aborted, true);
});

test("linkAbortSignal cleanup detaches the listener", () => {
  const caller = new AbortController();
  const local = new AbortController();
  const unlink = linkAbortSignal(caller.signal, local);

  // One scan signal is shared by every call that scan makes; leaving listeners
  // attached piles up hundreds on a single signal.
  unlink();
  caller.abort();
  assert.equal(local.signal.aborted, false, "a detached link must not abort the controller");
});

test("linkAbortSignal tolerates no caller signal", () => {
  const local = new AbortController();
  const unlink = linkAbortSignal(undefined, local);
  unlink();
  assert.equal(local.signal.aborted, false);
});

test("RpcDispatcher issues nothing once the scan has been abandoned", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const dispatcher = new RpcDispatcher(undefined, { minRpcs: 1, maxRpcs: 3, signal: ctrl.signal });

  let calls = 0;
  const result = await dispatcher.run(
    ["https://rpc1.example", "https://rpc2.example", "https://rpc3.example"],
    async () => { calls++; return 1; },
    String,
  );

  // The per-chain timeout used to release the concurrency slot while these calls kept
  // running, so the real number of in-flight scans drifted above the configured limit.
  assert.equal(calls, 0, "no endpoint may be contacted after the caller gave up");
  assert.equal(result.consensus, false);
  assert.deepEqual(result.attempts, []);
});

test("RpcDispatcher hands the caller signal to every call it makes", async () => {
  const ctrl = new AbortController();
  const dispatcher = new RpcDispatcher(undefined, { minRpcs: 1, maxRpcs: 2, signal: ctrl.signal });

  const seen: Array<AbortSignal | undefined> = [];
  await dispatcher.run(
    ["https://rpc1.example", "https://rpc2.example"],
    async (_endpoint, opts) => { seen.push(opts.signal); return 1; },
    String,
  );

  assert.equal(seen.length, 2);
  for (const signal of seen) {
    assert.equal(signal, ctrl.signal, "the RPC layer must receive the caller signal");
  }
});

test("RpcClient aborts an in-flight request when the caller gives up", async () => {
  const ctrl = new AbortController();
  const fetchImpl = ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  })) as unknown as typeof fetch;

  // The client timeout is deliberately huge: if the caller signal were ignored, the
  // call would still reject eventually, and a plain assert.rejects would pass for the
  // wrong reason. Only a prompt rejection proves the abort actually propagated.
  const client = new RpcClient(fetchImpl, 60_000);
  const started = Date.now();
  const pending = client.call("https://rpc.example", "eth_blockNumber", [], { signal: ctrl.signal });

  ctrl.abort();
  await assert.rejects(pending);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 1000, `abort must reject promptly, took ${elapsed}ms`);
});

test("RpcClient detaches its listener from the caller signal after each call", async () => {
  const ctrl = new AbortController();
  const fetchImpl = (async () => ({
    ok: true,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x1" }),
  })) as unknown as typeof fetch;

  const client = new RpcClient(fetchImpl, 1000);
  // A wide scan makes hundreds of calls on one signal; without the removal Node starts
  // warning about a listener leak.
  for (let i = 0; i < 50; i++) {
    await client.call("https://rpc.example", "eth_blockNumber", [], { signal: ctrl.signal });
  }

  // AbortSignal is an EventTarget and has no listenerCount method of its own;
  // the node:events helper is what can actually see its listeners.
  assert.equal(
    listenerCount(ctrl.signal, "abort"),
    0,
    "every linked listener must be removed once its call settles",
  );
});
