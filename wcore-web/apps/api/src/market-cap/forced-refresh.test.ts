import assert from "node:assert/strict";
import test from "node:test";
import { MemoryCacheStore } from "@wcore/core";
import { allowForcedRefresh } from "./forced-refresh.js";

test("one forced refresh per ranking and window, whoever asks", async () => {
  const cache = new MemoryCacheStore();
  assert.equal(await allowForcedRefresh(cache, "crypto", false), false, "no request, no refresh");
  assert.equal(await allowForcedRefresh(cache, "crypto", true), true, "first request is honoured");
  assert.equal(await allowForcedRefresh(cache, "crypto", true), false, "second request in the window serves the cache");
  assert.equal(await allowForcedRefresh(cache, "stock", true), true, "each ranking has its own window");
});

test("a failing store never allows an unbounded rebuild", async () => {
  const cache = new MemoryCacheStore();
  cache.add = async () => { throw new Error("redis down"); };
  assert.equal(await allowForcedRefresh(cache, "stock", true), false);
});
