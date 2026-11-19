import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { submitTokenReport } from "../lib/token-report";

const base = { apiUrl: "https://api.test", chainKey: "BASE", symbol: "WHSPR", name: "Whisper", contract: "0xabc", isCurrentlyScam: false };

function fakeFetch(statusByPath: Record<string, number>) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetcher = async (url: string, init: { method: string; body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const path = new URL(url).pathname;
    const status = statusByPath[path] ?? 500;
    return { ok: status >= 200 && status < 300, status };
  };
  return { calls, fetcher };
}

describe("submitTokenReport", () => {
  test("an admin session applies the override and creates no ticket", async () => {
    const { calls, fetcher } = fakeFetch({ "/api/admin/scam-override": 200 });
    assert.equal(await submitTokenReport(base, fetcher), "admin");
    assert.deepEqual(calls.map(c => new URL(c.url).pathname), ["/api/admin/scam-override"]);
    assert.deepEqual(calls[0]?.body, { symbol: "WHSPR", action: "block", contract: "0xabc" });
  });

  test("a non-admin session (401) creates exactly one ticket", async () => {
    const { calls, fetcher } = fakeFetch({ "/api/admin/scam-override": 401, "/api/tickets": 201 });
    assert.equal(await submitTokenReport({ ...base, isCurrentlyScam: true }, fetcher), "ticket");
    assert.deepEqual(calls.map(c => new URL(c.url).pathname), ["/api/admin/scam-override", "/api/tickets"]);
    assert.equal((calls[1]?.body as { title: string }).title, "Token report: WHSPR is LEGIT");
  });

  test("a server error on the admin route creates no ticket", async () => {
    const { calls, fetcher } = fakeFetch({ "/api/admin/scam-override": 500, "/api/tickets": 201 });
    assert.equal(await submitTokenReport(base, fetcher), "failed");
    assert.equal(calls.length, 1);
  });

  test("the native asset is reported without a contract", async () => {
    const { calls, fetcher } = fakeFetch({ "/api/admin/scam-override": 200 });
    await submitTokenReport({ ...base, contract: "native" }, fetcher);
    assert.equal((calls[0]?.body as { contract?: string }).contract, undefined);
  });
});
