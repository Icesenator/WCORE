import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCexSyncFailure } from "../plugins/cex.js";

test("describeCexSyncFailure never echoes the raw exchange response", () => {
  // The helpers embed up to 300 characters of the upstream body, which is what used to
  // reach the browser and the stored account record.
  const leaky = 'Bitpanda HTTP 500: {"requestId":"7f3c-internal","host":"api-int.bitpanda.lan","account":"user-42","trace":"..."}';
  const reason = describeCexSyncFailure(leaky);

  assert.equal(reason, "exchange_http_500");
  assert.ok(!reason.includes("requestId"));
  assert.ok(!reason.includes("bitpanda.lan"));
  assert.ok(!reason.includes("user-42"));
});

test("describeCexSyncFailure keeps the part a user can act on", () => {
  assert.equal(describeCexSyncFailure("Binance HTTP 401 invalid API key"), "credentials_rejected");
  assert.equal(describeCexSyncFailure("signature for this request is not valid"), "credentials_rejected");
  assert.equal(describeCexSyncFailure("HTTP 429 too many requests"), "rate_limited_by_exchange");
  assert.equal(describeCexSyncFailure("The operation was aborted due to timeout"), "exchange_unreachable");
  assert.equal(describeCexSyncFailure("fetch failed"), "exchange_unreachable");
});

test("describeCexSyncFailure falls back without inventing detail", () => {
  assert.equal(describeCexSyncFailure("something entirely unexpected"), "sync_failed");
  assert.equal(describeCexSyncFailure(""), "sync_failed");
});

test("describeCexSyncFailure classifies credentials before status codes", () => {
  // A 403 is an authorization problem the user can fix, not an opaque upstream status.
  assert.equal(describeCexSyncFailure("HTTP 403 forbidden"), "credentials_rejected");
});
