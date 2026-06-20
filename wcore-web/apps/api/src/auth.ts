import type { FastifyInstance, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { hashMessage, recoverAddress } from "viem";
import { randomBytes } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import bs58 from "bs58";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@cosmjs/crypto";
import { toBech32 } from "@cosmjs/encoding";
import { detectChainType } from "@wcore/shared";
import type { CacheStore } from "@wcore/core";
import type { PrismaClient } from "@wcore/db";
import {
  NonceQuerySchema,
  LoginBodySchema,
  ProfileParamsSchema,
  WalletNonceQuerySchema,
  LinkedWalletAddBodySchema,
  WalletIdParamsSchema,
  LinkedWalletPatchBodySchema,
} from "./schemas.js";
import { buildPerChainGmPoints } from "./gamification/gm-points.js";
import { apiConfig } from "./config.js";

// --- JWT Config ---

const JWT_SECRET = apiConfig.auth.jwtSecret;

if (apiConfig.auth.usedDevelopmentJwtFallback) {
  console.warn("[AUTH] JWT_SECRET not set. Using development secret. All existing tokens will be invalidated on server restart. Set JWT_SECRET to persist sessions across restarts.");
}

const ACCESS_TOKEN_TTL = "24h";
const REFRESH_TOKEN_TTL = "7d";
const NONCE_TTL_MS = 300_000;
const REVOCATION_TTL_S = 604800; // 7d — matches REFRESH_TOKEN_TTL so revoked tokens stay revoked

// --- Cookie Config ---

const COOKIE_OPTS = {
  httpOnly: true,
  secure: apiConfig.auth.cookieSecure,
  sameSite: apiConfig.auth.cookieSameSite,
  path: "/",
};

// --- Types ---

export interface AuthUser {
  id: string;
  address: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

// --- Helpers ---

function signAccessToken(user: { id: string; address: string }): string {
  const jti = randomBytes(16).toString("hex");
  return jwt.sign({ sub: user.id, address: user.address, type: "access", jti }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function signRefreshToken(user: { id: string; address: string }): { token: string; jti: string } {
  const jti = randomBytes(16).toString("hex");
  const token = jwt.sign({ sub: user.id, address: user.address, type: "refresh", jti }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
  return { token, jti };
}

function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  reply.setCookie("wcore_access", accessToken, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 });
  reply.setCookie("wcore_refresh", refreshToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 });
}

function clearAuthCookies(reply: FastifyReply) {
  reply.clearCookie("wcore_access", COOKIE_OPTS);
  reply.clearCookie("wcore_refresh", COOKIE_OPTS);
}

async function isTokenRevoked(cacheStore: CacheStore, jti: string): Promise<boolean> {
  const revoked = await cacheStore.get<string>(`revoked:${jti}`);
  return revoked === "1";
}

async function revokeToken(cacheStore: CacheStore, jti: string): Promise<void> {
  await cacheStore.set(`revoked:${jti}`, "1", REVOCATION_TTL_S * 1000);
}

/**
 * Atomically claim (single-use consume) a jti by revoking it. Returns true if
 * THIS call performed the revocation, false if it was already revoked. Backed
 * by Redis `SET NX` so two concurrent refreshes — or a stolen token racing the
 * legitimate one — cannot both win the rotation.
 */
async function claimAndRevokeToken(cacheStore: CacheStore, jti: string): Promise<boolean> {
  return cacheStore.add(`revoked:${jti}`, "1", REVOCATION_TTL_S * 1000);
}

type JwtAuthPayload = { sub: string; address: string; type: string; jti?: string };

async function isUsableAccessPayload(cacheStore: CacheStore, payload: JwtAuthPayload, prisma?: PrismaClient): Promise<boolean> {
  if (payload.type !== "access") return false;
  if (payload.jti && await isTokenRevoked(cacheStore, payload.jti)) return false;
  // Lightweight user existence check: cache in Redis for 5 min to avoid DB query
  // on every request. Catches deleted/banned users within 5 min of deletion.
  if (prisma) {
    const cacheKey = `user_exists:${payload.sub}`;
    const cached = await cacheStore.get<boolean>(cacheKey);
    if (cached === false) return false; // known deleted
    if (cached === true) return true; // known existing
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
    const exists = !!user;
    await cacheStore.set(cacheKey, exists, 5 * 60 * 1000).catch(() => {});
    if (!exists) return false;
  }
  return true;
}

async function revokeJwtIfPresent(cacheStore: CacheStore, token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { jti?: string };
    if (payload.jti) await revokeToken(cacheStore, payload.jti);
  } catch { /* invalid token, nothing to revoke */ }
}

// --- Allowed SIWE domains ---

const _siweAllowedDomains = new Set<string>(
  apiConfig.cors.origins
    .map(origin => {
      try { return new URL(origin).hostname; } catch { return ""; }
    })
    .filter(Boolean)
);

export async function authPlugin(app: FastifyInstance, prisma: PrismaClient, cacheStore: CacheStore) {
  app.decorateRequest("user", undefined);

  // Auth hook: try cookie first, fall back to Bearer header for backward compat
  app.addHook("onRequest", async (req) => {
    // Try access token cookie first
    const accessCookie = (req as unknown as { cookies: Record<string, string> }).cookies?.["wcore_access"];
    if (accessCookie) {
      try {
        const payload = jwt.verify(accessCookie, JWT_SECRET) as JwtAuthPayload;
        if (await isUsableAccessPayload(cacheStore, payload, prisma)) {
          req.user = { id: payload.sub, address: payload.address };
          return;
        }
      } catch { /* invalid cookie, try Bearer */ }
    }
    // Fall back to Bearer header for backward compat (dev/staging tooling).
    // Deny-by-default in production (XSS exfil hardening): the web app is fully
    // on httpOnly cookies. Re-enable explicitly with AUTH_ALLOW_BEARER=true.
    const allowBearer = apiConfig.auth.authAllowBearer;
    if (!allowBearer) return;
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      try {
        const token = auth.slice(7);
        const payload = jwt.verify(token, JWT_SECRET) as JwtAuthPayload;
        if (await isUsableAccessPayload(cacheStore, payload, prisma)) {
          req.user = { id: payload.sub, address: payload.address };
        }
      } catch { /* invalid token → anonymous */ }
    }
  });

  app.get("/api/auth/nonce", async (req) => {
    const parsed = NonceQuerySchema.safeParse(req.query);
    if (!parsed.success) return { error: "missing_address" };
    const { address, chainId } = parsed.data;
    const nonce = randomBytes(16).toString("hex");
    const key = `nonce:${address.toLowerCase()}`;
    await cacheStore.set(key, JSON.stringify({ nonce, chainId, issuedAt: new Date().toISOString() }), NONCE_TTL_MS);

    // Use the web app's domain for the SIWE message, not the API host.
    // The user signs in from the web app, so the domain should match the web origin.
    const corsOrigins = apiConfig.cors.origins;
    const requestOrigin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    let webOrigin = corsOrigins[0] ?? `https://localhost`;
    if (requestOrigin) {
      try {
        const requestHostname = new URL(requestOrigin).hostname.toLowerCase();
        const matchingOrigin = corsOrigins.find((allowedOrigin) => {
          try { return new URL(allowedOrigin).hostname.toLowerCase() === requestHostname; }
          catch { return false; }
        });
        if (matchingOrigin) webOrigin = matchingOrigin;
      } catch { /* keep default origin */ }
    }
    let webHostname = "localhost";
    try { webHostname = new URL(webOrigin).hostname; } catch { /* keep localhost */ }
    const domain = webHostname;
    const origin = webOrigin;
    const issuedAt = new Date().toISOString();
    const expiration = new Date(Date.now() + NONCE_TTL_MS).toISOString();

    const message = [
      `${domain} wants you to sign in with your Ethereum account:`,
      address.toLowerCase(),
      "",
      "Sign in to WCORE.",
      "",
      `URI: ${origin}`,
      "Version: 1",
      `Chain ID: ${chainId}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
      `Expiration Time: ${expiration}`,
    ].join("\n");

    return { nonce, message };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const bodyParsed = LoginBodySchema.safeParse(req.body);
    if (!bodyParsed.success) return { error: "missing_fields" };
    const body = bodyParsed.data;
    const { message, signature, address } = body;
    if (!message || !signature || !address) {
      return { error: "missing_fields" };
    }

    try {
      const nonceKey = `nonce:${address.toLowerCase()}`;
      const storedRaw = await cacheStore.get<string>(nonceKey);
      if (!storedRaw) return { error: "invalid_or_expired_nonce" };

      // Backward compat: old format was plain nonce string, new format is JSON
      let storedNonce: string;
      let storedChainId = 0;
      try {
        const parsed = JSON.parse(storedRaw) as { nonce: string; chainId: number; issuedAt: string };
        storedNonce = parsed.nonce;
        storedChainId = parsed.chainId;
      } catch {
        storedNonce = storedRaw; // legacy plain-text nonce
      }
      if (!message.includes(storedNonce)) {
        return { error: "invalid_or_expired_nonce" };
      }

      // Parse SIWE fields from the message (structured or legacy plain-text)
      const lines = message.split("\n");
      const siweDomain = lines[0]?.split(" wants you to sign")[0] ?? "";
      const siweUri = lines.find(l => l.startsWith("URI: "))?.replace("URI: ", "") ?? "";
      const siweChainId = parseInt(lines.find(l => l.startsWith("Chain ID: "))?.replace("Chain ID: ", "") ?? "0", 10);
      const _siweIssuedAt = lines.find(l => l.startsWith("Issued At: "))?.replace("Issued At: ", "") ?? "";
      const siweExpiration = lines.find(l => l.startsWith("Expiration Time: "))?.replace("Expiration Time: ", "") ?? "";

      // SIWE hardening: required fields must be present (closes bypass via missing
      // `Expiration Time:` or `Chain ID:` lines). Server-side nonce TTL already bounds
      // reuse, but EIP-4361 mandates these fields.
      if (!siweExpiration) {
        return { error: "siwe_expiration_missing" };
      }
      if (new Date(siweExpiration).getTime() < Date.now()) {
        return { error: "expired_session" };
      }
      if (!siweChainId) {
        return { error: "siwe_chain_id_missing" };
      }
      // Validate chainId matches stored nonce when stored (legacy nonces had no chainId).
      if (storedChainId > 0 && siweChainId !== storedChainId) {
        return { error: "chain_id_mismatch" };
      }

      // Bind the signed message to the CORS allowlist, not the request host.
      // The API may be on a different domain than the web app.
      const siweDomainHost = siweDomain.split(":")[0]?.toLowerCase() ?? "";
      if (!siweDomainHost) {
        return { error: "siwe_domain_missing" };
      }
      // In production/staging, require siweDomain to be in the CORS allowlist.
      if (!apiConfig.runtime.isDevelopmentLike && _siweAllowedDomains.size === 0) {
        return { error: "siwe_domain_allowlist_missing" };
      }
      if (!apiConfig.runtime.isDevelopmentLike && !_siweAllowedDomains.has(siweDomainHost)) {
        return { error: "siwe_domain_not_allowed" };
      }
      // URI must parse and its hostname must match the same domain.
      if (siweUri) {
        try {
          const uriHost = new URL(siweUri).hostname.toLowerCase();
          if (uriHost !== siweDomainHost) {
            return { error: "siwe_uri_mismatch" };
          }
        } catch {
          return { error: "siwe_uri_invalid" };
        }
      }

      // Verify signature BEFORE deleting nonce (prevents DoS)
      const recovered = await recoverAddress({ hash: hashMessage(message), signature: signature as `0x${string}` });
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        return { error: "invalid_signature" };
      }
      await cacheStore.delete(nonceKey);

      const normalizedAddress = address.toLowerCase();
      const isPlatformOwner = normalizedAddress === "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
      
      // Check for referral code (passed as query param during signup)
      const referralCode = body.ref?.trim()?.toLowerCase();
      
      const user = await prisma.user.upsert({
        where: { address: normalizedAddress },
        update: { 
          lastLoginAt: new Date(), 
          ...(isPlatformOwner ? { plan: "admin" } : {}),
        },
        create: { 
          address: normalizedAddress, 
          lastLoginAt: new Date(), 
          ...(isPlatformOwner ? { plan: "admin" } : {}),
          referralCode: normalizedAddress.substring(2, 10), // short code from address
        },
      });

      // Handle referral: auto-assign platform owner if no referral code or referrer not found
      if (!user.referredById) {
        let referrerId: string | null = null;
        if (referralCode) {
          const referrer = await prisma.user.findFirst({ where: { referralCode, id: { not: user.id } }, select: { id: true } });
          if (referrer) referrerId = referrer.id;
        }
        if (!referrerId) {
          // Auto-assign platform owner
          const platformOwner = await prisma.user.findUnique({ where: { address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080" }, select: { id: true } });
          if (platformOwner) referrerId = platformOwner.id;
        }
        if (referrerId) {
          await prisma.user.update({ where: { id: user.id }, data: { referredById: referrerId } });
        }
      }

      const token = signAccessToken(user);
      const { token: refreshToken } = signRefreshToken(user);

      // Set HttpOnly cookies
      setAuthCookies(reply, token, refreshToken);

      return { user: { id: user.id, address: user.address } };
    } catch (error) {
      console.error("[AUTH] login failed:", error instanceof Error ? error.message : String(error));
      // Never expose internal error details to the client outside dev.
      if (apiConfig.runtime.isDevelopmentLike) return { error: "auth_failed", message: error instanceof Error ? error.message : String(error) };
      return { error: "auth_failed" };
    }
  });

  app.get("/api/auth/me", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return reply.code(401).send({ error: "user_not_found" });

    // Compute point breakdown — issue the three independent queries concurrently
    // to avoid 3 sequential DB round-trips on every auth check.
    const streak = user.gmStreak as number;
    const today = new Date().toISOString().slice(0, 10);
    const [onchainGms, quests] = await Promise.all([
      prisma.onchainGm.findMany({ where: { userId: user.id }, select: { chainKey: true, createdAt: true } }),
      prisma.userQuest.findMany({ where: { userId: user.id }, include: { quest: true } }),
    ]);

    const gmOnChainToday = onchainGms.some((g: { createdAt: Date }) => new Date(g.createdAt).toISOString().slice(0, 10) === today);
    const gmOffChainToday = user.lastGmDate ? (new Date(user.lastGmDate)).toISOString().slice(0, 10) === today : false;
    const chainGmToday = onchainGms.filter((g: { createdAt: Date; chainKey: string }) => new Date(g.createdAt).toISOString().slice(0, 10) === today).map((g: { chainKey: string }) => g.chainKey);

    let offChainPts = 0;
    for (let d = 1; d <= streak; d++) {
      offChainPts += 10 + (d > 1 ? d : 0);
    }

    const questPts = quests.reduce((s: number, q: Record<string, unknown>) => s + ((q.quest as Record<string, unknown>).scoreReward as number), 0);

    const perChainBreakdown = buildPerChainGmPoints(onchainGms);
    const onChainPts = perChainBreakdown.reduce((s: number, c: { points: number }) => s + c.points, 0);
    const onChainCount = perChainBreakdown.reduce((s: number, c: { count: number }) => s + c.count, 0);

    const breakdown = {
      offChain: { days: streak, points: offChainPts, detail: `10 + streak bonus × ${streak} jours` },
      onChain: { count: onChainCount, points: onChainPts, detail: onChainCount > 0 ? `Bonus per-chain sur ${perChainBreakdown.length} chaînes` : "Aucun bonus per-chain" },
      perChain: perChainBreakdown,
      quests: quests.map((q: Record<string, unknown>) => {
        const quest = q.quest as Record<string, unknown>;
        return { key: quest.key, title: quest.title, points: quest.scoreReward };
      }),
      questPts,
    };

    return {
      id: user.id,
      address: user.address,
      score: user.score as number,
      gmStreak: streak,
      longestStreak: user.longestStreak as number,
      lastGmDate: user.lastGmDate,
      gmOffChainToday,
      gmOnChainToday,
      chainGmToday,
      referralCode: user.referralCode,
      referralEarnings: user.referralEarnings as number,
      welcomeCompleted: user.welcomeCompleted as boolean,
      breakdown,
    };
  });

  // --- Refresh Token — issues new access + refresh tokens (rotation) ---

  app.post("/api/auth/refresh", async (req, reply) => {
    const refreshCookie = (req as unknown as { cookies: Record<string, string> }).cookies?.["wcore_refresh"];
    if (!refreshCookie) return reply.code(401).send({ error: "no_refresh_token" });

    try {
      const payload = jwt.verify(refreshCookie, JWT_SECRET) as { sub: string; address: string; type: string; jti: string };
      if (payload.type !== "refresh") return reply.code(401).send({ error: "invalid_token_type" });

      // Atomic single-use claim: revoke the presented refresh jti and proceed
      // only if THIS request was the first to consume it. Concurrent replays
      // (or a stolen token racing the legitimate one) lose the claim and are
      // rejected. Replaces the previous non-atomic check-then-revoke race.
      const claimed = await claimAndRevokeToken(cacheStore, payload.jti);
      if (!claimed) {
        clearAuthCookies(reply);
        return reply.code(401).send({ error: "token_revoked" });
      }

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return reply.code(401).send({ error: "user_not_found" });

      // Revoke the current access token, if present.
      await revokeJwtIfPresent(cacheStore, (req as unknown as { cookies: Record<string, string> }).cookies?.["wcore_access"]);

      // Issue new tokens
      const newAccess = signAccessToken({ id: user.id, address: user.address });
      const { token: newRefresh } = signRefreshToken({ id: user.id, address: user.address });

      setAuthCookies(reply, newAccess, newRefresh);

      return { user: { id: user.id, address: user.address } };
    } catch {
      clearAuthCookies(reply);
      return reply.code(401).send({ error: "invalid_refresh_token" });
    }
  });

  // --- Logout — revoke refresh token + clear cookies ---

  app.post("/api/auth/logout", async (req, reply) => {
    const cookies = (req as unknown as { cookies: Record<string, string> }).cookies;
    const refreshCookie = cookies?.["wcore_refresh"];
    await revokeJwtIfPresent(cacheStore, cookies?.["wcore_access"]);
    if (refreshCookie) {
      try {
        const payload = jwt.verify(refreshCookie, JWT_SECRET) as { jti?: string };
        if (payload.jti) await revokeToken(cacheStore, payload.jti);
      } catch { /* invalid token, just clear cookies */ }
    }
    clearAuthCookies(reply);
    return { ok: true };
  });

  app.post("/api/auth/welcome", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    await prisma.user.update({ where: { id: req.user.id }, data: { welcomeCompleted: true } });
    return { ok: true };
  });

  app.get("/api/profile/:address", async (req) => {
    const { address } = ProfileParamsSchema.parse(req.params);
    const user = await prisma.user.findUnique({
      where: { address: address.toLowerCase() },
      include: {
        badges: { include: { badge: true } },
        scans: { orderBy: { createdAt: "desc" }, take: 10 },
        wallets: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!user) return { error: "user_not_found" };
    return {
      address: user.address,
      score: user.score,
      gmStreak: user.gmStreak,
      longestStreak: user.longestStreak,
      badges: user.badges.map((ub: Record<string, unknown>) => ub["badge"]),
      // Only expose wallets whose ownership has been proven by signature.
      // UNSIGNED entries are view-only claims and can point to any address —
      // exposing them publicly would let a user fake ownership of e.g. vitalik.eth
      // for leaderboard / profile spoofing.
      wallets: user.wallets
        .filter((w: Record<string, unknown>) => w["verificationStatus"] === "SIGNED")
        .map((w: Record<string, unknown>) => ({
          id: w["id"],
          address: w["address"],
          label: w["label"],
          chainType: w["chainType"],
          verificationStatus: w["verificationStatus"],
        })),
      recentScans: user.scans.map((s: Record<string, unknown>) => ({
        chains: s["chains"],
        totalEur: s["totalEur"],
        tokenCount: s["tokenCount"],
        createdAt: s["createdAt"],
      })),
    };
  });

  app.get("/api/wallets/nonce", async (req) => {
    const wn = WalletNonceQuerySchema.safeParse(req.query);
    if (!wn.success) return { error: "missing_address" };
    const { address } = wn.data;
    const nonce = randomBytes(16).toString("hex");
    const trimmed = address.trim();
    const normalized = /^0x[0-9a-fA-F]{40}$/.test(trimmed) ? trimmed.toLowerCase() : trimmed;
    const key = `link_nonce:${normalized}`;
    await cacheStore.set(key, nonce, NONCE_TTL_MS);
    return {
      nonce,
      message: `WCORE Link Wallet\n\nWallet: ${trimmed}\nNonce: ${nonce}\nExpires: ${new Date(Date.now() + NONCE_TTL_MS).toISOString()}`,
    };
  });

  app.post("/api/wallets", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const walletParsed = LinkedWalletAddBodySchema.safeParse(req.body);
    if (!walletParsed.success) return reply.code(400).send({ error: "missing_address" });
    const body = walletParsed.data;
    if (!body.address?.trim()) return reply.code(400).send({ error: "missing_address" });

    const isViewOnly = body.mode === "view_only";
    if (!isViewOnly && (!body.signature || !body.message)) {
      return reply.code(400).send({ error: "signature_required", message: "A signed message is required to link a wallet" });
    }

    const addr = body.address.trim();
    const normalized = /^0x[0-9a-fA-F]{40}$/.test(addr) ? addr.toLowerCase() : addr;
    const chainType = detectChainType(normalized);

    // Verify wallet ownership via signature
    if (!isViewOnly && body.signature && body.message) {
      const linkKey = `link_nonce:${normalized}`;
      const storedLinkNonce = await cacheStore.get<string>(linkKey);
      if (!storedLinkNonce || !body.message.includes(storedLinkNonce)) {
        return reply.code(400).send({ error: "invalid_or_expired_nonce" });
      }

      let verified = false;
      if (chainType === "EVM") {
        try {
          const recovered = await recoverAddress({
            hash: hashMessage(body.message),
            signature: body.signature as `0x${string}`,
          });
          verified = recovered.toLowerCase() === normalized;
        } catch (e) { console.error("wallet link EVM verify error:", (e).message || String(e)); verified = false; }
      } else if (chainType === "SVM") {
        try {
          const pubKeyBytes = bs58.decode(body.publicKey ?? "");
          const sigBytes = bs58.decode(body.signature);
          const msgBytes = new TextEncoder().encode(body.message);
          if (bs58.encode(pubKeyBytes) !== normalized) throw new Error("public key does not match address");
          // Phantom wraps in a fake TX; verify the inner signed message
          // Try direct ed25519 verification
          verified = ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
          if (!verified && sigBytes.length === 64) {
            // Some wallets sign SHA256(message) instead
            const hash = sha256(msgBytes);
            verified = ed25519.verify(sigBytes, hash, pubKeyBytes);
          }
        } catch (e) { console.error("wallet link SVM verify error:", (e).message || String(e)); verified = false; }
      } else if (chainType === "COSMOS") {
        try {
          // Keplr signArbitrary returns Amino-encoded base64 public key and raw signature
          const pubKeyBytes = Buffer.from(body.publicKey ?? "", "base64");
          const sigBytes = Buffer.from(body.signature, "base64");
          const msgBytes = new TextEncoder().encode(body.message);
          // Amino pubKey prefix is variable-length (protobuf-encoded), strip to get compressed secp256k1 key (33 bytes)
          const keyBytes = pubKeyBytes.length > 33 ? pubKeyBytes.subarray(pubKeyBytes.length - 33) : pubKeyBytes;
          if (keyBytes.length !== 33) throw new Error("invalid key length");
          const prefix = normalized.split("1")[0];
          if (!prefix || toBech32(prefix, ripemd160(sha256(keyBytes))) !== normalized) {
            throw new Error("public key does not match address");
          }
          // Cosmos ADR-36: double SHA256 of the sorted sign doc
          const hash = sha256(sha256(msgBytes));
          verified = secp256k1.verify(sigBytes, hash, keyBytes);
        } catch (e) { console.error("wallet link Cosmos verify error:", (e).message || String(e)); verified = false; }
      }

      if (!verified) {
        return reply.code(400).send({ error: "invalid_signature" });
      }
      await cacheStore.delete(linkKey);
    }

    const existing = await prisma.linkedWallet.findUnique({
      where: { userId_address: { userId: req.user.id, address: normalized } },
    });
    // Partial unique index on (address) WHERE verificationStatus='SIGNED' enforces
    // single-owner semantics for verified wallets. P2002 here means another user
    // already signed this address — surface as 409 rather than leaking the conflict.
    try {
      if (existing) {
        if (!isViewOnly && existing.verificationStatus !== "SIGNED") {
          const updated = await prisma.linkedWallet.update({
            where: { id: existing.id },
            data: { verificationStatus: "SIGNED", label: body.label?.trim() || existing.label },
          });
          return { wallet: updated };
        }
        return { wallet: existing };
      }

      const wallet = await prisma.linkedWallet.create({
        data: {
          userId: req.user.id,
          address: normalized,
          label: body.label?.trim() || null,
          chainType,
          verificationStatus: isViewOnly ? "UNSIGNED" : "SIGNED",
        },
      });
      return { wallet };
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") {
        return reply.code(409).send({ error: "address_already_verified" });
      }
      throw err;
    }
  });

  app.get("/api/wallets", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const wallets = await prisma.linkedWallet.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
    });
    return { wallets };
  });

  app.delete("/api/wallets/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { id } = WalletIdParamsSchema.parse(req.params);
    const wallet = await prisma.linkedWallet.findUnique({ where: { id } });
    if (!wallet || wallet.userId !== req.user.id) return reply.code(404).send({ error: "not_found" });
    await prisma.linkedWallet.delete({ where: { id } });
    return { ok: true };
  });

  app.patch("/api/wallets/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { id } = WalletIdParamsSchema.parse(req.params);
    const body = LinkedWalletPatchBodySchema.parse(req.body);
    const wallet = await prisma.linkedWallet.findUnique({ where: { id } });
    if (!wallet || wallet.userId !== req.user.id) return reply.code(404).send({ error: "not_found" });
    const updated = await prisma.linkedWallet.update({ where: { id }, data: { label: body.label ?? null } });
    return { wallet: updated };
  });
}
