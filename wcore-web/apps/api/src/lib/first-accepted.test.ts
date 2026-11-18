import test from "node:test";
import assert from "node:assert/strict";
import { firstAccepted, signalWithTimeout } from "./first-accepted.js";

const later = <T>(ms: number, value: T | Error | null) => (signal: AbortSignal): Promise<T | null> =>
  new Promise<T | null>((resolve, reject) => {
    const timer = setTimeout(() => (value instanceof Error ? reject(value) : resolve(value as T | null)), ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(null); }, { once: true });
  });

test("settles at the first accepted result without waiting for a slow endpoint, and aborts it", async () => {
  let slowAborted = false;
  const slow = (signal: AbortSignal) => new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve("slow"), 2000);
    signal.addEventListener("abort", () => { slowAborted = true; clearTimeout(timer); resolve(null); }, { once: true });
  });
  const t0 = Date.now();
  const r = await firstAccepted<string>([slow, later(20, "fast")], (v) => v === "fast");
  assert.equal(r.accepted, "fast");
  assert.ok(Date.now() - t0 < 500, "did not wait for the slow endpoint");
  assert.equal(slowAborted, true);
});

test("an unaccepted fast result does not settle: it waits for an accepted one", async () => {
  const r = await firstAccepted<string>([later(5, "pending-receipt"), later(40, "ok")], (v) => v === "ok");
  assert.equal(r.accepted, "ok");
});

test("when nothing is accepted it waits for all tasks and returns every settled value", async () => {
  const r = await firstAccepted<string>([later<string>(5, "a"), later<string>(15, "b"), later<string>(10, new Error("boom"))], () => false);
  assert.equal(r.accepted, null);
  assert.deepEqual(r.settled, ["a", "b", null]);
});

test("errors and nulls count as no result; an empty task list settles at once", async () => {
  const r = await firstAccepted<string>([later<string>(5, new Error("x")), later<string>(5, null)], () => true);
  assert.equal(r.accepted, null);
  assert.deepEqual(await firstAccepted<string>([], () => true), { accepted: null, settled: [] });
});

test("signalWithTimeout aborts on timeout or when the outer signal aborts", async () => {
  const outer = new AbortController();
  const a = signalWithTimeout(outer.signal, 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(a.signal.aborted, true);
  const b = signalWithTimeout(outer.signal, 5000);
  assert.equal(b.signal.aborted, false);
  outer.abort();
  assert.equal(b.signal.aborted, true);
  b.clear();
});
