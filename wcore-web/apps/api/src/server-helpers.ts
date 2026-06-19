import { CORE_VERSION, getChain, metrics } from "@wcore/core";
import type { CacheStore, WalletAssets, WalletAssetsCommon } from "@wcore/core";
import type { ChainScan, TokenAsset } from "@wcore/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export function validateChains(input: unknown): { ok: true; chains: string[]; skipped?: string[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, chains: ["BASE", "ETHEREUM"] };
  if (!Array.isArray(input)) return { ok: false, error: "chains must be an array" };
  if (input.length === 0) return { ok: false, error: "chains must not be empty" };
  const includeDisabled = process.env.WALLET_INCLUDE_DISABLED === "1";
  const chains: string[] = [];
  const skipped: string[] = [];
  for (const item of input) {
    if (typeof item !== "string" || !item.trim()) return { ok: false, error: `invalid chain: ${JSON.stringify(item)}` };
    const key = item.trim().toUpperCase();
    try {
      const chain = getChain(key);
      if (!chain) { skipped.push(key); continue; }
      if (!includeDisabled && chain.FLAGS?.DISABLE_CHAIN === true) { skipped.push(key); continue; }
      chains.push(key);
    } catch { skipped.push(key); }
  }
  if (chains.length === 0) return { ok: false, error: `no valid chains found (tried: ${skipped.join(", ")})` };
  return { ok: true, chains, skipped: skipped.length > 0 ? skipped : undefined };
}

export function validateCustomToken(c: unknown): c is string {
  if (typeof c !== "string") return false;
  const trimmed = c.trim();
  if (!trimmed || trimmed.length > 128) return false;
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return true;
  if (/^[a-z]{1,32}1[a-z0-9]{38,58}$/.test(trimmed)) return true;
  return false;
}

export type ApiRateLimitBucket = "scan" | "auth" | "leaderboard" | "gm_read" | "gm" | "catch_all" | null;

export function requiresCsrfOriginCheck(method: string, path: string): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) return false;
  const cleanPath = path.split("?")[0] ?? "";
  if (!cleanPath.startsWith("/api/")) return false;
  if (cleanPath === "/api/auth/nonce" || cleanPath === "/api/auth/login") return false;
  // /api/gsheet/* is authenticated by x-gsheet-token, not cookies — CSRF irrelevant.
  if (cleanPath.startsWith("/api/gsheet/")) return false;
  return true;
}

export function getApiRateLimitBucket(method: string, path: string): ApiRateLimitBucket {
  const cleanPath = path.split("?")[0] ?? "";
  if (cleanPath.startsWith("/api/scan/async/") && method.toUpperCase() === "GET") return null;
  if (cleanPath.startsWith("/api/scan")) return "scan";
  if (cleanPath.startsWith("/api/auth") || cleanPath === "/api/wallets/nonce") return "auth";
  if (cleanPath.startsWith("/api/leaderboard")) return "leaderboard";
  if (cleanPath.startsWith("/api/gm")) {
    const isGmWrite = cleanPath.startsWith("/api/gm/onchain") || cleanPath === "/api/gm" || cleanPath.startsWith("/api/gm/contracts/deploy");
    return isGmWrite ? "gm" : "gm_read";
  }
  if (cleanPath.startsWith("/api/")) return "catch_all";
  return null;
}

export async function getScanChainLimit(
  userId: string | undefined,
  getAuthenticatedLimit: (userId: string) => Promise<number>,
  anonymousLimit: number,
): Promise<number> {
  if (!userId) return anonymousLimit;
  return getAuthenticatedLimit(userId);
}

function extractPhases(assets: WalletAssetsCommon) {
  const p = assets.phases;
  if (!p) return undefined;
  const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  return { nativeMs: n(p.nativeMs), discoveryMs: n(p.discoveryMs), balancesMs: n(p.balancesMs), pricingMs: n(p.pricingMs) };
}

function getNativeLogoUrl(symbol: string): string | undefined {
  const logos: Record<string, string> = {
    ETH: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/eth.svg",
    SOL: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
    BNB: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/bnb.svg",
    AVAX: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/avax.svg",
    POL: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/pol.svg",
    ATOM: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/atom.svg",
    ARB: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/arb.svg",
    OP: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/op.svg",
    MATIC: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/matic.svg",
    FTM: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/ftm.svg",
    CELO: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/celo.svg",
    SEI: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/sei.svg",
    INJ: "https://s2.coinmarketcap.com/static/img/coins/64x64/7226.png",
    TIA: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/tia.svg",
    SUI: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/sui.svg",
    APT: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/apt.svg",
    DOT: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/dot.svg",
    NEAR: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/near.svg",
    FLOW: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/flow.svg",
    XTZ: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/xtz.svg",
    XRP: "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/xrp.svg",
  };
  return logos[symbol.toUpperCase()];
}

export function buildChainScan(chainKey: string, assets: WalletAssets, fxRate?: number): ChainScan {
  const chainConfig = getChain(chainKey) ?? getChain(chainKey.toUpperCase());
  const vm = chainConfig?.vm ?? "EVM";
  const nativeDecimals = Number(chainConfig?.CHAIN?.NATIVE_DECIMALS ?? 18);
  const nativeLogo = assets.native?.logoUrl;
  const native: TokenAsset = {
    contract: "native", symbol: assets.native?.symbol ?? "NATIVE", name: assets.native?.symbol ?? "Native",
    decimals: nativeDecimals, balance: assets.native?.balance ?? 0, priceEur: assets.native?.priceEur ?? null,
    priceSource: assets.native?.priceEur == null ? null : "pricing-cascade", valueEur: assets.native?.valueEur ?? null,
    flags: [], logoUrl: nativeLogo ?? getNativeLogoUrl(assets.native?.symbol ?? ""),
  };
  const rawTokens = (assets.tokens as Array<Record<string, unknown>>) ?? [];
  const tokens: TokenAsset[] = rawTokens.map((token) => ({
    contract: String(token["contract"] ?? token["mint"] ?? token["denom"] ?? ""),
    symbol: String(token["symbol"] ?? ""), name: String(token["name"] ?? token["symbol"] ?? ""),
    decimals: Number(token["decimals"] ?? 18), balance: Number(token["balance"] ?? 0),
    priceEur: (token["priceEur"] as number | null) ?? null,
    priceSource: (token["priceEur"] as number | null) == null ? null : "pricing-cascade",
    valueEur: (token["valueEur"] as number | null) ?? null,
    flags: (token["priceEur"] as number | null) == null ? ["NO_PRICE"] : [],
    logoUrl: typeof token["logoUrl"] === "string" ? token["logoUrl"] : undefined,
  }));
  const errors = (assets.errors ?? []).map((e: string) => e);
  const totalValueEur = assets.totalValueEur ?? tokens.reduce((s, t) => s + (t.valueEur ?? 0), 0) + (native.valueEur ?? 0);
  const allAssets = [native, ...tokens];
  return {
    chainKey, chainName: assets.chainName ?? chainKey, vm, native, tokens,
    totals: { valueEur: totalValueEur, tokenCount: allAssets.length, pricedCount: allAssets.filter((asset) => asset.priceEur != null).length },
    errors: errors.map(e => ({ chainKey, message: e, stage: "scan" as const })),
    degraded: errors.length > 0, fxRate: fxRate ?? 0,
    scanMs: assets.scanMs ?? 0,
    phases: extractPhases(assets), cachedAt: null, scriptVersion: CORE_VERSION,
  };
}

// --- Post-auth rate-limit hook (audit 2026-06-05 P1-2) ---
//
// The rate-limit hook must run AFTER the auth hook so `req.user` is populated
// when we classify the request. Registered before, every authenticated user
// was treated as anonymous and hit the stricter 60/min gm_read_anon limit
// instead of the authenticated 300/min bucket.
//
// CSRF origin checks still live in the pre-auth hook (server.ts) — they don't
// need req.user, only the origin header.

export interface PostAuthRateLimitDeps {
  sharedCache: CacheStore;
  metrics: typeof metrics;
  rateLimits: {
    scan: number;
    scanAnon: number;
    auth: number;
    leaderboard: number;
    catchAll: number;
    gmRead: number;
    gmReadAnon: number;
  };
  rateLimitIdentity: (req: { ip: string; headers: Record<string, string | string[] | undefined> }) => string;
  nonceTargetAddress: (req: { query?: unknown }) => string | null;
}

/**
 * Atomically increment a rate-limit counter and return whether the request
 * is still under the cap. Mirrors the logic previously inlined in server.ts.
 * Atomic INCR + EXPIRE avoids get-then-set races under SCAN_CONCURRENCY=50.
 */
async function incrRateLimit(
  sharedCache: CacheStore,
  key: string,
  limit: number,
): Promise<boolean> {
  if (typeof sharedCache.incr === "function") {
    try {
      const newCount = await sharedCache.incr(key, 60);
      return newCount <= limit;
    } catch {
      // Fall through to get-then-set fallback
    }
  }
  const entry = await sharedCache.get<{ count: number }>(key);
  if (!entry) { await sharedCache.set(key, { count: 1 }, 60_000); return true; }
  const newCount = entry.count + 1;
  if (newCount <= limit) { await sharedCache.set(key, { count: newCount }, 60_000); return true; }
  return false;
}

export async function applyPostAuthRateLimit(
  req: FastifyRequest,
  reply: FastifyReply,
  deps: PostAuthRateLimitDeps,
): Promise<void> {
  const method = req.method.toUpperCase();
  const path = req.url.split("?")[0] ?? "";
  const bucket = getApiRateLimitBucket(method, path);
  if (bucket === null) return;
  const isNoncePath = path === "/api/auth/nonce" || path === "/api/wallets/nonce";
  const nonceAddr = isNoncePath ? deps.nonceTargetAddress(req) : null;
  const isAnonymous = !req.user;
  const limit = bucket === "scan" ? (isAnonymous ? deps.rateLimits.scanAnon : deps.rateLimits.scan)
    : bucket === "leaderboard" ? deps.rateLimits.leaderboard
      : bucket === "catch_all" ? deps.rateLimits.catchAll
        : bucket === "gm_read" ? (isAnonymous ? deps.rateLimits.gmReadAnon : deps.rateLimits.gmRead)
          : deps.rateLimits.auth;
  const id = deps.rateLimitIdentity(req);
  const suffix = nonceAddr ? `${id}|${nonceAddr}` : id;
  const key = `rate_limit:${bucket}:${suffix}`;
  if (!await incrRateLimit(deps.sharedCache, key, limit)) {
    deps.metrics.recordRateLimit(bucket === "gm_read" ? "gm" : bucket);
    const message = bucket === "scan" ? "Too many scans. Wait 1 minute." : "Too many requests.";
    return reply.code(429).send({ error: "rate_limited", message });
  }
}

/**
 * Register the rate-limit `onRequest` hook on a Fastify instance. MUST be
 * called AFTER `authPlugin(app, prisma, sharedCache)` so the auth hook
 * populates `req.user` first.
 */
export function registerPostAuthRateLimit(app: FastifyInstance, deps: PostAuthRateLimitDeps): void {
  app.addHook("onRequest", async (req, reply) => {
    await applyPostAuthRateLimit(req, reply, deps);
  });
}
