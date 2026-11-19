import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { submitTokenReport } from "../lib/token-report";

const ADMIN = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
const OTHER = "0x00000000000000000000000000000000000000a1";
const base = { apiUrl: "https://api.test", chainKey: "BASE", symbol: "WHSPR", name: "Whisper", contract: "0xabc", isCurrentlyScam: false };

type Route = { status: number; body?: unknown };
function fakeFetch(routes: Record<string, Route>) {
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const fetcher = async (url: string, init?: { method?: string; body?: string }) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined });
    const r = routes[path] ?? { status: 500 };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} };
  };
  return { calls, fetcher, paths: () => calls.map(c => `${c.method} ${c.path}`) };
}

describe("submitTokenReport", () => {
  test("an admin session (checksummed address) applies the override and creates no ticket", async () => {
    const f = fakeFetch({ "/api/auth/me": { status: 200, body: { address: "0x17D518736EE9341DCDC0A2498E013D33CFCDD080" } }, "/api/admin/scam-override": { status: 200 } });
    assert.equal(await submitTokenReport(base, f.fetcher, ADMIN), "admin");
    assert.deepEqual(f.paths(), ["GET /api/auth/me", "POST /api/admin/scam-override"]);
    assert.deepEqual(f.calls[1]?.body, { symbol: "WHSPR", action: "block", contract: "0xabc" });
  });

  test("another session creates exactly one ticket and never calls the admin route", async () => {
    const f = fakeFetch({ "/api/auth/me": { status: 200, body: { address: OTHER } }, "/api/tickets": { status: 201 } });
    assert.equal(await submitTokenReport({ ...base, isCurrentlyScam: true }, f.fetcher, ADMIN), "ticket");
    assert.deepEqual(f.paths(), ["GET /api/auth/me", "POST /api/tickets"]);
    assert.equal((f.calls[1]?.body as { title: string }).title, "Token report: WHSPR is LEGIT");
  });

  test("an unconfirmed session (401, 429, 5xx, unreadable) writes nothing", async () => {
    const cases: Route[] = [{ status: 401 }, { status: 429 }, { status: 503 }, { status: 200, body: { nope: 1 } }];
    for (const me of cases) {
      const f = fakeFetch({ "/api/auth/me": me, "/api/tickets": { status: 201 }, "/api/admin/scam-override": { status: 200 } });
      assert.equal(await submitTokenReport(base, f.fetcher, ADMIN), "failed");
      assert.deepEqual(f.paths(), ["GET /api/auth/me"]);
    }
  });

  test("an admin session refused by the API (401) falls back to one ticket", async () => {
    const f = fakeFetch({ "/api/auth/me": { status: 200, body: { address: ADMIN } }, "/api/admin/scam-override": { status: 401 }, "/api/tickets": { status: 201 } });
    assert.equal(await submitTokenReport(base, f.fetcher, ADMIN), "ticket");
    assert.deepEqual(f.paths(), ["GET /api/auth/me", "POST /api/admin/scam-override", "POST /api/tickets"]);
  });

  test("a server error or rate limit on the admin route creates no ticket", async () => {
    for (const status of [500, 429]) {
      const f = fakeFetch({ "/api/auth/me": { status: 200, body: { address: ADMIN } }, "/api/admin/scam-override": { status } });
      assert.equal(await submitTokenReport(base, f.fetcher, ADMIN), "failed");
      assert.equal(f.calls.length, 2);
    }
  });

  test("the native asset is reported without a contract", async () => {
    const f = fakeFetch({ "/api/auth/me": { status: 200, body: { address: ADMIN } }, "/api/admin/scam-override": { status: 200 } });
    await submitTokenReport({ ...base, contract: "native" }, f.fetcher, ADMIN);
    assert.equal((f.calls[1]?.body as { contract?: string }).contract, undefined);
  });
});
