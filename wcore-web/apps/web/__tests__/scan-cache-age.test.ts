import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheAgeLabel } from "../lib/scan-cache-age";

const NOW = Date.parse("2026-11-11T16:00:00.000Z");

test("no label for a result scanned for this request or an unusable date", () => {
  assert.equal(cacheAgeLabel(null, NOW), null);
  assert.equal(cacheAgeLabel(undefined, NOW), null);
  assert.equal(cacheAgeLabel("not a date", NOW), null);
});

test("age of a cached result", () => {
  assert.equal(cacheAgeLabel("2026-11-11T15:59:40.000Z", NOW), "cached just now");
  assert.equal(cacheAgeLabel("2026-11-11T15:48:00.000Z", NOW), "cached 12 min ago");
  assert.equal(cacheAgeLabel("2026-11-11T14:00:00.000Z", NOW), "cached 2 h ago");
  assert.equal(cacheAgeLabel("2026-11-11T10:35:00.000Z", NOW), "cached 5 h 25 min ago");
});
