import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryCacheStore } from "@wcore/core";
import { CanonicalCryptoService, CryptoServiceUnavailableError } from "./crypto-listing-service.js";

const LAST_GOOD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function row(rank: number): object {
  return {
    cmc_rank: rank,
    symbol: `SYM${rank}`,
    name: `Token ${rank}`,
    quote: { EUR: { price: rank * 10, market_cap: rank * 1_000_000 } },
  };
}

function manyRows(count: number) {
  return Array.from({ length: count }, (_, i) => row(i + 1));
}

function cachedSnapshot(rowCount: number, generatedAt = "2026-07-12T10:00:00.000Z") {
  return {
    ok: true,
    generatedAt,
    universeSource: "coinmarketcap",
    rows: Array.from({ length: rowCount }, (_, i) => ({
      rank: i + 1,
      symbol: `SYM${i + 1}`,
      name: `Token ${i + 1}`,
      priceEur: (i + 1) * 10,
      marketCapEur: (i + 1) * 1_000_000,
    })),
    stats: { requested: rowCount },
    stale: false,
  };
}

function cmcResponse(rows: object[]) {
  return {
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => ({ data: rows }),
  } as unknown as Response;
}

function deps(cache = new MemoryCacheStore()) {
  const calls: string[] = [];
  const service = new CanonicalCryptoService({
    cache,
    apiKeys: ["KEY1", "KEY2"],
    fetchImpl: async (url) => {
      calls.push(String(url));
      return cmcResponse(manyRows(5000));
    },
    now: () => new Date("2026-07-12T10:00:00.000Z"),
  });
  return { service, calls };
}

class RecordingCache extends MemoryCacheStore {
  keys: Array<{ key: string; ttlMs: number }> = [];
  override async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.keys.push({ key, ttlMs });
    await super.set(key, value, ttlMs);
  }
}

test("getListingSnapshot returns CMC top 5000 fresh", async () => {
  const { service, calls } = deps();
  const snapshot = await service.getListingSnapshot(5_000);
  assert.equal(snapshot.rows.length, 5000);
  assert.equal(snapshot.rows[0]!.symbol, "SYM1");
  assert.equal(snapshot.rows[4999]!.symbol, "SYM5000");
  assert.equal(snapshot.stale, false);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.includes("limit=5000"));
});

test("getListingSnapshot accepts top 5000 CMC rows with missing or zero market cap", async () => {
  const cmcRows = manyRows(5_000);
  cmcRows[123] = {
    cmc_rank: 124,
    symbol: "ZERO",
    name: "Zero Market Cap Token",
    quote: { EUR: { price: 1.23 } },
  };
  cmcRows[456] = {
    cmc_rank: 457,
    symbol: "NOMC",
    name: "No Market Cap Token",
    quote: { EUR: { price: 4.56, market_cap: 0 } },
  };
  const service = new CanonicalCryptoService({
    cache: new MemoryCacheStore(),
    apiKeys: ["KEY1"],
    fetchImpl: async () => cmcResponse(cmcRows),
    now: () => new Date("2026-07-12T10:00:00.000Z"),
  });

  const snapshot = await service.getListingSnapshot(5_000);

  assert.equal(snapshot.rows.length, 5_000);
  assert.equal(snapshot.rows[123]!.rank, 124);
  assert.equal(snapshot.rows[123]!.marketCapEur, 0);
  assert.equal(snapshot.rows[456]!.rank, 457);
  assert.equal(snapshot.rows[456]!.marketCapEur, 0);
});

test("getListingSnapshot slices cached full snapshot", async () => {
  const cache = new MemoryCacheStore();
  const { service } = deps(cache);
  await service.getListingSnapshot(5_000);
  const small = await service.getListingSnapshot(300);
  assert.equal(small.rows.length, 300);
});

test("getListingSnapshot refreshes a fresh cache entry with fewer rows than requested", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("crypto:top-market-cap:fresh", cachedSnapshot(3820), LAST_GOOD_TTL_MS);
  const { service, calls } = deps(cache);

  const snapshot = await service.getListingSnapshot(5_000);

  assert.equal(snapshot.rows.length, 5000);
  assert.equal(snapshot.stale, false);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.includes("limit=5000"));
});

test("fallback key is used when first key fails auth", async () => {
  const calls: { url: string; key: string }[] = [];
  const service = new CanonicalCryptoService({
    cache: new MemoryCacheStore(),
    apiKeys: ["KEY1", "KEY2"],
    fetchImpl: async (input, init) => {
      const url = String(input);
      const key = (init?.headers as Record<string, string> | undefined)?.["X-CMC_PRO_API_KEY"] ?? "";
      calls.push({ url, key });
      if (key === "KEY1") {
        return { ok: false, status: 401, statusText: "Unauthorized", headers: new Map() } as unknown as Response;
      }
      return cmcResponse(manyRows(5000));
    },
    now: () => new Date("2026-07-12T10:00:00.000Z"),
  });
  const snapshot = await service.getListingSnapshot(5000);
  assert.equal(snapshot.rows.length, 5000);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.key, "KEY1");
  assert.equal(calls[1]!.key, "KEY2");
});

test("throws when no keys are configured", async () => {
  const service = new CanonicalCryptoService({
    cache: new MemoryCacheStore(),
    apiKeys: [],
    fetchImpl: async () => cmcResponse([]),
    now: () => new Date("2026-07-12T10:00:00.000Z"),
  });
  await assert.rejects(service.getListingSnapshot(), /CMC_API_KEY is not configured/);
});

test("getListingSnapshot rejects partial CMC rows when 5000 were requested", async () => {
  const service = new CanonicalCryptoService({
    cache: new MemoryCacheStore(),
    apiKeys: ["KEY1"],
    fetchImpl: async () => cmcResponse(manyRows(3820)),
    now: () => new Date("2026-07-12T10:00:00.000Z"),
  });

  await assert.rejects(
    service.getListingSnapshot(5_000),
    /returned 3820 valid rows, expected 5000/
  );
});

test("getListingSnapshot rejects CMC rows with a rank gap when 5000 were requested", async () => {
  const gappedRows = manyRows(5_000);
  gappedRows[999] = row(5_001);
  const service = new CanonicalCryptoService({
    cache: new MemoryCacheStore(),
    apiKeys: ["KEY1"],
    fetchImpl: async () => cmcResponse(gappedRows),
    now: () => new Date("2026-07-12T10:00:00.000Z"),
  });

  await assert.rejects(
    service.getListingSnapshot(5_000),
    /returned 5000 valid rows, expected 5000 contiguous ranks/
  );
});

test("getListingSnapshot refreshes a fresh cache entry with a rank gap", async () => {
  const cache = new MemoryCacheStore();
  const gappedSnapshot = cachedSnapshot(5_000);
  for (let i = 999; i < gappedSnapshot.rows.length; i++) {
    gappedSnapshot.rows[i]!.rank = i + 2;
  }
  await cache.set("crypto:top-market-cap:fresh", gappedSnapshot, LAST_GOOD_TTL_MS);
  const { service, calls } = deps(cache);

  const snapshot = await service.getListingSnapshot(5_000);

  assert.equal(snapshot.rows.length, 5_000);
  assert.equal(snapshot.rows[999]!.rank, 1_000);
  assert.equal(snapshot.rows[999]!.symbol, "SYM1000");
  assert.equal(snapshot.stale, false);
  assert.equal(calls.length, 1);
});

test("invalid limit is rejected", async () => {
  const { service } = deps();
  await assert.rejects(service.getListingSnapshot(0), /integer from 1 to 5000/);
  await assert.rejects(service.getListingSnapshot(5_001), /integer from 1 to 5000/);
});

test("writes fresh and last-good keys with correct TTLs", async () => {
  const cache = new RecordingCache();
  const { service } = deps(cache);
  await service.getListingSnapshot(5_000);
  const fresh = cache.keys.find((k) => k.key === "crypto:top-market-cap:fresh");
  const lastGood = cache.keys.find((k) => k.key === "crypto:top-market-cap:last-good");
  assert.ok(fresh);
  assert.ok(lastGood);
  assert.equal(fresh.ttlMs, 1 * 60 * 60 * 1000);
  assert.equal(lastGood.ttlMs, 30 * 24 * 60 * 60 * 1000);
});

test("last-good stale snapshot is served when refresh fails", async () => {
  const cache = new MemoryCacheStore();
  const goodService = deps(cache).service;
  const goodSnapshot = await goodService.getListingSnapshot(5_000);

  // Pre-seed last-good explicitly; the failing service uses a clock far enough in the future that
  // the fresh entry is no longer considered fresh, forcing a refresh attempt that fails.
  await cache.set("crypto:top-market-cap:last-good", goodSnapshot, LAST_GOOD_TTL_MS);

  const failingService = new CanonicalCryptoService({
    cache,
    apiKeys: ["KEY1"],
    fetchImpl: async () => ({ ok: false, status: 500, statusText: "Error", headers: new Map() } as unknown as Response),
    now: () => new Date("2026-07-13T00:00:00.000Z"),
  });

  const snapshot = await failingService.getListingSnapshot(5_000);
  assert.equal(snapshot.stale, true);
  assert.equal(snapshot.rows.length, 5000);
  // Stale snapshot rows share the original generatedAt, so we can assert it survived intact.
  assert.equal(snapshot.generatedAt, goodSnapshot.generatedAt);
});

test("getListingSnapshot rejects last-good cache with fewer rows than requested when refresh fails", async () => {
  const cache = new MemoryCacheStore();
  await cache.set("crypto:top-market-cap:last-good", cachedSnapshot(3820), LAST_GOOD_TTL_MS);
  const service = new CanonicalCryptoService({
    cache,
    apiKeys: ["KEY1"],
    fetchImpl: async () => ({ ok: false, status: 500, statusText: "Error", headers: new Map() } as unknown as Response),
    now: () => new Date("2026-07-12T10:00:00.000Z"),
  });

  await assert.rejects(service.getListingSnapshot(5_000), CryptoServiceUnavailableError);
});

test("throws typed error when no last-good snapshot exists", async () => {
  const service = new CanonicalCryptoService({
    cache: new MemoryCacheStore(),
    apiKeys: ["KEY1"],
    fetchImpl: async () => ({ ok: false, status: 500, statusText: "Error", headers: new Map() } as unknown as Response),
    now: () => new Date("2026-07-12T10:00:00.000Z"),
  });
  await assert.rejects(service.getListingSnapshot(), CryptoServiceUnavailableError);
});
