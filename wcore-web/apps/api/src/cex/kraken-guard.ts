import { createHash, createHmac } from "node:crypto";

/**
 * Appelant UNIQUE de l'API privee Kraken (P2-DATA-KRAKEN-VIA-API).
 *
 * Kraken exige un nonce strictement croissant par cle : deux clients qui partagent une
 * cle (classeur + site, ou deux instances Railway pendant un deploiement) produisent
 * des « Invalid nonce », puis un « EGeneral:Temporary lockout ». Le seul chemin Kraken
 * de l'API est la route du classeur, qui passe par ce module :
 *
 * - la garde est indexee par l'EMPREINTE de la cle (pas par le compte WCORE) : recreer
 *   le compte avec la meme cle retrouve le meme nonce, le meme bail et la meme pause ;
 * - serialisation : un bail (lease) pris par un seul UPSERT atomique, avec l'horloge
 *   PostgreSQL (jamais celle d'une instance) ; aucun envoi si le bail est trop entame ;
 * - nonce persistant : GREATEST(dernier + 1, horloge en microsecondes, plancher + 1),
 *   le plancher etant le dernier nonce du classeur (continuite a la bascule) ;
 * - liberation conditionnee au nonce reclame (un titulaire en retard ne libere jamais
 *   le bail d'un successeur), pause de 60 min enregistree dans tous les cas ;
 * - intervalle minimal entre deux appels reels, reutilisation du dernier passage (5 min).
 *
 * Seule la carte brute Balance (actif Kraken -> quantite) est renvoyee : le classement
 * xStocks/fiat/crypto et les prix restent cote classeur.
 */

export type KrakenCredentials = { apiKey: string; apiSecret: string };
export type KrakenBalanceMap = Record<string, string>;

export const KRAKEN_LOCKOUT_PAUSE_MS = 60 * 60_000;
export const KRAKEN_REUSE_MS = 5 * 60_000;
export const KRAKEN_MIN_INTERVAL_MS = 60_000;
export const KRAKEN_LEASE_MS = 45_000;
export const KRAKEN_TIMEOUT_MS = 30_000;
/** Bail entame de plus que cela avant l'envoi = aucun envoi (45 >= 10 + 30 + marge). */
export const KRAKEN_MAX_SEND_DELAY_MS = 10_000;
const KRAKEN_MAX_ASSETS = 5_000;
const NONCE_RE = /^\d{1,19}$/;
const BIGINT_MAX = 9_223_372_036_854_775_807n;

export type KrakenClaim =
  | { kind: "claimed"; nonce: string }
  | { kind: "paused"; untilMs: number }
  | { kind: "busy" }
  | { kind: "too_soon" };

export interface KrakenGuardStore {
  /** Prend le bail et le nonce en une operation atomique (horloge du magasin), ou dit pourquoi c'est refuse. */
  claim(keyId: string, nonceCandidate: string, nonceFloor: string | null): Promise<KrakenClaim>;
  /**
   * Rend le bail SI `nonce` est toujours le dernier reclame ; enregistre la pause (sans
   * condition) si `lockout` ; renvoie la fin de pause enregistree, s'il y en a une.
   */
  release(keyId: string, nonce: string, outcome: { ok: boolean; lockout: boolean }): Promise<{ lockoutUntilMs: number | null }>;
}

export type KrakenGuardReason = "kraken_paused" | "kraken_busy" | "kraken_too_soon";

/**
 * Refus local : AUCUN appel n'est parti vers Kraken (sauf `kraken_paused` arme par la
 * reponse qui vient d'arriver). Texte stable, jamais de corps distant.
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
  /** Nonce de l'appel reel qui a produit ces soldes (le classeur le garde comme plancher). */
  nonce: string;
}

export interface KrakenBalanceReader {
  readBalances(creds: KrakenCredentials, opts?: { nonceFloor?: string | null }): Promise<KrakenBalanceResult>;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; redirect: "error"; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Identifiant de garde : empreinte de la cle publique, jamais la cle elle-meme. */
export function krakenKeyId(apiKey: string): string {
  return "kraken:" + createHash("sha256").update("wcore-kraken-guard:" + apiKey).digest("hex").slice(0, 32);
}

/** Plancher de nonce venu du classeur : chiffres seulement, dans un BIGINT, sinon ignore. */
export function parseNonceFloor(value: unknown): string | null {
  if (typeof value !== "string" || !NONCE_RE.test(value)) return null;
  return BigInt(value) < BIGINT_MAX ? value : null;
}

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
    if (asset.length === 0 || asset.length > 64) throw new Error("Kraken Balance: invalid asset key");
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
    // Jamais d'en-tetes signes vers une autre origine.
    redirect: "error",
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
  const memo = new Map<string, { balances: KrakenBalanceMap; fetchedAtMs: number; nonce: string }>();
  const inflight = new Map<string, Promise<KrakenBalanceResult>>();
  // Filet si le magasin ne peut pas enregistrer une pause : cette instance la tient.
  const localPause = new Map<string, number>();

  async function callOnce(keyId: string, creds: KrakenCredentials, nonceFloor: string | null): Promise<KrakenBalanceResult> {
    const local = localPause.get(keyId) ?? 0;
    if (local > now()) throw new KrakenGuardError("kraken_paused", local);
    // Mesure AVANT la demande : le bail court depuis un instant de cet intervalle.
    const claimedAt = now();
    const claim = await deps.store.claim(keyId, String(BigInt(claimedAt) * 1000n), nonceFloor);
    if (claim.kind === "paused") throw new KrakenGuardError("kraken_paused", claim.untilMs);
    if (claim.kind === "busy") throw new KrakenGuardError("kraken_busy");
    if (claim.kind === "too_soon") throw new KrakenGuardError("kraken_too_soon");
    if (now() - claimedAt > KRAKEN_MAX_SEND_DELAY_MS) {
      // Bail trop entame : un successeur pourrait le reprendre pendant l'appel.
      await deps.store.release(keyId, claim.nonce, { ok: false, lockout: false }).catch(() => undefined);
      throw new KrakenGuardError("kraken_busy");
    }
    let balances: KrakenBalanceMap;
    try {
      balances = await postBalance(creds, claim.nonce, fetchImpl);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (/temporary lockout/i.test(raw)) {
        // Jamais de relance. Pause tenue par le magasin ET par cette instance.
        let untilMs = now() + KRAKEN_LOCKOUT_PAUSE_MS;
        try {
          const saved = await deps.store.release(keyId, claim.nonce, { ok: false, lockout: true });
          if (saved.lockoutUntilMs && saved.lockoutUntilMs > now()) untilMs = saved.lockoutUntilMs;
        } catch { /* pause locale seulement : le classeur la recopie aussi */ }
        localPause.set(keyId, untilMs);
        throw new KrakenGuardError("kraken_paused", untilMs);
      }
      await deps.store.release(keyId, claim.nonce, { ok: false, lockout: false }).catch(() => undefined);
      throw e;
    }
    const fetchedAtMs = now();
    memo.set(keyId, { balances, fetchedAtMs, nonce: claim.nonce });
    // Un echec d'ecriture ici laisse expirer le bail (45 s) : jamais de second appel en parallele.
    await deps.store.release(keyId, claim.nonce, { ok: true, lockout: false }).catch(() => undefined);
    return { balances, fetchedAtMs, reused: false, nonce: claim.nonce };
  }

  return {
    async readBalances(creds, opts) {
      const keyId = krakenKeyId(creds.apiKey);
      const recent = memo.get(keyId);
      const age = recent ? now() - recent.fetchedAtMs : -1;
      if (recent && age >= 0 && age < KRAKEN_REUSE_MS) {
        return { balances: { ...recent.balances }, fetchedAtMs: recent.fetchedAtMs, reused: true, nonce: recent.nonce };
      }
      const pending = inflight.get(keyId);
      if (pending) return pending.then((r) => ({ ...r, balances: { ...r.balances }, reused: true }));
      const run = callOnce(keyId, creds, parseNonceFloor(opts?.nonceFloor ?? null)).finally(() => inflight.delete(keyId));
      inflight.set(keyId, run);
      return run;
    },
  };
}

export interface SqlClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

const T = `"kraken_call_state"`;
const DB_NOW_MS = `(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint`;

/**
 * Magasin PostgreSQL (table `kraken_call_state`, migration 20261123200000). Toutes les
 * comparaisons de temps utilisent l'horloge de PostgreSQL. Le nonce est un BIGINT relu
 * en texte : il ne passe jamais par un Number JavaScript.
 */
export function createPrismaKrakenGuardStore(sql: SqlClient): KrakenGuardStore {
  return {
    async claim(keyId, nonceCandidate, nonceFloor) {
      const rows = await sql.$queryRawUnsafe<{ nonce: string }[]>(
        `WITH clk AS (SELECT ${DB_NOW_MS} AS now_ms)
         INSERT INTO ${T} ("key_id", "last_nonce", "lease_until_ms", "last_call_ms", "updated_at")
         SELECT $1, GREATEST($2::bigint, COALESCE($3::bigint, 0) + 1), clk.now_ms + $4::bigint, clk.now_ms, now() FROM clk
         ON CONFLICT ("key_id") DO UPDATE SET
           "last_nonce" = GREATEST(${T}."last_nonce" + 1, EXCLUDED."last_nonce"),
           "lease_until_ms" = EXCLUDED."lease_until_ms",
           "last_call_ms" = EXCLUDED."last_call_ms",
           "updated_at" = now()
         WHERE (${T}."lease_until_ms" IS NULL OR ${T}."lease_until_ms" <= EXCLUDED."last_call_ms")
           AND (${T}."lockout_until_ms" IS NULL OR ${T}."lockout_until_ms" <= EXCLUDED."last_call_ms")
           AND (${T}."last_call_ms" IS NULL OR ${T}."last_call_ms" <= EXCLUDED."last_call_ms" - $5::bigint)
         RETURNING "last_nonce"::text AS "nonce"`,
        keyId, nonceCandidate, nonceFloor, String(KRAKEN_LEASE_MS), String(KRAKEN_MIN_INTERVAL_MS),
      );
      if (rows.length === 1 && NONCE_RE.test(rows[0]!.nonce)) return { kind: "claimed", nonce: rows[0]!.nonce };
      const state = await sql.$queryRawUnsafe<{ lockout: string | null; lease: string | null; now_ms: string }[]>(
        `SELECT "lockout_until_ms"::text AS "lockout", "lease_until_ms"::text AS "lease", ${DB_NOW_MS}::text AS "now_ms"
         FROM ${T} WHERE "key_id" = $1`,
        keyId,
      );
      const dbNow = Number(state[0]?.now_ms ?? 0);
      const lockout = Number(state[0]?.lockout ?? 0);
      if (lockout > dbNow) return { kind: "paused", untilMs: lockout };
      if (Number(state[0]?.lease ?? 0) > dbNow) return { kind: "busy" };
      return { kind: "too_soon" };
    },
    async release(keyId, nonce, outcome) {
      const rows = await sql.$queryRawUnsafe<{ lockout: string | null }[]>(
        `UPDATE ${T} SET
           "lease_until_ms" = CASE WHEN ${T}."last_nonce" = $2::bigint THEN NULL ELSE ${T}."lease_until_ms" END,
           "lockout_until_ms" = CASE WHEN $3::boolean THEN GREATEST(COALESCE(${T}."lockout_until_ms", 0), clk.now_ms + $5::bigint) ELSE ${T}."lockout_until_ms" END,
           "last_ok_ms" = CASE WHEN $4::boolean AND ${T}."last_nonce" = $2::bigint THEN clk.now_ms ELSE ${T}."last_ok_ms" END,
           "updated_at" = now()
         FROM (SELECT ${DB_NOW_MS} AS now_ms) clk
         WHERE ${T}."key_id" = $1
         RETURNING ${T}."lockout_until_ms"::text AS "lockout"`,
        keyId, nonce, outcome.lockout, outcome.ok, String(KRAKEN_LOCKOUT_PAUSE_MS),
      );
      const lockout = Number(rows[0]?.lockout ?? 0);
      return { lockoutUntilMs: lockout > 0 ? lockout : null };
    },
  };
}

type MemoryRow = { lastNonce: bigint; leaseUntilMs: number | null; lockoutUntilMs: number | null; lastCallMs: number | null; lastOkMs: number | null };

/** Magasin en memoire, meme semantique que PostgreSQL (tests). `now` = horloge du magasin. */
export function createMemoryKrakenGuardStore(now: () => number = Date.now): KrakenGuardStore & { rows: Map<string, MemoryRow> } {
  const rows = new Map<string, MemoryRow>();
  return {
    rows,
    async claim(keyId, nonceCandidate, nonceFloor) {
      const t = now();
      const floorNext = nonceFloor ? BigInt(nonceFloor) + 1n : 0n;
      const candidate = BigInt(nonceCandidate) > floorNext ? BigInt(nonceCandidate) : floorNext;
      const row = rows.get(keyId);
      if (row) {
        if (row.lockoutUntilMs != null && row.lockoutUntilMs > t) return { kind: "paused", untilMs: row.lockoutUntilMs };
        if (row.leaseUntilMs != null && row.leaseUntilMs > t) return { kind: "busy" };
        if (row.lastCallMs != null && row.lastCallMs > t - KRAKEN_MIN_INTERVAL_MS) return { kind: "too_soon" };
        row.lastNonce = row.lastNonce + 1n > candidate ? row.lastNonce + 1n : candidate;
        row.leaseUntilMs = t + KRAKEN_LEASE_MS;
        row.lastCallMs = t;
        return { kind: "claimed", nonce: String(row.lastNonce) };
      }
      rows.set(keyId, { lastNonce: candidate, leaseUntilMs: t + KRAKEN_LEASE_MS, lockoutUntilMs: null, lastCallMs: t, lastOkMs: null });
      return { kind: "claimed", nonce: String(candidate) };
    },
    async release(keyId, nonce, outcome) {
      const row = rows.get(keyId);
      if (!row) return { lockoutUntilMs: null };
      const mine = row.lastNonce === BigInt(nonce);
      if (mine) row.leaseUntilMs = null;
      if (outcome.lockout) row.lockoutUntilMs = Math.max(row.lockoutUntilMs ?? 0, now() + KRAKEN_LOCKOUT_PAUSE_MS);
      if (outcome.ok && mine) row.lastOkMs = now();
      return { lockoutUntilMs: row.lockoutUntilMs };
    },
  };
}
