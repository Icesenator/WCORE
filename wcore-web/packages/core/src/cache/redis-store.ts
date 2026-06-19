import { MemoryCacheStore } from "./memory-cache.js";
import type { CacheStore } from "./types.js";

export interface RedisCacheOptions {
  host?: string;
  port?: number;
  password?: string;
  keyPrefix?: string;
  onError?: (op: string, err: unknown) => void;
  // Called once when Redis is unreachable at startup and the store falls
  // back to in-memory. Cross-request sharing and persistence are lost in
  // that mode — the host process needs to surface this to operators.
  onFallback?: (err: unknown) => void;
}

export async function createCacheStore(options: RedisCacheOptions = {}): Promise<CacheStore & { errorCount: number }> {
  const { host = "127.0.0.1", port = 6380, password = "", keyPrefix = "wcore:", onError, onFallback } = options;

  let errorCount = 0;
  const lastErrorTime: Record<string, number> = {};
  const ERROR_COOLDOWN_MS = 60_000;

  const reportError = (op: string, err: unknown) => {
    errorCount++;
    const now = Date.now();
    if (onError && (!lastErrorTime[op] || now - lastErrorTime[op] >= ERROR_COOLDOWN_MS)) {
      lastErrorTime[op] = now;
      onError(op, err);
    }
  };

  try {
    // Minimal structural type for the ioredis methods this store uses.
    interface RedisClient {
      connect(): Promise<unknown>;
      ping(): Promise<unknown>;
      get(key: string): Promise<string | null>;
      set(key: string, value: string, ...args: (string | number)[]): Promise<string | null>;
      del(...keys: string[]): Promise<number>;
      scan(cursor: string, ...args: (string | number)[]): Promise<[string, string[]]>;
      mget(keys: string[]): Promise<(string | null)[]>;
      incr(key: string): Promise<number>;
      expire(key: string, seconds: number): Promise<number>;
      pipeline(): {
        set(key: string, value: string, ...args: (string | number)[]): void;
        exec(): Promise<[Error | null, unknown][]>;
      };
    }
    const RedisModule = await import("ioredis");
    // ioredis ESM/CJS interop — default export varies by bundler
    const mod = RedisModule as { default?: unknown };
    const RedisConstructor = (mod.default ?? RedisModule) as new (opts: Record<string, unknown>) => RedisClient;
    const client = new RedisConstructor({
      host, port, password, keyPrefix,
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });
    await client.connect();
    await client.ping();

    return {
      errorCount,  // mutated by reference via closures below
      async get<T>(key: string): Promise<T | undefined> {
        try {
          const raw: string | null = await client.get(key);
          if (!raw) return undefined;
          return JSON.parse(raw) as T;
        } catch (err) {
          reportError("get", err);
          return undefined;
        }
      },
      async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
        try {
          const data = JSON.stringify(value);
          if (ttlMs) {
            await client.set(key, data, "PX", ttlMs);
          } else {
            await client.set(key, data);
          }
        } catch (err) {
          reportError("set", err);
        }
      },
      async add<T>(key: string, value: T, ttlMs?: number): Promise<boolean> {
        try {
          const data = JSON.stringify(value);
          const res = ttlMs
            ? await client.set(key, data, "PX", ttlMs, "NX")
            : await client.set(key, data, "NX");
          return res === "OK";
        } catch (err) {
          reportError("add", err);
          // Fail closed: if we can't guarantee the atomic claim, report
          // not-claimed so callers reject (e.g. refresh-token single-use).
          return false;
        }
      },
      async delete(key: string): Promise<void> {
        try { await client.del(key); } catch (err) { reportError("delete", err); }
      },
      async clear(): Promise<void> {
        try {
          let cursor = "0";
          do {
            const [nextCursor, keys] = await client.scan(cursor, "MATCH", `${keyPrefix}*`, "COUNT", 100);
            cursor = nextCursor;
            if (keys.length) await client.del(...keys);
          } while (cursor !== "0");
        } catch (err) { reportError("clear", err); }
      },
      async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
        try {
          const raws = await client.mget(keys);
          return raws.map((raw) => {
            if (!raw) return undefined;
            try { return JSON.parse(raw) as T; }
            catch { return undefined; }
          });
        } catch (err) {
          reportError("mget", err);
          return keys.map(() => undefined);
        }
      },
      async incr(key: string, ttlSec: number): Promise<number> {
        const count = await client.incr(key);
        await client.expire(key, ttlSec).catch(() => { /* best-effort */ });
        return count;
      },
      async pipeline(ops: Array<{ key: string; value: unknown; ttlMs?: number }>): Promise<number> {
        if (ops.length === 0) return 0;
        const pipe = client.pipeline();
        for (const op of ops) {
          const serialized = JSON.stringify(op.value);
          if (op.ttlMs && op.ttlMs > 0) {
            pipe.set(op.key, serialized, "PX", op.ttlMs);
          } else {
            pipe.set(op.key, serialized);
          }
        }
        try {
          await pipe.exec();
          return ops.length;
        } catch (err) {
          reportError("pipeline", err);
          return 0;
        }
      },
    };
  } catch (err) {
    // Surface the failure: callers can subscribe via onFallback to log
    // through their own structured logger; otherwise emit a console.warn so
    // the degradation is never silent.
    if (onFallback) {
      try { onFallback(err); } catch { /* swallow logger errors */ }
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[cache] Redis unreachable at ${host}:${port} — falling back to in-memory store. Cache will not persist or be shared across processes. Cause: ${msg}`);
    }
    return Object.assign(new MemoryCacheStore(), { errorCount: 0 });
  }
}
