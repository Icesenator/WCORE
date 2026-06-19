// Run: node --import tsx --test packages/core/src/alerting.test.ts
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sendAlert, isAlertingConfigured, setAlertFetch } from "./alerting.js";
import type { AlertEvent } from "./alerting.js";

// Reset after each test
afterEach(() => {
  setAlertFetch(fetch);
  delete (process.env as Record<string, string | undefined>)["ALERT_WEBHOOK_URL"];
});

test("isAlertingConfigured returns false without env var", () => {
  assert.equal(isAlertingConfigured(), false);
});

test("sendAlert does nothing when no webhook URL configured", async () => {
  delete (process.env as Record<string, string | undefined>)["ALERT_WEBHOOK_URL"];
  await sendAlert({ type: "circuit_opened", severity: "critical", service: "test", ts: new Date().toISOString(), data: {} });
  // Should not throw
});

test("sendAlert POSTs to webhook URL when configured", async () => {
  process.env["ALERT_WEBHOOK_URL"] = "https://hooks.example.com/alert";
  let calledUrl = "";
  let calledBody = "";

  setAlertFetch(async (url: string | URL | Request, init?: RequestInit) => {
    calledUrl = String(url);
    calledBody = init?.body as string ?? "";
    return new Response("ok", { status: 200 });
  });

  const event: AlertEvent = {
    type: "circuit_opened",
    severity: "critical",
    service: "test",
    ts: "2026-01-01T00:00:00Z",
    data: { chain: "base", failureCount: 20 },
  };
  await sendAlert(event);

  assert.equal(calledUrl, "https://hooks.example.com/alert");
  const parsed = JSON.parse(calledBody) as AlertEvent;
  assert.equal(parsed.type, "circuit_opened");
  assert.equal(parsed.severity, "critical");
  assert.equal(parsed.data.chain, "base");
});

test("sendAlert silently ignores fetch errors", async () => {
  process.env["ALERT_WEBHOOK_URL"] = "https://hooks.example.com/alert";
  setAlertFetch(async () => { throw new Error("network error"); });
  await sendAlert({ type: "db_down", severity: "critical", service: "test", ts: new Date().toISOString(), data: {} });
  // Should not throw
});
