import assert from "node:assert/strict";
import test from "node:test";
import { pipelineExecError } from "./redis-store.js";

test("pipelineExecError rejects null, incomplete, and per-command failures", () => {
  assert.match(pipelineExecError(null, 2)!.message, /no results/);
  assert.match(pipelineExecError([[null, "OK"]], 2)!.message, /1 of 2/);
  assert.match(
    pipelineExecError([[null, "OK"], [new Error("second write failed"), null]], 2)!.message,
    /second write failed/,
  );
  assert.equal(pipelineExecError([[null, "OK"], [null, "OK"]], 2), undefined);
});
