import { test } from "node:test";
import assert from "node:assert/strict";
import { validateChains } from "./server-helpers.js";
import { ChainKey } from "./schemas.js";

test("explicit retired scan requests are rejected even alongside valid chains", () => {
  for (const key of ["SUPERSEED", " sseed ", "5330", "0x14d2"]) {
    const result = validateChains(["ETHEREUM", key]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /chain_removed/i);
  }
  assert.equal(validateChains(["ETHEREUM"]).ok, true);
});

test("GM and native-price chain schemas reject retired keys before side effects", () => {
  for (const key of ["superseed", "sseed", "5330", "0x14d2"]) {
    const parsed = ChainKey.safeParse(key);
    assert.equal(parsed.success, false);
    if (!parsed.success) assert.match(parsed.error.message, /chain_removed/i);
  }
  for (const key of ["ethereum", "supr", "superposition"]) assert.equal(ChainKey.safeParse(key).success, true);
});
