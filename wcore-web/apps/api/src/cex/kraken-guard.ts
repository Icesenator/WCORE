import { createHash, createHmac } from "node:crypto";

/**
 * Appelant UNIQUE de l'API privee Kraken (P2-DATA-KRAKEN-VIA-API).
 *
 * Kraken exige un nonce strictement croissant par cle : deux clients qui partagent une
 * cle (classeur + site, ou deux instances Railway pendant un deploiement) produisent
 * des « Invalid nonce », puis un « EGeneral:Temporary lockout ». Tous les appels
 * Balance de l'API passent donc par ce module, qui reprend les gardes du classeur :
 *
 * - serialisation par compte : un bail (lease) en base, pris par un seul UPDATE
 *   atomique, valable entre instances ;
 * - nonce persistant : GREATEST(dernier + 1, horloge en microsecondes), en base ;
 * - pause persistante de 60 min apres un Temporary lockout, sans aucune relance ;
 * - intervalle minimal entre deux appels reels, et reutilisation du dernier passage
 *   (5 min) pour un clic manuel ou une relance du classeur.
 *
 * Le module ne renvoie que la carte brute Balance (actif Kraken -> quantite) : le
 * classement xStocks/fiat/crypto et les prix restent cote classeur.
 */

export type KrakenCredentials = { apiKey: string; apiSecret: string };
export type KrakenBalanceMap = Record<string, string>;

export const KRAKEN_LOCKOUT_PAUSE_MS = 60 * 60_000;
export const KRAKEN_REUSE_MS = 5 * 60_000;
export const KRAKEN_MIN_INTERVAL_MS = 60_000;
export const KRAKEN_LEASE_MS = 45_000;
const KRAKEN_TIMEOUT_MS = 30_000;
const KRAKEN_MAX_ASSETS = 5_000;

export type KrakenClaim =
  | { kind: "claimed"; nonce: string }
  | { kind: "paused"; untilMs: number }
  | { kind: "busy" }
  | { kind: "too_soon" };

export interface KrakenGuardStore {
  /** Prend le bail et le nonce en une operation atomique, ou dit pourquoi c'est refuse. */
  claim(accountId: string, nowMs: number, nonceCandidate: string): Promise<KrakenClaim>;
  /** Rend le bail ; arme la pause si `lockoutUntilMs` est fourni. */
  release(accountId: string, outcome: { okAtMs?: number; lockoutUntilMs?: number }): Promise<void>;
}

export type KrakenGuardReason = "kraken_paused" | "kraken_busy" | "kraken_too_soon";

/**
 * Refus local : AUCUN appel n'est parti vers Kraken (sauf `kraken_paused` arme par la
 * reponse qui vient d'arriver). Le texte reste stable et ne contient jamais de corps
 * distant. « temporary lockout » et « rate limit » sont gardes pour que
 * describeCexSyncFailure classe ces refus en rate_limited_by_exchange.
 */
export class KrakenGuardError extends Error {
  constructor(readonly reason: KrakenGuardReason, readonly resumeAtMs?: number) {
    super(reason === "kraken_paused"
      ? `Kraken guard: temporary lockout pause until ${new Date(resumeAtMs ?? 0).toISOString()} (no call sent)`
      : reason === "kraken_busy"
      ? "Kraken guard: rate limit, another call is in flight (no call sent)"
      : "Kraken guard: rate limit, minimum interval not elapsed (no call sent)");
    this.name = "KrakenGuardError";
  }
}

export interface KrakenBalanceResult {
  balances: KrakenBalanceMap;
  fetchedAtMs: number;
  reused: boolean;
}

export interface KrakenBalanceReader {
  readBalances(accountId: string, creds: KrakenCredentials): Promise<KrakenBalanceResult>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

// Signature Kraken = HMAC-SHA512(path + SHA256(nonce + postData), base64decode(secret)).
export function signKrakenRequest(path: string, nonce: string, postData: string, apiSecret: string): string {
  const hash = createHash("sha256").update(nonce + postData).digest();
  return createHmac("sha512", Buffer.from(apiSecret, "base64")).update(Buffer.from(path)).update(hash).digest("base64");
}

function parseBalanceMap(result: unknown): KrakenBalanceMap {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Kraken Balance: unexpected result shape");
  const entries = Object.entries(result as Record<string, unknown>);
  if (entries.length > KRAKEN_MAX_ASSETS) throw new Error("Kraken Balance: too many assets");
  const out: KrakenBalanceMap = {};
  for (const [asset, amount] of entries) {
    if (typeof asset !== "string" || asset.length === 0 || asset.length > 64) throw new Error("Kraken Balance: invalid asset key");
    const text = typeof amount === "number" ? String(amount) : amount;
    if (typeof text !== "string" || !/^\d+(\.\d+)?$/.test(text.trim())) throw new Error("Kraken Balance: invalid amount");
    out[asset] = text.trim();
  }
  return out;
}

async function postBalance(creds: KrakenCredentials, nonce: string, fetchImpl: FetchLike): Promise<KrakenBalanceMap> {
  const path = "/0/private/Balance";
  const body = "nonce=" + nonce;
  const res = await fetchImpl(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "API-Key": creds.apiKey,
      "API-Sign": signKrakenRequest(path, nonce, body, creds.apiSecret),
    },
    body,
    signal: AbortSignal.timeout(KRAKEN_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kraken ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  const json = text ? JSON.parse(text) as { error?: unknown; result?: unknown } : null;
  if (Array.isArray(json?.error) && json.error.length > 0) throw new Error(`Kraken error: ${json.error.join(", ")}`);
  return parseBalanceMap(json?.result ?? null);
}

export function createKrakenBalanceReader(deps: { store: KrakenGuardStore; fetchImpl?: FetchLike; now?: () => number }): KrakenBalanceReader {
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  const now = deps.now ?? Date.now;
  const memo = new Map<string, { balances: KrakenBalanceMap; fetchedAtMs: number }>();
  const inflight = new Map<string, Promise<KrakenBalanceResult>>();

  async function callOnce(accountId: string, creds: KrakenCredentials): Promise<KrakenBalanceResult> {
    const startMs = now();
    const claim = await deps.store.claim(accountId, startMs, String(BigInt(startMs) * 1000n));
    if (claim.kind === "paused") throw new KrakenGuardError("kraken_paused", claim.untilMs);
    if (claim.kind === "busy") throw new KrakenGuardError("kraken_busy");
    if (claim.kind === "too_soon") throw new KrakenGuardError("kraken_too_soon");
    let balances: KrakenBalanceMap;
    try {
      balances = await postBalance(creds, claim.nonce, fetchImpl);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (/temporary lockout/i.test(raw)) {
        // Jamais de relance : la pause est persistee avant de repondre.
        const untilMs = now() + KRAKEN_LOCKOUT_PAUSE_MS;
        await deps.store.release(accountId, { lockoutUntilMs: untilMs }).catch(() => {});
        throw new KrakenGuardError("kraken_paused", untilMs);
      }
      await deps.store.release(accountId, {}).catch(() => {});
      throw e;
    }
    const fetchedAtMs = now();
    memo.set(accountId, { balances, fetchedAtMs });
    // Un echec d'ecriture ici laisse expirer le bail (45 s) : jamais de second appel en parallele.
    await deps.store.release(accountId, { okAtMs: fetchedAtMs }).catch(() => {});
    return { balances, fetchedAtMs, reused: false };
  }

  return {
    async readBalances(accountId, creds) {
      const recent = memo.get(accountId);
      if (recent && now() - recent.fetchedAtMs >= 0 && now() - recent.fetchedAtMs < KRAKEN_REUSE_MS) {
        return { balances: { ...recent.balances }, fetchedAtMs: recent.fetchedAtMs, reused: true };
      }
      const pending = inflight.get(accountId);
      if (pending) return pending.then((r) => ({ ...r, balances: { ...r.balances }, reused: true }));
      const run = callOnce(accountId, creds).finally(() => inflight.delete(accountId));
      inflight.set(accountId, run);
      return run;
    },
  };
}

export interface SqlClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

const T = `"kraken_call_state"`;

/**
 * Magasin PostgreSQL (table `kraken_call_state`, migration 20261123200000). Les
 * horodatages sont des BIGINT en millisecondes, le nonce un BIGINT (~1,8e15) relu
 * en texte pour ne jamais passer par un Number JavaScript.
 */
export function createPrismaKrakenGuardStore(sql: SqlClient): KrakenGuardStore {
  return {
    async claim(accountId, nowMs, nonceCandidate) {
      const rows = await sql.$queryRawUnsafe<{ nonce: string }[]>(
        `INSERT INTO ${T} ("account_id", "last_nonce", "lease_until_ms", "last_call_ms", "updated_at")
         VALUES ($1, $2::bigint, $3::bigint, $4::bigint, now())
         ON CONFLICT ("account_id") DO UPDATE SET
           "last_nonce" = GREATEST(${T}."last_nonce" + 1, EXCLUDED."last_nonce"),
           "lease_until_ms" = EXCLUDED."lease_until_ms",
           "last_call_ms" = EXCLUDED."last_call_ms",
           "updated_at" = now()
         WHERE (${T}."lease_until_ms" IS NULL OR ${T}."lease_until_ms" <= $4::bigint)
           AND (${T}."lockout_until_ms" IS NULL OR ${T}."lockout_until_ms" <= $4::bigint)
           AND (${T}."last_call_ms" IS NULL OR ${T}."last_call_ms" <= $5::bigint)
         RETURNING "last_nonce"::text AS "nonce"`,
        accountId, nonceCandidate, String(nowMs + KRAKEN_LEASE_MS), String(nowMs), String(nowMs - KRAKEN_MIN_INTERVAL_MS),
      );
      if (rows.length === 1 && /^\d+$/.test(rows[0]!.nonce)) return { kind: "claimed", nonce: rows[0]!.nonce };
      const state = await sql.$queryRawUnsafe<{ lockout: string | null; lease: string | null }[]>(
        `SELECT "lockout_until_ms"::text AS "lockout", "lease_until_ms"::text AS "lease" FROM ${T} WHERE "account_id" = $1`,
        accountId,
      );
      const lockout = Number(state[0]?.lockout ?? 0);
      if (lockout > nowMs) return { kind: "paused", untilMs: lockout };
      if (Number(state[0]?.lease ?? 0) > nowMs) return { kind: "busy" };
      return { kind: "too_soon" };
    },
    async release(accountId, outcome) {
      await sql.$executeRawUnsafe(
        `UPDATE ${T} SET "lease_until_ms" = NULL,
           "lockout_until_ms" = COALESCE($2::bigint, "lockout_until_ms"),
           "last_ok_ms" = COALESCE($3::bigint, "last_ok_ms"),
           "updated_at" = now()
         WHERE "account_id" = $1`,
        accountId,
        outcome.lockoutUntilMs == null ? null : String(outcome.lockoutUntilMs),
        outcome.okAtMs == null ? null : String(outcome.okAtMs),
      );
    },
  };
}

/** Magasin en memoire, meme semantique que PostgreSQL (tests). */
export function createMemoryKrakenGuardStore(): KrakenGuardStore & { rows: Map<string, { lastNonce: bigint; leaseUntilMs: number | null; lockoutUntilMs: number | null; lastCallMs: number | null; lastOkMs: number | null }> } {
  const rows = new Map<string, { lastNonce: bigint; leaseUntilMs: number | null; lockoutUntilMs: number | null; lastCallMs: number | null; lastOkMs: number | null }>();
  return {
    rows,
    async claim(accountId, nowMs, nonceCandidate) {
      const row = rows.get(accountId);
      const candidate = BigInt(nonceCandidate);
      if (row) {
        if (row.lockoutUntilMs != null && row.lockoutUntilMs > nowMs) return { kind: "paused", untilMs: row.lockoutUntilMs };
        if (row.leaseUntilMs != null && row.leaseUntilMs > nowMs) return { kind: "busy" };
        if (row.lastCallMs != null && row.lastCallMs > nowMs - KRAKEN_MIN_INTERVAL_MS) return { kind: "too_soon" };
        row.lastNonce = row.lastNonce + 1n > candidate ? row.lastNonce + 1n : candidate;
        row.leaseUntilMs = nowMs + KRAKEN_LEASE_MS;
        row.lastCallMs = nowMs;
        return { kind: "claimed", nonce: String(row.lastNonce) };
      }
      rows.set(accountId, { lastNonce: candidate, leaseUntilMs: nowMs + KRAKEN_LEASE_MS, lockoutUntilMs: null, lastCallMs: nowMs, lastOkMs: null });
      return { kind: "claimed", nonce: String(candidate) };
    },
    async release(accountId, outcome) {
      const row = rows.get(accountId);
      if (!row) return;
      row.leaseUntilMs = null;
      if (outcome.lockoutUntilMs != null) row.lockoutUntilMs = outcome.lockoutUntilMs;
      if (outcome.okAtMs != null) row.lastOkMs = outcome.okAtMs;
    },
  };
}
