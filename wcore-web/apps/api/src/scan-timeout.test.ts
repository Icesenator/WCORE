// Tests for the runWithTimeout helper extracted from scan.ts.
// Run: pnpm --filter @wcore/api exec node --import ./set-test-env.js --import tsx --test src/scan-timeout.test.ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { runWithTimeout } from "./plugins/scan-utils.js";

describe("runWithTimeout", () => {
  test("aborts the underlying signal when the timeout fires", async () => {
    let signal: AbortSignal | undefined;
    const handle = runWithTimeout<never>((s) => {
      signal = s;
      return new Promise(() => {}); // never resolves
    }, 50);

    await assert.rejects(handle.promise, /chain_timeout/);
    assert.equal(signal?.aborted, true, "factory must observe an aborted signal after timeout");
  });

  test("resolves with the factory's value when it finishes before the timeout", async () => {
    const handle = runWithTimeout<string>((_s) => Promise.resolve("ok"), 1000);
    assert.equal(await handle.promise, "ok");
  });

  test("cancel() aborts the signal and rejects the promise", async () => {
    let signal: AbortSignal | undefined;
    const handle = runWithTimeout<never>((s) => {
      signal = s;
      return new Promise(() => {});
    }, 1000);

    handle.cancel();
    await assert.rejects(handle.promise, /chain_timeout|aborted/);
    assert.equal(signal?.aborted, true);
  });

  test("propagates factory errors instead of racing with the timer", async () => {
    const handle = runWithTimeout<never>((_s) => Promise.reject(new Error("rpc failed")), 1000);
    await assert.rejects(handle.promise, /rpc failed/);
  });

  test("does not double-abort when factory resolves and cancel() is called afterwards", async () => {
    let abortCount = 0;
    const handle = runWithTimeout<string>((s) => {
      s.addEventListener("abort", () => {
        abortCount++;
      });
      return Promise.resolve("ok");
    }, 1000);

    assert.equal(await handle.promise, "ok");
    handle.cancel();
    // The signal is owned by runWithTimeout; cancel() may still abort it after
    // resolution, but it must not crash. The test guards the happy-path side
    // effect: the factory's listener was never fired because the signal was
    // never aborted during normal execution.
    assert.equal(abortCount, 0);
  });
});
