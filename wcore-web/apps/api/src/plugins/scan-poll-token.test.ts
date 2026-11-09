import { test } from "node:test";
import assert from "node:assert/strict";
import { SCAN_POLL_TOKEN_HEADER, scanPollToken, verifyScanPollToken } from "./scan-poll-token.js";

const SECRET = "test-secret-0123456789abcdef0123456789";
const JOB = "0123456789abcdef0123456789abcdef";

test("le jeton de lecture est deterministe, lie au jobId et au secret", () => {
  const t = scanPollToken(SECRET, JOB);
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(scanPollToken(SECRET, JOB), t);
  assert.notEqual(scanPollToken(SECRET, "ffffffffffffffffffffffffffffffff"), t);
  assert.notEqual(scanPollToken("other-secret-0123456789abcdef012345", JOB), t);
  assert.ok(!t.includes(JOB), "le jeton ne contient pas le jobId");
});

test("verifyScanPollToken n'accepte que le jeton exact du job", () => {
  const t = scanPollToken(SECRET, JOB);
  assert.equal(verifyScanPollToken(SECRET, JOB, t), true);
  assert.equal(verifyScanPollToken(SECRET, "ffffffffffffffffffffffffffffffff", t), false);
  assert.equal(verifyScanPollToken(SECRET, JOB, t.slice(0, -1) + (t.endsWith("A") ? "B" : "A")), false);
  for (const bad of [undefined, null, "", 42, [t], t + "x", t.slice(1)]) assert.equal(verifyScanPollToken(SECRET, JOB, bad), false, String(bad));
});

test("l'en-tete est en minuscules (Fastify) et hors URL", () => {
  assert.equal(SCAN_POLL_TOKEN_HEADER, "x-scan-poll-token");
});
