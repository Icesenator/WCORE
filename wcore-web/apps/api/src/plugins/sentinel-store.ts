import type { CacheStore } from "@wcore/core";
import { exposuresFromScans, type ExposureInput, type ScanResult } from "@wcore/shared";

export interface WalletScanReader {
  walletScan: {
    findMany(args: {
      where: { userId: string }; orderBy: { createdAt: "desc" }; distinct: ["address"]; take: number; select: { result: true };
    }): Promise<{ result: unknown }[]>;
  };
}

/**
 * Expositions d'UN utilisateur : dernier scan de chacune de SES adresses (filtre userId
 * cote base). Sans scan, aucune exposition, donc NOT_COVERED et jamais un zero atteste.
 */
export async function exposuresForUser(db: WalletScanReader, userId: string, chainKeys: string[]): Promise<ExposureInput[]> {
  if (!userId) return [];
  const rows = await db.walletScan.findMany({
    where: { userId }, orderBy: { createdAt: "desc" }, distinct: ["address"], take: 50, select: { result: true },
  }).catch(() => [] as { result: unknown }[]);
  const scans = rows.map((r) => r.result as ScanResult).filter((r) => !!r && Array.isArray((r as { chains?: unknown }).chains));
  return exposuresFromScans(scans, chainKeys);
}

/**
 * Chain Sentinel — magasin durable.
 *
 * Le registre valide, l'etat des sources, les propositions, les accuses de reception
 * et l'historique sont des donnees de reference : ils ne doivent pas dependre de la
 * politique d'eviction ni de la persistance de Redis. Ils vont dans PostgreSQL
 * (table `sentinel_state`, migration 20261107150000_add_sentinel_state).
 *
 * Seul le verrou de collecte (`add`, SET NX PX) reste dans Redis : il est ephemere par
 * nature, et Redis le partage entre instances. En cas d'erreur PostgreSQL, les lectures
 * et ecritures levent : la route repond 500 plutot que de servir un etat vide.
 */
export interface SqlClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export function createSentinelStore(sql: SqlClient, lock: Pick<CacheStore, "add" | "delete">): CacheStore {
  const LOCK_PREFIX = "sentinel:v1:lock";
  const isLock = (key: string) => key === LOCK_PREFIX || key.startsWith(`${LOCK_PREFIX}:`);

  const get = async <T>(key: string): Promise<T | undefined> => {
    const rows = await sql.$queryRawUnsafe<{ value: T }[]>(`SELECT "value" FROM "sentinel_state" WHERE "key" = $1`, key);
    return rows.length ? rows[0]!.value : undefined;
  };

  return {
    get,
    async set<T>(key: string, value: T): Promise<void> {
      if (isLock(key)) throw new Error("sentinel lock must be taken with add()");
      await sql.$executeRawUnsafe(
        `INSERT INTO "sentinel_state" ("key", "value", "updated_at") VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = CURRENT_TIMESTAMP`,
        key, JSON.stringify(value ?? null),
      );
    },
    async delete(key: string): Promise<void> {
      if (isLock(key)) return lock.delete(key);
      await sql.$executeRawUnsafe(`DELETE FROM "sentinel_state" WHERE "key" = $1`, key);
    },
    async clear(): Promise<void> {
      throw new Error("sentinel store cannot be cleared");
    },
    async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
      return Promise.all(keys.map((k) => get<T>(k)));
    },
    async add<T>(key: string, value: T, ttlMs?: number): Promise<boolean> {
      if (!isLock(key)) throw new Error("only the sentinel lock uses add()");
      return lock.add(key, value, ttlMs);
    },
  } as CacheStore;
}
