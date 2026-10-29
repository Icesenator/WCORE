import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("support anonymous branch renders public help without replacing authenticated ticket handlers", () => {
  const source = readFileSync(new URL("../app/support/SupportClient.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!address\)\s*\{\s*return\s*\(?\s*<SupportPublicHelp/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /method: "PATCH"/);
  assert.match(source, /Create a ticket/);
});
