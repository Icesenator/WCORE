import type { CacheStore } from "./types.js";

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

export class MemoryCacheStore implements CacheStore {
  private store = new Map<string, MemoryEntry>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const expiresAt = ttlMs && ttlMs > 0 ? Date.now() + ttlMs : Number.POSITIVE_INFINITY;
    this.store.set(key, { value, expiresAt });
  }

  async add<T>(key: string, value: T, ttlMs?: number): Promise<boolean> {
    // Atomic within Node's single-threaded event loop: no await between the
    // existence check and the write.
    const existing = this.store.get(key);
    if (existing && Date.now() <= existing.expiresAt) return false;
    const expiresAt = ttlMs && ttlMs > 0 ? Date.now() + ttlMs : Number.POSITIVE_INFINITY;
    this.store.set(key, { value, expiresAt });
    return true;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  /** Atomic increment: read → +1 → write within the same event-loop tick. */
  async incr(key: string, ttlSec: number): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);
    if (entry && now <= entry.expiresAt) {
      const next = (entry.value as number) + 1;
      this.store.set(key, { value: next, expiresAt: now + ttlSec * 1000 });
      return next;
    }
    this.store.set(key, { value: 1, expiresAt: now + ttlSec * 1000 });
    return 1;
  }

  async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
    const now = Date.now();
    return keys.map((key) => {
      const entry = this.store.get(key);
      if (!entry) return undefined;
      if (now > entry.expiresAt) {
        this.store.delete(key);
        return undefined;
      }
      return entry.value as T;
    });
  }

  async pipeline(ops: Array<{ key: string; value: unknown; ttlMs?: number }>): Promise<number> {
    const now = Date.now();
    for (const op of ops) {
      const expiresAt = op.ttlMs && op.ttlMs > 0 ? now + op.ttlMs : Number.POSITIVE_INFINITY;
      this.store.set(op.key, { value: op.value, expiresAt });
    }
    return ops.length;
  }
}
