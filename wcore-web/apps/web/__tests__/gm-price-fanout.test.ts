import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("GM page does not prefetch native prices for every factory", () => {
  const source = readFileSync(resolve(process.cwd(), "app/gm/GmPageClient.tsx"), "utf8");
  assert.doesNotMatch(source, /GM_CHAINS\.map[\s\S]{0,800}api\/price\/native/);
});
