import { MemoryCacheStore } from "./memory-cache.js";
import type { AtomicCacheStore, CacheStore } from "./types.js";

const COMPARE_AND_DELETE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0`;

const COMPARE_AND_SET_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if (ARGV[1] == "0" and current ~= false) or (ARGV[1] == "1" and current ~= ARGV[2]) then
  return 0
end
if ARGV[4] ~= "" then
  redis.call("SET", KEYS[1], ARGV[3], "PX", ARGV[4])
else
  redis.call("SET", KEYS[1], ARGV[3])
end
return 1`;

const INCREMENT_WITH_TTL_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return count`;

export interface RedisClient {
  connect(): Promise<unknown>;
  ping(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  scan(cursor: string, ...args: (string | number)[]): Promise<[string, string[]]>;
  mget(keys: string[]): Promise<(string | null)[]>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
  pipeline(): {
    set(key: string, value: string, ...args: (string | number)[]): void;
    exec(): Promise<[Error | null, unknown][] | null>;
  };
}

export function pipelineExecError(results: Array<[Error | null, unknown]> | null, expectedCount: number): Error | undefined {
  if (results === null) return new Error("Redis pipeline returned no results");
  if (results.length !== expectedCount) {
    return new Error(`Redis pipeline returned ${results.length} of ${expectedCount} results`);
  }
  const commandError = results.find(([error]) => error !== null)?.[0];
  if (commandError) return commandError;
  return undefined;
}

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

export type CacheStoreWithErrors = CacheStore & { readonly errorCount: number };
export type RedisCacheStore = AtomicCacheStore & { readonly errorCount: number };

export function createRedisCacheStore(
  client: RedisClient,
  options: Pick<RedisCacheOptions, "keyPrefix" | "onError"> = {},
): RedisCacheStore {
  const { keyPrefix = "wcore:", onError } = options;
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

  return {
    backend: "redis",
    get errorCount() { return errorCount; },
    async isAvailable(): Promise<boolean> {
      try {
        await client.ping();
        return true;
      } catch (err) {
        reportError("ping", err);
        return false;
      }
    },
    async get<T>(key: string): Promise<T | undefined> {
      try {
        const raw = await client.get(key);
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
        if (ttlMs && ttlMs > 0) await client.set(key, data, "PX", ttlMs);
        else await client.set(key, data);
      } catch (err) {
        reportError("set", err);
      }
    },
    async add<T>(key: string, value: T, ttlMs?: number): Promise<boolean> {
      try {
        const data = JSON.stringify(value);
        const res = ttlMs && ttlMs > 0
          ? await client.set(key, data, "PX", ttlMs, "NX")
          : await client.set(key, data, "NX");
        return res === "OK";
      } catch (err) {
        reportError("add", err);
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
          try { return JSON.parse(raw) as T; } catch { return undefined; }
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
        if (op.ttlMs && op.ttlMs > 0) pipe.set(op.key, serialized, "PX", op.ttlMs);
        else pipe.set(op.key, serialized);
      }
      try {
        const resultError = pipelineExecError(await pipe.exec(), ops.length);
        if (resultError) {
          reportError("pipeline", resultError);
          return 0;
        }
        return ops.length;
      } catch (err) {
        reportError("pipeline", err);
        return 0;
      }
    },
    async compareAndDelete<T>(key: string, expected: T): Promise<boolean> {
      try {
        return await client.eval(COMPARE_AND_DELETE_SCRIPT, 1, key, JSON.stringify(expected)) === 1;
      } catch (err) {
        reportError("compareAndDelete", err);
        return false;
      }
    },
    async compareAndSet<T>(key: string, expected: T | undefined, next: T, ttlMs?: number): Promise<boolean> {
      try {
        const expectedPresent = expected === undefined ? "0" : "1";
        const serializedExpected = expected === undefined ? "" : JSON.stringify(expected);
        const serializedNext = JSON.stringify(next);
        const serializedTtl = ttlMs && ttlMs > 0 ? String(ttlMs) : "";
        return await client.eval(
          COMPARE_AND_SET_SCRIPT,
          1,
          key,
          expectedPresent,
          serializedExpected,
          serializedNext,
          serializedTtl,
        ) === 1;
      } catch (err) {
        reportError("compareAndSet", err);
        return false;
      }
    },
    async incrementWithTtl(key: string, ttlMs: number): Promise<number> {
      if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new RangeError("ttlMs must be a positive integer");
      try {
        return Number(await client.eval(INCREMENT_WITH_TTL_SCRIPT, 1, key, String(ttlMs)));
      } catch (err) {
        reportError("incrementWithTtl", err);
        throw err;
      }
    },
  };
}

export async function createCacheStore(options: RedisCacheOptions = {}): Promise<CacheStoreWithErrors> {
  const { host = "127.0.0.1", port = 6380, password = "", keyPrefix = "wcore:", onError, onFallback } = options;

  try {
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
    return createRedisCacheStore(client, { keyPrefix, onError });
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
