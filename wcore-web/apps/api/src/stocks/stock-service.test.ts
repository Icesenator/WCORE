import assert from "node:assert/strict";
import test from "node:test";
import { MemoryCacheStore } from "@wcore/core";
import { CanonicalStockService, StockServiceUnavailableError } from "./stock-service.js";

function csv(count = 300): string {
  const special = [
    "1,SK Hynix,000660.KS,100000000000,1411,South Korea",
    "2,Toyota,TM,300000000000,200,Japan",
    "3,Samsung,005930.KS,400000000000,51.2,South Korea",
  ];
  const rest = Array.from({ length: Math.max(0, count - special.length) }, (_, i) =>
    `${i + 4},Company ${i + 4},TEST${i + 4},1000000000,10,US`);
  return ["rank,name,symbol,marketcap,price,country", ...special.slice(0, count), ...rest].join("\n");
}

function csvWithRankGap(count = 300): string {
  const rows = csv(count).split("\n");
  for (let index = 5; index < rows.length; index++) {
    rows[index] = rows[index]!.replace(/^\d+,/, `${index + 1},`);
  }
  return rows.join("\n");
}

function deps(cache = new MemoryCacheStore()) {
  let cmcCalls = 0;
  let quoteCalls = 0;
  let fxCalls = 0;
  const service = new CanonicalStockService({
    cache,
    fetchImpl: async (url, init) => {
      cmcCalls++;
      assert.equal(String(url), "https://companiesmarketcap.com/?download=csv");
      assert.match(String((init?.headers as Record<string, string>)["User-Agent"]), /WCORE/);
      assert.ok(init?.signal);
      return new Response(csv(), { status: 200 });
    },
    fetchStockQuotes: async (symbols) => {
      quoteCalls++;
      assert.ok(symbols.length > 0 && symbols.length <= 50);
      return {
        "000660.KS": { priceNative: 2_180_000, currency: "KRW", yahooTicker: "000660.KS", source: "yahoo:relay" },
        TM: { priceNative: 20, currency: "USD", yahooTicker: "7203.T", source: "yahoo:relay" },
        "005930.KS": { priceNative: 80_000, currency: "KRW", yahooTicker: "005930.KS", source: "yahoo:relay" },
      };
    },
    fetchStockFxQuotes: async (currencies) => {
      fxCalls++;
      assert.deepEqual(currencies, ["KRW"]);
      return { KRW: { unitsPerEur: 1717.17, currency: "KRW", yahooTicker: "EURKRW=X", source: "yahoo:relay" } };
    },
    getUsdToEur: async () => 0.9,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });
  return { service, cache, calls: () => ({ cmcCalls, quoteCalls, fxCalls }) };
}

class RecordingCache extends MemoryCacheStore {
  readonly writes: Array<{ key: string; ttlMs?: number }> = [];

  override async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.writes.push({ key, ttlMs });
    await super.set(key, value, ttlMs);
  }
}

class BatchRecordingCache extends MemoryCacheStore {
  readonly mgetKeys: string[][] = [];
  readonly pipelineBatches: Array<Array<{ key: string; value: unknown; ttlMs?: number }>> = [];
  rowGetCalls = 0;

  override async get<T>(key: string): Promise<T | undefined> {
    if (key.startsWith("stock:price:")) this.rowGetCalls++;
    return super.get<T>(key);
  }

  override async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
    this.mgetKeys.push([...keys]);
    return super.mget<T>(keys);
  }

  override async pipeline(ops: Array<{ key: string; value: unknown; ttlMs?: number }>): Promise<number> {
    this.pipelineBatches.push(ops.map((op) => ({ ...op })));
    return super.pipeline(ops);
  }
}

function cachedPrice(priceEur: number, updatedAt = "2026-07-11T10:00:00.000Z") {
  return {
    priceNative: priceEur,
    currency: "EUR",
    priceEur,
    priceSource: "cached",
    fallbackSource: null,
    appliedRatio: 1,
    stale: false,
    updatedAt,
    errors: [],
  };
}

test("builds one complete normalized snapshot with batched quotes and distinct FX", async () => {
  const { service, calls } = deps();
  const snapshot = await service.getTopMarketCapSnapshot();
  assert.equal(snapshot.rows.length, 300);
  assert.deepEqual(calls(), { cmcCalls: 1, quoteCalls: 6, fxCalls: 1 });
  const hynix = snapshot.rows[0]!;
  assert.ok(hynix.priceEur! > 1_200 && hynix.priceEur! < 1_400);
  const toyota = snapshot.rows[1]!;
  assert.equal(toyota.priceEur, 18);
  assert.equal(toyota.supply, 15_000_000_000);
  assert.equal(toyota.marketCapEur, 270_000_000_000);
  assert.equal(snapshot.stats.requested, 300);
  assert.equal(snapshot.stats.pricedFresh + snapshot.stats.pricedStale + snapshot.stats.unpriced, 300);
});

test("serves fresh cache, slices limits, and applies Samsung receipt ratio once", async () => {
  const { service, calls } = deps();
  const top = await service.getTopMarketCapSnapshot(2);
  assert.equal(top.rows.length, 2);
  const prices = await service.getPricesForBitpandaSymbols(["SSU", "HYXS"]);
  assert.equal(prices.SSU!.priceEur, (80_000 / 1717.17) * 25);
  assert.equal(prices.SSU!.appliedRatio, 25);
  assert.equal(prices.SSU!.priceEur, (await service.getTopMarketCapSnapshot()).rows[2]!.priceEur! * 25);
  assert.equal(prices.HYXS!.priceEur, top.rows[0]!.priceEur);
  await service.getTopMarketCapSnapshot();
  assert.deepEqual(calls(), { cmcCalls: 1, quoteCalls: 6, fxCalls: 1 });
});

test("rejects invalid top limits", async () => {
  const { service } = deps();
  for (const limit of [0, 1.5, 5_001]) {
    await assert.rejects(() => service.getTopMarketCapSnapshot(limit), /integer from 1 to 5000/);
  }
});

test("serves ranked snapshots beyond 300 rows for dynamic stock portfolios", async () => {
  let quoteCalls = 0;
  const service = new CanonicalStockService({
    cache: new MemoryCacheStore(),
    fetchImpl: async () => new Response(csv(420)),
    fetchStockQuotes: async (symbols) => {
      quoteCalls++;
      assert.ok(symbols.length > 0 && symbols.length <= 50);
      return {};
    },
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });

  const snapshot = await service.getTopMarketCapSnapshot(420);

  assert.equal(snapshot.rows.length, 420);
  assert.equal(snapshot.stats.requested, 420);
  assert.equal(quoteCalls, 9);
});

test("overlaps quote batches up to four while covering every symbol exactly once", async () => {
  const sourceCsv = csv(301);
  const expectedSymbols = sourceCsv.split("\n").slice(1).map((row) => row.split(",")[2]!);
  const seenSymbols: string[] = [];
  let active = 0;
  let maxActive = 0;
  const service = new CanonicalStockService({
    cache: new MemoryCacheStore(),
    fetchImpl: async () => new Response(sourceCsv),
    fetchStockQuotes: async (symbols) => {
      active++;
      maxActive = Math.max(maxActive, active);
      seenSymbols.push(...symbols);
      await new Promise((resolve) => setTimeout(resolve, symbols[0] === "000660.KS" ? 20 : 5));
      active--;
      return Object.fromEntries(symbols.filter((symbol) => symbol.startsWith("TEST")).map((symbol) => [symbol, {
        priceNative: 10,
        currency: "USD",
        yahooTicker: symbol,
        source: "yahoo:relay",
      }]));
    },
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });

  const snapshot = await service.getTopMarketCapSnapshot(301);

  assert.ok(maxActive > 1, `expected overlapping requests, observed ${maxActive}`);
  assert.ok(maxActive <= 4, `expected at most four requests, observed ${maxActive}`);
  assert.deepEqual([...seenSymbols].sort(), [...expectedSymbols].sort());
  assert.equal(new Set(seenSymbols).size, expectedSymbols.length);
  assert.deepEqual(snapshot.rows.map((row) => row.sourceTicker), expectedSymbols);
  assert.ok(snapshot.rows.slice(3).every((row) => row.priceSource === "yahoo:relay"));
});

test("batch-reads row caches once, prefers valid fresh values, and avoids per-key gets", async () => {
  const cache = new BatchRecordingCache();
  await cache.set("stock:price:KRX:000660:fresh", cachedPrice(1_269));
  await cache.set("stock:price:KRX:000660:last-good", cachedPrice(1_100));
  await cache.set("stock:price:TYO:7203:last-good", cachedPrice(180));
  const service = new CanonicalStockService({
    cache,
    fetchImpl: async () => new Response(csv(320)),
    fetchStockQuotes: async () => ({
      "000660.KS": { priceNative: 20_000_000, currency: "KRW", yahooTicker: "000660.KS", source: "yahoo:relay" },
      TM: { priceNative: 2_000, currency: "USD", yahooTicker: "7203.T", source: "yahoo:relay" },
    }),
    fetchStockFxQuotes: async () => ({
      KRW: { unitsPerEur: 1717.17, currency: "KRW", yahooTicker: "EURKRW=X", source: "yahoo:relay" },
    }),
    getUsdToEur: async () => 0.9,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });

  const snapshot = await service.getTopMarketCapSnapshot(320);

  assert.equal(cache.mgetKeys.length, 1);
  assert.equal(cache.mgetKeys[0]!.length, 640);
  assert.equal(new Set(cache.mgetKeys[0]).size, 640);
  assert.equal(cache.rowGetCalls, 0);
  assert.equal(snapshot.rows[0]!.priceEur, 1_269);
  assert.equal(snapshot.rows[1]!.priceEur, 180);
});

test("continues with healthy upstream data when the row-cache mget fails", async () => {
  const cache = new MemoryCacheStore();
  cache.mget = async () => { throw new Error("redis unavailable"); };
  const { service } = deps(cache);

  const snapshot = await service.getTopMarketCapSnapshot();

  assert.equal(snapshot.rows.length, 300);
  assert.equal(snapshot.rows[0]!.priceSource, "yahoo:relay");
});

test("pipelines row cache writes in bounded chunks with exact TTLs", async () => {
  const cache = new BatchRecordingCache();

  await deps(cache).service.getTopMarketCapSnapshot();

  assert.equal(cache.pipelineBatches.length, 2);
  assert.ok(cache.pipelineBatches.every((batch) => batch.length <= 500));
  const writes = cache.pipelineBatches.flat();
  assert.equal(writes.length, 600);
  assert.equal(writes.filter(({ key, ttlMs }) => key.endsWith(":fresh") && ttlMs === 60 * 60 * 1000).length, 300);
  assert.equal(writes.filter(({ key, ttlMs }) => key.endsWith(":last-good") && ttlMs === 30 * 24 * 60 * 60 * 1000).length, 300);
});

test("falls back to bounded nonfatal row writes when pipelines report zero writes", async () => {
  const cache = new MemoryCacheStore();
  let active = 0;
  let maxActive = 0;
  let rowWrites = 0;
  cache.pipeline = async () => 0;
  const originalSet = cache.set.bind(cache);
  cache.set = async (key, value, ttlMs) => {
    if (key.startsWith("stock:price:")) {
      active++;
      rowWrites++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
    }
    await originalSet(key, value, ttlMs);
  };

  const snapshot = await deps(cache).service.getTopMarketCapSnapshot();

  assert.equal(snapshot.rows.length, 300);
  assert.equal(rowWrites, 600);
  assert.ok(maxActive > 1);
  assert.ok(maxActive <= 4);
});

test("stops scheduling quote batches after failure and waits for active requests", async () => {
  const pendingResolves: Array<() => void> = [];
  let rejectFirst!: (error: Error) => void;
  let scheduled = 0;
  let active = 0;
  const service = new CanonicalStockService({
    cache: new MemoryCacheStore(),
    fetchImpl: async () => new Response(csv()),
    fetchStockQuotes: async () => {
      const call = scheduled++;
      active++;
      try {
        if (call === 0) {
          await new Promise<never>((_resolve, reject) => { rejectFirst = reject; });
        } else if (call < 4) {
          await new Promise<void>((resolve) => { pendingResolves.push(resolve); });
        }
        return {};
      } finally {
        active--;
      }
    },
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
  });
  let settled = false;
  let rejection: unknown;
  const refresh = service.getTopMarketCapSnapshot().then(
    () => { settled = true; },
    (error) => { settled = true; rejection = error; },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(scheduled, 4);

  rejectFirst(new Error("quote batch failed"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(settled, false);
  assert.equal(active, 3);
  for (const resolve of pendingResolves) resolve();
  await refresh;
  assert.match(String(rejection), /quote batch failed/);
  assert.equal(active, 0);
  assert.equal(scheduled, 4);
});

test("uses a fifteen-minute distributed lock for stock snapshot refreshes", async () => {
  const cache = new MemoryCacheStore();
  let lockTtlMs: number | undefined;
  const originalAdd = cache.add.bind(cache);
  cache.add = async (key, value, ttlMs) => {
    if (key === "stock:top-market-cap:lock") lockTtlMs = ttlMs;
    return originalAdd(key, value, ttlMs);
  };

  await deps(cache).service.getTopMarketCapSnapshot();

  assert.equal(lockTtlMs, 15 * 60 * 1000);
});

test("accepts non-contiguous raw CompaniesMarketCap ranks", async () => {
  const service = new CanonicalStockService({
    cache: new MemoryCacheStore(),
    fetchImpl: async () => new Response(csvWithRankGap()),
    fetchStockQuotes: async () => ({}),
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });

  const snapshot = await service.getTopMarketCapSnapshot();

  assert.equal(snapshot.rows.length, 300);
  assert.equal(snapshot.rows[3]!.rank, 4);
  assert.equal(snapshot.rows[4]!.rank, 6);
});

test("rejects more than 50 Bitpanda symbols", async () => {
  const { service } = deps();
  await assert.rejects(() => service.getPricesForBitpandaSymbols(Array.from({ length: 51 }, (_, i) => `S${i}`)), /at most 50/);
});

test("preserves and clones last-good snapshot after malformed refresh", async () => {
  const cache = new MemoryCacheStore();
  const first = deps(cache);
  const healthy = await first.service.getTopMarketCapSnapshot();
  await cache.delete("stock:top-market-cap:fresh");
  const broken = new CanonicalStockService({
    cache,
    fetchImpl: async () => new Response(csv(299)),
    fetchStockQuotes: async () => ({}),
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });
  const stale = await broken.getTopMarketCapSnapshot();
  assert.equal(stale.stale, true);
  assert.ok(stale.rows.every((row) => row.stale));
  assert.equal(healthy.stale, false);
  const cached = await cache.get<{ stale: boolean }>("stock:top-market-cap:last-good");
  assert.equal(cached!.stale, false);
});

test("serves a stale full snapshot on total upstream failure", async () => {
  const cache = new MemoryCacheStore();
  const healthy = deps(cache);
  const original = await healthy.service.getTopMarketCapSnapshot();
  await cache.delete("stock:top-market-cap:fresh");
  const failed = new CanonicalStockService({
    cache,
    fetchImpl: async () => { throw new Error("network down"); },
    fetchStockQuotes: async () => { throw new Error("must not reach quotes"); },
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });
  const stale = await failed.getTopMarketCapSnapshot();
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.rows.map((row) => row.priceEur), original.rows.map((row) => row.priceEur));
  assert.equal(original.stale, false);
});

test("uses exact TTLs for validated row and snapshot cache writes", async () => {
  const cache = new RecordingCache();
  await deps(cache).service.getTopMarketCapSnapshot();
  const ttlBySuffix = (suffix: string) => cache.writes.filter(({ key }) => key.endsWith(suffix)).map(({ ttlMs }) => ttlMs);
  assert.ok(ttlBySuffix(":fresh").includes(1 * 60 * 60 * 1000));
  assert.ok(ttlBySuffix(":last-good").includes(30 * 24 * 60 * 60 * 1000));
  assert.deepEqual(cache.writes.find(({ key }) => key === "stock:top-market-cap:fresh")?.ttlMs, 1 * 60 * 60 * 1000);
  assert.deepEqual(cache.writes.find(({ key }) => key === "stock:top-market-cap:last-good")?.ttlMs, 30 * 24 * 60 * 60 * 1000);
});

test("invalid complete snapshot writes no row or snapshot cache keys", async () => {
  const cache = new RecordingCache();
  const invalidRanks = csv().replace("2,Toyota", "1,Toyota");
  const service = new CanonicalStockService({
    cache,
    fetchImpl: async () => new Response(invalidRanks),
    fetchStockQuotes: async () => ({}),
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
  });
  await assert.rejects(() => service.getTopMarketCapSnapshot(), /Invalid or partial/);
  assert.deepEqual(cache.writes.filter(({ key }) => key.startsWith("stock:")), []);
});

test("rejects stale and future cached snapshots instead of trusting backend TTL", async () => {
  for (const generatedAt of ["2026-07-11T03:59:59.000Z", "2026-07-11T10:02:01.000Z", "not-a-date"]) {
    const cache = new MemoryCacheStore();
    const healthy = deps(cache);
    const snapshot = await healthy.service.getTopMarketCapSnapshot();
    snapshot.generatedAt = generatedAt;
    await cache.set("stock:top-market-cap:fresh", snapshot, 99_999_999);
    await cache.delete("stock:top-market-cap:last-good");
    const service = new CanonicalStockService({
      cache,
      now: () => new Date("2026-07-11T10:00:00.000Z"),
      fetchImpl: async () => { throw new Error("refresh attempted"); },
      fetchStockQuotes: async () => ({}),
      fetchStockFxQuotes: async () => ({}),
      getUsdToEur: async () => 0.9,
    });
    await assert.rejects(() => service.getTopMarketCapSnapshot(), /refresh attempted/);
  }
});

test("accepts a stale snapshot row older than 1h but younger than 30d", async () => {
  const cache = new MemoryCacheStore();
  const snapshot = await deps(cache).service.getTopMarketCapSnapshot();
  snapshot.rows[0]!.stale = true;
  snapshot.rows[0]!.updatedAt = "2026-06-21T10:00:00.000Z";
  snapshot.rows[0]!.errors = [{ code: "price_unavailable", message: "Using last-good price" }];
  snapshot.stats.pricedFresh--;
  snapshot.stats.pricedStale++;
  await cache.set("stock:top-market-cap:fresh", snapshot, 99_999_999);
  await cache.delete("stock:top-market-cap:last-good");
  const service = new CanonicalStockService({
    cache,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
    fetchImpl: async () => { throw new Error("valid stale row must not refresh"); },
    fetchStockQuotes: async () => ({}),
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
  });
  const result = await service.getTopMarketCapSnapshot(1);
  assert.equal(result.rows[0]!.stale, true);
  assert.equal(result.rows[0]!.updatedAt, "2026-06-21T10:00:00.000Z");
});

test("rejects a stale snapshot row older than 30d", async () => {
  const cache = new MemoryCacheStore();
  const snapshot = await deps(cache).service.getTopMarketCapSnapshot();
  snapshot.rows[0]!.stale = true;
  snapshot.rows[0]!.updatedAt = "2026-06-10T09:59:59.000Z";
  snapshot.rows[0]!.errors = [{ code: "price_unavailable", message: "Using last-good price" }];
  snapshot.stats.pricedFresh--;
  snapshot.stats.pricedStale++;
  await cache.set("stock:top-market-cap:fresh", snapshot, 99_999_999);
  await cache.delete("stock:top-market-cap:last-good");
  const service = new CanonicalStockService({
    cache,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
    fetchImpl: async () => { throw new Error("expired stale row refreshed"); },
    fetchStockQuotes: async () => ({}),
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
  });
  await assert.rejects(() => service.getTopMarketCapSnapshot(), /expired stale row refreshed/);
});

test("rejects rows whose array order does not match exact ranks", async () => {
  const cache = new MemoryCacheStore();
  const snapshot = await deps(cache).service.getTopMarketCapSnapshot();
  [snapshot.rows[0], snapshot.rows[1]] = [snapshot.rows[1]!, snapshot.rows[0]!];
  await cache.set("stock:top-market-cap:fresh", snapshot, 99_999_999);
  await cache.delete("stock:top-market-cap:last-good");
  const service = new CanonicalStockService({
    cache,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
    fetchImpl: async () => { throw new Error("unordered rows refreshed"); },
    fetchStockQuotes: async () => ({}),
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
  });
  await assert.rejects(() => service.getTopMarketCapSnapshot(), /unordered rows refreshed/);
});

test("rejects expired last-good snapshot and malformed cached contract fields", async () => {
  const mutations: Array<(snapshot: Awaited<ReturnType<CanonicalStockService["getTopMarketCapSnapshot"]>>) => void> = [
    (snapshot) => { snapshot.generatedAt = "2026-06-10T10:00:00.000Z"; },
    (snapshot) => { snapshot.rows[1]!.rank = 1; },
    (snapshot) => { snapshot.rows[0]!.company = ""; },
    (snapshot) => { snapshot.rows[0]!.updatedAt = "2026-06-10T10:00:00.000Z"; },
    (snapshot) => { snapshot.rows[0]!.errors = [] as never; snapshot.rows[0]!.priceEur = null; },
    (snapshot) => { snapshot.rows[0]!.bitpandaAliases = [42 as unknown as string]; },
    (snapshot) => { snapshot.stats.pricedFresh--; snapshot.stats.unpriced++; },
    (snapshot) => { snapshot.universeSource = "other" as "companiesmarketcap"; },
    (snapshot) => { snapshot.rows[0]!.yahooTicker = 42 as unknown as string; },
    (snapshot) => { snapshot.rows[0]!.errors = [{ code: "", message: "bad" }]; },
  ];
  for (const mutate of mutations) {
    const cache = new MemoryCacheStore();
    const snapshot = await deps(cache).service.getTopMarketCapSnapshot();
    mutate(snapshot);
    await cache.delete("stock:top-market-cap:fresh");
    await cache.set("stock:top-market-cap:last-good", snapshot, 99_999_999);
    const service = new CanonicalStockService({
      cache,
      now: () => new Date("2026-07-11T10:00:00.000Z"),
      fetchImpl: async () => { throw new Error("upstream failed"); },
      fetchStockQuotes: async () => ({}),
      fetchStockFxQuotes: async () => ({}),
      getUsdToEur: async () => 0.9,
    });
    await assert.rejects(() => service.getTopMarketCapSnapshot(), /upstream failed/);
  }
});

test("rejects expired or future per-row caches independently of backend TTL", async () => {
  const cache = new MemoryCacheStore();
  await deps(cache).service.getTopMarketCapSnapshot();
  const cachedPrice = {
    priceNative: 10,
    currency: "USD",
    priceEur: 9,
    priceSource: "yahoo:relay",
    fallbackSource: null,
    appliedRatio: 1,
    stale: false,
    updatedAt: "2026-07-11T03:59:59.000Z",
    errors: [],
  };
  await cache.set("stock:price:OUTSIDE:fresh", cachedPrice, 99_999_999);
  await cache.set("stock:price:OUTSIDE:last-good", { ...cachedPrice, updatedAt: "2026-06-10T10:00:00.000Z" }, 99_999_999);
  let quoteCalls = 0;
  const service = new CanonicalStockService({
    cache,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
    fetchImpl: async () => { throw new Error("top cache should be used"); },
    fetchStockQuotes: async () => { quoteCalls++; return {}; },
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
  });
  const result = await service.getPricesForBitpandaSymbols(["OUTSIDE"]);
  assert.equal(quoteCalls, 1);
  assert.equal(result.OUTSIDE!.priceEur, null);

  await cache.set("stock:price:OUTSIDE:fresh", { ...cachedPrice, updatedAt: "2026-07-11T10:02:01.000Z" }, 99_999_999);
  await service.getPricesForBitpandaSymbols(["OUTSIDE"]);
  assert.equal(quoteCalls, 2);
});

test("serves stale per-row last-good when explicit Bitpanda quote refresh fails", async () => {
  const cache = new MemoryCacheStore();
  const cachedPrice = {
    priceNative: 10,
    currency: "USD",
    priceEur: 9,
    priceSource: "yahoo:relay",
    fallbackSource: null,
    appliedRatio: 1,
    stale: false,
    updatedAt: "2026-07-10T10:00:00.000Z",
    errors: [],
  };
  await cache.set("stock:price:OUTSIDE:last-good", cachedPrice, 30 * 24 * 60 * 60 * 1000);
  const service = new CanonicalStockService({
    cache,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
    fetchImpl: async () => { throw new Error("top unavailable"); },
    fetchStockQuotes: async () => { throw new Error("quote relay down"); },
    fetchStockFxQuotes: async () => { throw new Error("fx relay must not be required"); },
    getUsdToEur: async () => { throw new Error("usd fx must not be required"); },
  });

  const result = await service.getPricesForBitpandaSymbols(["OUTSIDE"]);

  assert.equal(result.OUTSIDE!.priceEur, 9);
  assert.equal(result.OUTSIDE!.stale, true);
  assert.equal(result.OUTSIDE!.errors.at(-1)?.code, "price_unavailable");
});

test("uses CompaniesMarketCap fallback when Yahoo is unavailable", async () => {
  const service = new CanonicalStockService({
    cache: new MemoryCacheStore(),
    fetchImpl: async () => new Response(csv()),
    fetchStockQuotes: async () => ({}),
    fetchStockFxQuotes: async () => ({}),
    getUsdToEur: async () => 0.9,
  });
  const row = (await service.getTopMarketCapSnapshot()).rows[0]!;
  assert.equal(row.priceEur, 1411 * 0.9);
  assert.equal(row.priceSource, "companiesmarketcap");
});

test("converts GBX quotes as pence at service level", async () => {
  const service = new CanonicalStockService({
    cache: new MemoryCacheStore(),
    fetchImpl: async () => new Response(csv()),
    fetchStockQuotes: async (symbols) => Object.fromEntries(symbols.map((symbol) => [symbol, {
      priceNative: symbol === "TEST4" ? 720 : 10,
      currency: symbol === "TEST4" ? "GBX" : "USD",
      yahooTicker: symbol,
      source: "yahoo:relay",
    }])),
    fetchStockFxQuotes: async () => ({ GBP: { unitsPerEur: 0.8, currency: "GBP", yahooTicker: "EURGBP=X", source: "yahoo:relay" } }),
    getUsdToEur: async () => 0.9,
  });
  const row = (await service.getTopMarketCapSnapshot()).rows[3]!;
  assert.equal(row.priceEur, 9);
  assert.equal(row.currency, "GBX");
});

test("uses a stale per-row last-good price when a refreshed source drifts", async () => {
  const cache = new MemoryCacheStore();
  const first = deps(cache);
  const healthy = await first.service.getTopMarketCapSnapshot();
  await cache.delete("stock:top-market-cap:fresh");
  const drifting = new CanonicalStockService({
    cache,
    fetchImpl: async () => new Response(csv()),
    fetchStockQuotes: async () => ({
      "000660.KS": { priceNative: 20_000_000, currency: "KRW", yahooTicker: "000660.KS", source: "yahoo:relay" },
    }),
    fetchStockFxQuotes: async () => ({
      KRW: { unitsPerEur: 1717.17, currency: "KRW", yahooTicker: "EURKRW=X", source: "yahoo:relay" },
    }),
    getUsdToEur: async () => 0.9,
    now: () => new Date("2026-07-11T10:00:00.000Z"),
  });
  const refreshed = await drifting.getTopMarketCapSnapshot();
  assert.equal(refreshed.rows[0]!.priceEur, healthy.rows[0]!.priceEur);
  assert.equal(refreshed.rows[0]!.stale, true);
  assert.equal(refreshed.rows[0]!.errors.at(-1)?.code, "source_drift");
  assert.equal(refreshed.stats.pricedStale, 1);
});

test("cache write failures are nonfatal and lock contention serves last-good", async () => {
  const { service, cache } = deps();
  const lastGood = await service.getTopMarketCapSnapshot();
  await cache.delete("stock:top-market-cap:fresh");
  await cache.add("stock:top-market-cap:lock", true, 60_000);
  const contended = await service.getTopMarketCapSnapshot();
  assert.equal(contended.stale, true);
  assert.equal(contended.rows.length, lastGood.rows.length);

  const failingCache = new MemoryCacheStore();
  failingCache.set = async () => { throw new Error("write failed"); };
  const healthy = deps(failingCache);
  assert.equal((await healthy.service.getTopMarketCapSnapshot()).rows.length, 300);
});

test("lock contention without last-good throws a typed unavailable error", async () => {
  const cache = new MemoryCacheStore();
  await cache.add("stock:top-market-cap:lock", true, 60_000);
  const { service } = deps(cache);
  await assert.rejects(() => service.getTopMarketCapSnapshot(), StockServiceUnavailableError);
});
