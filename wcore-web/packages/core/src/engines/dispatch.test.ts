import { test } from "node:test";
import assert from "node:assert/strict";
import { getWalletAssets } from "./dispatch.js";

test("getWalletAssets rejects chains disabled by configuration", async () => {
  await assert.rejects(
    getWalletAssets("0x0000000000000000000000000000000000000000", "ANCIENT8"),
    /chain disabled: ANCIENT8/,
  );
});
