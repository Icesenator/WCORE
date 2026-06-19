import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { BROWSER_SCAN_CACHE_ENABLED } from "../components/scan-cache";

describe("wallet scan cache", () => {
  test("does not use browser localStorage for scan results", () => {
    assert.equal(BROWSER_SCAN_CACHE_ENABLED, false);
  });
});
