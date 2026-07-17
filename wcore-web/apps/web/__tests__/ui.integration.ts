// Requires the API on http://127.0.0.1:4000.
// Run: pnpm --filter @wcore/web test:integration
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const API = "http://127.0.0.1:4000";

describe("UI-critical API routes", () => {
  test("GET /api/leaderboard returns array", async () => {
    const res = await fetch(`${API}/api/leaderboard`);
    assert.equal(res.status, 200);
    const data = await res.json() as { leaderboard: unknown[] };
    assert.ok(Array.isArray(data.leaderboard));
  });

  test("GET /api/quests returns quests array", async () => {
    const res = await fetch(`${API}/api/quests`);
    const data = await res.json() as { quests: unknown[] };
    assert.ok(Array.isArray(data.quests));
  });

  test("GET /api/badges returns badges array", async () => {
    const res = await fetch(`${API}/api/badges`);
    const data = await res.json() as { badges: unknown[] };
    assert.ok(Array.isArray(data.badges));
  });

  test("POST /api/scan with 0-value wallet shows degraded", async () => {
    const res = await fetch(`${API}/api/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: "0x0000000000000000000000000000000000000001", chains: ["BASE"] }),
    });
    assert.equal(res.status, 200);
    const data = await res.json() as { chains: Array<{ degraded: boolean; totals: { valueEur: number } }>; metrics?: { totalMs: number } };
    assert.ok(data.chains.length > 0);
    assert.ok(data.chains[0]!.totals.valueEur === 0 || data.chains[0]!.degraded === true);
    assert.ok(data.metrics);
    assert.ok(typeof data.metrics.totalMs === "number");
  });

  test("POST /api/scan with customTokens checks them", async () => {
    const res = await fetch(`${API}/api/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: "0x0000000000000000000000000000000000000001",
        chains: ["BASE"],
        customTokens: ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json() as { chains: Array<{ tokens: Array<{ symbol: string }> }> };
    const symbols = data.chains[0]?.tokens.map((t) => t.symbol) ?? [];
    assert.ok(symbols.includes("CUSTOM") || symbols.includes("USDC"));
  });

  test("POST /api/scan rejects >20 chains", async () => {
    const chains21 = Array.from({ length: 21 }, (_, i) => `CHAIN_${i}`);
    const res = await fetch(`${API}/api/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: "0x0000000000000000000000000000000000000001", chains: chains21 }),
    });
    assert.ok(res.status === 400 || res.status === 429);
  });
});
