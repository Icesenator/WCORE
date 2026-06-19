# JWT HttpOnly Cookie Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Bearer token in localStorage with HttpOnly cookie-based JWT auth (access + refresh tokens) with Redis revocation.

**Architecture:** Two HttpOnly cookies (`wcore_access` 15min, `wcore_refresh` 7d) with JWT rotation on each refresh. Redis stores revoked refresh token JTIs. Frontend uses `credentials: "include"` fetch wrapper. Backward compat: Bearer header still accepted during transition.

**Tech Stack:** Fastify, @fastify/cookie, jsonwebtoken, Redis, Next.js, fetch API

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/package.json` | Modify | Add `@fastify/cookie` dependency |
| `apps/api/src/auth.ts` | Rewrite | Cookie-based login, refresh, logout, auth hook |
| `apps/api/src/server.ts` | Modify | Register cookie plugin, CORS credentials |
| `apps/web/lib/auth.ts` | Create | `apiFetch()` wrapper + `handleAuthError()` |
| `apps/web/components/ConnectButton.tsx` | Modify | Cookie-based login, remove localStorage token |
| `apps/web/components/GmButton.tsx` | Modify | Use apiFetch, remove localStorage cleanup |
| `apps/web/components/TokenTable.tsx` | Modify | Use apiFetch |
| `apps/web/components/WalletContent.tsx` | Modify | Use apiFetch |
| `apps/web/components/WelcomeModal.tsx` | Modify | Use apiFetch |
| `apps/web/components/ChainCard.tsx` | Modify | Use apiFetch |
| `apps/web/contexts/GmContext.tsx` | Modify | Use apiFetch |
| `apps/web/hooks/useOnChainGm.ts` | Modify | Use apiFetch |
| `apps/web/hooks/useGmChain.ts` | Modify | Use apiFetch |
| `apps/web/app/HomePageClient.tsx` | Modify | Use apiFetch |
| `apps/web/e2e/profile.spec.ts` | Modify | Update for cookie auth |
| `apps/web/e2e/critical-flows.spec.ts` | Modify | Update for cookie auth |

---

### Task 1: Install @fastify/cookie

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add @fastify/cookie to dependencies**

```json
// apps/api/package.json — add to dependencies:
"@fastify/cookie": "^11.0.0",
```

- [ ] **Step 2: Install**

```bash
cd C:\Users\strau\wcore-web && pnpm install
```

---

### Task 2: Rewrite auth.ts — cookie-based auth

**Files:**
- Modify: `apps/api/src/auth.ts`

- [ ] **Step 1: Replace the entire auth.ts with the new cookie-based implementation**

```typescript
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
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

// JWT secret (same as before)
const _devEnvs = new Set(["development", "test"]);
const _isDevEnv = _devEnvs.has(process.env.NODE_ENV ?? "");
const JWT_SECRET = process.env.JWT_SECRET ?? (_isDevEnv
  ? "wcore-dev-secret-change-in-prod"
  : (() => { throw new Error(`JWT_SECRET must be set when NODE_ENV is "${process.env.NODE_ENV ?? "<unset>"}"`); })());

if (!_isDevEnv) {
  const _weakPatterns = [/change-in-(prod|real-deploy)/i, /placeholder/i, /^wcore-staging-/i, /^test-/i, /^dev-/i];
  if (JWT_SECRET.length < 32 || _weakPatterns.some(rx => rx.test(JWT_SECRET))) {
    throw new Error(`JWT_SECRET is too weak or a known placeholder (NODE_ENV="${process.env.NODE_ENV ?? "<unset>"}"). Rotate to a 32+ char random secret.`);
  }
}

if (!process.env.JWT_SECRET && _isDevEnv) {
  console.warn("[AUTH] JWT_SECRET not set. Using development secret. All existing tokens will be invalidated on server restart.");
}

const NONCE_TTL_MS = 300_000;
const ACCESS_TTL_SEC = 15 * 60;    // 15 minutes
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const REVOCATION_TTL_SEC = 24 * 60 * 60;  // 24 hours (for revoked JTIs)

// Allowed SIWE domains
const _siweAllowedDomains = new Set<string>(
  (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(origin => {
      try { return new URL(origin).hostname; } catch { return ""; }
    })
    .filter(Boolean)
);

// Derive cookie domain from CORS_ORIGIN for production
// In dev (localhost), no domain is set (browser defaults to request host)
function getCookieDomain(): string | undefined {
  const origins = (process.env.CORS_ORIGIN ?? "").split(",").map(s => s.trim()).filter(Boolean);
  for (const origin of origins) {
    try {
      const hostname = new URL(origin).hostname;
      // Only set domain for non-localhost production domains
      if (hostname !== "localhost" && hostname !== "127.0.0.1" && !hostname.startsWith("192.168.")) {
        // Return the registrable domain (e.g., ".wcore.xyz" from "api.wcore.xyz")
        const parts = hostname.split(".");
        if (parts.length >= 2) {
          return "." + parts.slice(-2).join(".");
        }
      }
    } catch { /* skip */ }
  }
  return undefined;
}

export interface AuthUser {
  id: string;
  address: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

function signTokens(user: { id: string; address: string }) {
  const accessJti = randomBytes(16).toString("hex");
  const refreshJti = randomBytes(16).toString("hex");
  const now = Math.floor(Date.now() / 1000);

  const accessToken = jwt.sign(
    { sub: user.id, address: user.address, jti: accessJti, type: "access" },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL_SEC }
  );

  const refreshToken = jwt.sign(
    { sub: user.id, address: user.address, jti: refreshJti, type: "refresh" },
    JWT_SECRET,
    { expiresIn: REFRESH_TTL_SEC }
  );

  return { accessToken, refreshToken, refreshJti };
}

function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  const domain = getCookieDomain();
  const secure = process.env.NODE_ENV === "production";
  const baseOpts = {
    httpOnly: true as const,
    secure,
    sameSite: "lax" as const,
    path: "/",
    ...(domain ? { domain } : {}),
  };

  reply.setCookie("wcore_access", accessToken, {
    ...baseOpts,
    maxAge: ACCESS_TTL_SEC,
  });

  reply.setCookie("wcore_refresh", refreshToken, {
    ...baseOpts,
    maxAge: REFRESH_TTL_SEC,
  });
}

function clearAuthCookies(reply: FastifyReply) {
  const domain = getCookieDomain();
  const baseOpts = {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/" as const,
    ...(domain ? { domain } : {}),
  };

  reply.clearCookie("wcore_access", baseOpts);
  reply.clearCookie("wcore_refresh", baseOpts);
}

async function verifyJwt(token: string): Promise<{ sub: string; address: string; jti: string } | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; address: string; jti: string; type: string };
    return { sub: payload.sub, address: payload.address, jti: payload.jti };
  } catch {
    return null;
  }
}

export async function authPlugin(app: FastifyInstance, prisma: PrismaClient, cacheStore: CacheStore) {
  app.decorateRequest("user", undefined);

  // Auth hook: try cookie first, then fall back to Bearer header
  app.addHook("onRequest", async (req) => {
    // 1. Try access cookie
    const accessCookie = (req as unknown as { cookies?: Record<string, string> }).cookies?.["wcore_access"];
    if (accessCookie) {
      const payload = await verifyJwt(accessCookie);
      if (payload) {
        req.user = { id: payload.sub, address: payload.address };
        return;
      }
    }

    // 2. Backward compat: Bearer header
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return;
    try {
      const token = auth.slice(7);
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string; address: string };
      req.user = { id: payload.sub, address: payload.address };
    } catch {
      // invalid token → anonymous
    }
  });

  // Nonce endpoint (unchanged)
  app.get("/api/auth/nonce", async (req) => {
    const parsed = NonceQuerySchema.safeParse(req.query);
    if (!parsed.success) return { error: "missing_address" };
    const { address, chainId } = parsed.data;
    const nonce = randomBytes(16).toString("hex");
    const key = `nonce:${address.toLowerCase()}`;
    await cacheStore.set(key, JSON.stringify({ nonce, chainId, issuedAt: new Date().toISOString() }), NONCE_TTL_MS);

    const corsOrigins = process.env.CORS_ORIGIN?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
    const webOrigin = corsOrigins[0] ?? `https://localhost`;
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

  // Login: return cookies instead of JSON token
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

      let storedNonce: string;
      let storedChainId = 0;
      try {
        const parsed = JSON.parse(storedRaw) as { nonce: string; chainId: number; issuedAt: string };
        storedNonce = parsed.nonce;
        storedChainId = parsed.chainId;
      } catch {
        storedNonce = storedRaw;
      }
      if (!message.includes(storedNonce)) {
        return { error: "invalid_or_expired_nonce" };
      }

      const lines = message.split("\n");
      const siweDomain = lines[0]?.split(" wants you to sign")[0] ?? "";
      const siweUri = lines.find(l => l.startsWith("URI: "))?.replace("URI: ", "") ?? "";
      const siweChainId = parseInt(lines.find(l => l.startsWith("Chain ID: "))?.replace("Chain ID: ", "") ?? "0", 10);
      const _siweIssuedAt = lines.find(l => l.startsWith("Issued At: "))?.replace("Issued At: ", "") ?? "";
      const siweExpiration = lines.find(l => l.startsWith("Expiration Time: "))?.replace("Expiration Time: ", "") ?? "";

      if (!siweExpiration) return { error: "siwe_expiration_missing" };
      if (new Date(siweExpiration).getTime() < Date.now()) return { error: "expired_session" };
      if (!siweChainId) return { error: "siwe_chain_id_missing" };
      if (storedChainId > 0 && siweChainId !== storedChainId) return { error: "chain_id_mismatch" };

      const siweDomainHost = siweDomain.split(":")[0]?.toLowerCase() ?? "";
      if (!siweDomainHost) return { error: "siwe_domain_missing" };
      if (!_isDevEnv && _siweAllowedDomains.size === 0) return { error: "siwe_domain_allowlist_missing" };
      if (!_isDevEnv && !_siweAllowedDomains.has(siweDomainHost)) return { error: "siwe_domain_not_allowed" };
      if (siweUri) {
        try {
          const uriHost = new URL(siweUri).hostname.toLowerCase();
          if (uriHost !== siweDomainHost) return { error: "siwe_uri_mismatch" };
        } catch { return { error: "siwe_uri_invalid" }; }
      }

      const recovered = await recoverAddress({ hash: hashMessage(message), signature: signature as `0x${string}` });
      if (recovered.toLowerCase() !== address.toLowerCase()) return { error: "invalid_signature" };
      await cacheStore.delete(nonceKey);

      const normalizedAddress = address.toLowerCase();
      const isPlatformOwner = normalizedAddress === "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
      const referralCode = body.ref?.trim()?.toLowerCase();

      const user = await prisma.user.upsert({
        where: { address: normalizedAddress },
        update: { lastLoginAt: new Date(), ...(isPlatformOwner ? { plan: "admin" } : {}) },
        create: {
          address: normalizedAddress, lastLoginAt: new Date(),
          ...(isPlatformOwner ? { plan: "admin" } : {}),
          referralCode: normalizedAddress.substring(2, 10),
        },
      });

      if (!user.referredById) {
        let referrerId: string | null = null;
        if (referralCode) {
          const referrer = await prisma.user.findFirst({ where: { referralCode, id: { not: user.id } }, select: { id: true } });
          if (referrer) referrerId = referrer.id;
        }
        if (!referrerId) {
          const platformOwner = await prisma.user.findUnique({ where: { address: "0x17d518736ee9341dcdc0a2498e013d33cfcdd080" }, select: { id: true } });
          if (platformOwner) referrerId = platformOwner.id;
        }
        if (referrerId) {
          await prisma.user.update({ where: { id: user.id }, data: { referredById: referrerId } });
        }
      }

      const { accessToken, refreshToken } = signTokens({ id: user.id, address: user.address });
      setAuthCookies(reply, accessToken, refreshToken);

      return reply.send({ user: { id: user.id, address: user.address } });
    } catch (error) {
      console.error("[AUTH] login failed:", error instanceof Error ? error.message : String(error));
      return { error: "auth_failed", message: error instanceof Error ? error.message : String(error) };
    }
  });

  // Refresh endpoint: rotate tokens
  app.post("/api/auth/refresh", async (req, reply) => {
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
    const refreshCookie = cookies?.["wcore_refresh"];
    if (!refreshCookie) return reply.code(401).send({ error: "no_refresh_token" });

    const payload = await verifyJwt(refreshCookie);
    if (!payload) return reply.code(401).send({ error: "invalid_refresh_token" });

    // Check revocation
    const revoked = await cacheStore.get<string>(`revoked:${payload.jti}`);
    if (revoked) return reply.code(401).send({ error: "token_revoked" });

    // Verify user still exists
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, address: true } });
    if (!user) return reply.code(401).send({ error: "user_not_found" });

    // Revoke old refresh token
    await cacheStore.set(`revoked:${payload.jti}`, "1", REVOCATION_TTL_SEC);

    // Issue new token pair
    const { accessToken, refreshToken } = signTokens(user);
    setAuthCookies(reply, accessToken, refreshToken);

    return reply.send({ user: { id: user.id, address: user.address } });
  });

  // Logout endpoint
  app.post("/api/auth/logout", async (req, reply) => {
    const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
    const refreshCookie = cookies?.["wcore_refresh"];

    if (refreshCookie) {
      const payload = await verifyJwt(refreshCookie);
      if (payload) {
        await cacheStore.set(`revoked:${payload.jti}`, "1", REVOCATION_TTL_SEC);
      }
    }

    clearAuthCookies(reply);
    return reply.send({ ok: true });
  });

  // GET /api/auth/me (unchanged logic)
  app.get("/api/auth/me", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return reply.code(401).send({ error: "user_not_found" });

    const streak = user.gmStreak as number;
    const today = new Date().toISOString().slice(0, 10);
    const [onchainGms, chainGms, quests] = await Promise.all([
      prisma.onchainGm.findMany({ where: { userId: user.id }, select: { chainKey: true, createdAt: true } }),
      prisma.userChainGm.findMany({ where: { userId: user.id }, select: { chainKey: true, gmStreak: true } }),
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
    const gmPts = (user.score as number) - questPts - offChainPts;

    const breakdown = {
      offChain: { days: streak, points: offChainPts, detail: `10 + streak bonus × ${streak} jours` },
      onChain: { count: onchainGms.length, points: gmPts, detail: onchainGms.length > 0 ? `${onchainGms.length} TX on-chain` : "Aucune TX enregistrée" },
      perChain: chainGms.map((cg: Record<string, unknown>) => ({ chain: cg.chainKey, streak: cg.gmStreak })),
      quests: quests.map((q: Record<string, unknown>) => {
        const quest = q.quest as Record<string, unknown>;
        return { key: quest.key, title: quest.title, points: quest.scoreReward };
      }),
      questPts,
    };

    return {
      id: user.id, address: user.address, score: user.score as number,
      gmStreak: streak, longestStreak: user.longestStreak as number,
      lastGmDate: user.lastGmDate, gmOffChainToday, gmOnChainToday,
      chainGmToday, referralCode: user.referralCode,
      referralEarnings: user.referralEarnings as number,
      welcomeCompleted: user.welcomeCompleted as boolean,
      breakdown,
    };
  });

  app.post("/api/auth/welcome", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    await prisma.user.update({ where: { id: req.user.id }, data: { welcomeCompleted: true } });
    return { ok: true };
  });

  // Profile endpoint (unchanged)
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
      address: user.address, score: user.score, gmStreak: user.gmStreak,
      longestStreak: user.longestStreak,
      badges: user.badges.map((ub: Record<string, unknown>) => ub["badge"]),
      wallets: user.wallets
        .filter((w: Record<string, unknown>) => w["verificationStatus"] === "SIGNED")
        .map((w: Record<string, unknown>) => ({
          id: w["id"], address: w["address"], label: w["label"],
          chainType: w["chainType"], verificationStatus: w["verificationStatus"],
        })),
      recentScans: user.scans.map((s: Record<string, unknown>) => ({
        chains: s["chains"], totalEur: s["totalEur"],
        tokenCount: s["tokenCount"], createdAt: s["createdAt"],
      })),
    };
  });

  // Wallet endpoints (unchanged)
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

    if (!isViewOnly && body.signature && body.message) {
      const linkKey = `link_nonce:${normalized}`;
      const storedLinkNonce = await cacheStore.get<string>(linkKey);
      if (!storedLinkNonce || !body.message.includes(storedLinkNonce)) {
        return reply.code(400).send({ error: "invalid_or_expired_nonce" });
      }

      let verified = false;
      if (chainType === "EVM") {
        try {
          const recovered = await recoverAddress({ hash: hashMessage(body.message), signature: body.signature as `0x${string}` });
          verified = recovered.toLowerCase() === normalized;
        } catch (e) { console.error("wallet link EVM verify error:", (e).message || String(e)); verified = false; }
      } else if (chainType === "SVM") {
        try {
          const pubKeyBytes = bs58.decode(body.publicKey ?? "");
          const sigBytes = bs58.decode(body.signature);
          const msgBytes = new TextEncoder().encode(body.message);
          if (bs58.encode(pubKeyBytes) !== normalized) throw new Error("public key does not match address");
          verified = ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
          if (!verified && sigBytes.length === 64) {
            const hash = sha256(msgBytes);
            verified = ed25519.verify(sigBytes, hash, pubKeyBytes);
          }
        } catch (e) { console.error("wallet link SVM verify error:", (e).message || String(e)); verified = false; }
      } else if (chainType === "COSMOS") {
        try {
          const pubKeyBytes = Buffer.from(body.publicKey ?? "", "base64");
          const sigBytes = Buffer.from(body.signature, "base64");
          const msgBytes = new TextEncoder().encode(body.message);
          const keyBytes = pubKeyBytes.length > 33 ? pubKeyBytes.subarray(pubKeyBytes.length - 33) : pubKeyBytes;
          if (keyBytes.length !== 33) throw new Error("invalid key length");
          const prefix = normalized.split("1")[0];
          if (!prefix || toBech32(prefix, ripemd160(sha256(keyBytes))) !== normalized) {
            throw new Error("public key does not match address");
          }
          const hash = sha256(sha256(msgBytes));
          verified = secp256k1.verify(sigBytes, hash, keyBytes);
        } catch (e) { console.error("wallet link Cosmos verify error:", (e).message || String(e)); verified = false; }
      }

      if (!verified) return reply.code(400).send({ error: "invalid_signature" });
      await cacheStore.delete(linkKey);
    }

    const existing = await prisma.linkedWallet.findUnique({
      where: { userId_address: { userId: req.user.id, address: normalized } },
    });
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
          userId: req.user.id, address: normalized,
          label: body.label?.trim() || null, chainType,
          verificationStatus: isViewOnly ? "UNSIGNED" : "SIGNED",
        },
      });
      return { wallet };
    } catch (err: unknown) {
      const code = (err as { code?: string } | null)?.code;
      if (code === "P2002") return reply.code(409).send({ error: "address_already_verified" });
      throw err;
    }
  });

  app.get("/api/wallets", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const wallets = await prisma.linkedWallet.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "asc" } });
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
```

---

### Task 3: Update server.ts — register cookie plugin + CORS credentials

**Files:**
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Add @fastify/cookie import**

Add after line 3:
```typescript
import cookie from "@fastify/cookie";
```

- [ ] **Step 2: Register cookie plugin before CORS**

Add after line 214 (after the cors registration, before helmet):
```typescript
await app.register(cookie, {
  hook: "onRequest",
});
```

- [ ] **Step 3: Update CORS to allow credentials**

Change line 214-218 from:
```typescript
await app.register(cors, {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(s => s.trim()) : (process.env.NODE_ENV === "production" ? false : true),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
```

To:
```typescript
await app.register(cors, {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(s => s.trim()) : (process.env.NODE_ENV === "production" ? false : true),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
```

- [ ] **Step 4: Update rateLimitIdentity to also check cookies**

Change the `rateLimitIdentity` function (lines 130-138) from:
```typescript
function rateLimitIdentity(req: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
  const auth = req.headers["authorization"] as string | undefined;
  if (auth?.startsWith("Bearer ") && auth.length > 20) {
    return "u:" + createHash("sha256").update(auth.slice(7)).digest("base64url").slice(0, 16);
  }
  return "ip:" + req.ip;
}
```

To:
```typescript
function rateLimitIdentity(req: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
  const auth = req.headers["authorization"] as string | undefined;
  if (auth?.startsWith("Bearer ") && auth.length > 20) {
    return "u:" + createHash("sha256").update(auth.slice(7)).digest("base64url").slice(0, 16);
  }
  // Cookie-based auth: hash the access cookie value
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies;
  const accessCookie = cookies?.["wcore_access"];
  if (accessCookie && accessCookie.length > 20) {
    return "u:" + createHash("sha256").update(accessCookie).digest("base64url").slice(0, 16);
  }
  return "ip:" + req.ip;
}
```

---

### Task 4: Create frontend auth helper

**Files:**
- Create: `apps/web/lib/auth.ts`

- [ ] **Step 1: Create the auth helper**

```typescript
import { getApiUrl } from "./api";

const API_URL = getApiUrl();

/**
 * Drop-in replacement for fetch() that automatically:
 * - Sends cookies (credentials: "include")
 * - Retries on 401 via /api/auth/refresh
 * - Clears auth state if refresh also fails
 */
export async function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const fullUrl = url.startsWith("http") ? url : `${API_URL}${url}`;

  const res = await fetch(fullUrl, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });

  if (res.status === 401) {
    // Try to refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Retry original request with new cookies
      return fetch(fullUrl, {
        ...opts,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...opts.headers,
        },
      });
    }
    // Refresh failed — clear client state
    clearAuthState();
  }

  return res;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) return true;
    return false;
  } catch {
    return false;
  }
}

function clearAuthState() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("wcore_token");
  localStorage.removeItem("wcore_address");
  // Dispatch event so components can react
  window.dispatchEvent(new CustomEvent("wcore-auth-cleared"));
}

/**
 * Handle a 401 response: try refresh, then clear state.
 * Returns true if the request should be retried.
 */
export async function handleAuthError(): Promise<boolean> {
  const refreshed = await tryRefresh();
  if (!refreshed) {
    clearAuthState();
  }
  return refreshed;
}

/**
 * Logout: call server-side logout + clear client state
 */
export async function apiLogout(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch { /* server may already have cleared */ }
  clearAuthState();
}
```

---

### Task 5: Update ConnectButton.tsx — cookie-based login

**Files:**
- Modify: `apps/web/components/ConnectButton.tsx`

- [ ] **Step 1: Replace the entire ConnectButton.tsx**

Key changes:
1. Import `apiFetch` from `@/lib/auth`
2. Rehydration: try `/api/auth/me` with `credentials: "include"` instead of Bearer header
3. Login: remove `localStorage.setItem("wcore_token", ...)` — cookies are set by server
4. Disconnect: call `/api/auth/logout` endpoint + clear localStorage address only
5. Keep `wcore_address` in localStorage for UI state (not auth)

```typescript
"use client";
import { getApiUrl } from "@/lib/api";
import { apiFetch, apiLogout } from "@/lib/auth";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, useConnectors } from "wagmi";

const API_URL = getApiUrl();

type AuthStep = "idle" | "connecting" | "signing" | "verifying" | "authenticated" | "expired";

interface WalletState {
  address: string | null;
  token: string | null;
  loading: boolean;
  authStep: AuthStep;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
}

const WalletCtx = createContext<WalletState>({
  address: null, token: null, loading: false, authStep: "idle", error: "",
  connect: async () => {}, disconnect: () => {}, clearError: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const connectors = useConnectors();

  const [address, setAddress] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>("idle");
  const [error, setError] = useState("");

  // Rehydrate: check cookie auth via /api/auth/me
  useEffect(() => {
    const storedAddr = localStorage.getItem("wcore_address");

    apiFetch(`${API_URL}/api/auth/me`)
      .then(r => {
        if (r.ok) return r.json();
        if (r.status === 401) {
          setAddress(null);
          setToken(null);
          localStorage.removeItem("wcore_address");
          setAuthStep("expired");
          return null;
        }
        return null;
      })
      .then((data: { id?: string; address?: string } | null) => {
        if (data?.address) {
          setToken("cookie"); // signal that auth is active (via cookie)
          setAddress(data.address.toLowerCase());
          localStorage.setItem("wcore_address", data.address.toLowerCase());
          setAuthStep("authenticated");
        }
      })
      .catch(() => {
        // Network error — check if we have a stored address
        if (storedAddr) {
          setToken("cookie");
          setAddress(storedAddr);
          setAuthStep("authenticated");
        }
      });
  }, []);

  // Listen for auth cleared event
  useEffect(() => {
    const handler = () => {
      setAddress(null);
      setToken(null);
      setAuthStep("expired");
    };
    window.addEventListener("wcore-auth-cleared", handler);
    return () => window.removeEventListener("wcore-auth-cleared", handler);
  }, []);

  // Sync wagmi account
  useEffect(() => {
    if (isConnected && wagmiAddress) {
      const addr = wagmiAddress.toLowerCase();
      setAddress(addr);
      localStorage.setItem("wcore_address", addr);
      if (!token) setAuthStep("idle");
    }
  }, [isConnected, wagmiAddress, token]);

  const connect = useCallback(async () => {
    setError("");
    const hasInjected = typeof window !== "undefined" && !!window.ethereum;
    const hasWalletConnect = connectors.some(c => c.id === "walletConnect");
    let connector;
    if (hasInjected) {
      connector = connectors.find(c => c.id === "injected" || c.id === "metaMaskSDK" || c.type === "injected");
    }
    if (!connector && hasWalletConnect) {
      connector = connectors.find(c => c.id === "walletConnect");
    }
    if (!connector) {
      setError("No wallet detected. Install MetaMask or configure WalletConnect.");
      return;
    }

    setLoading(true);
    setAuthStep("connecting");
    try {
      let addr = wagmiAddress?.toLowerCase() ?? "";
      let chainId = 0;
      if (!isConnected || !addr) {
        const result = await connectAsync({ connector });
        addr = result.accounts[0]?.toLowerCase() ?? "";
        chainId = result.chainId;
      }
      if (!addr) throw new Error("No account returned from wallet.");
      setAddress(addr);

      setAuthStep("signing");
      const nonceRes = await fetch(`${API_URL}/api/auth/nonce?address=${addr}&chainId=${chainId || 1}`, { credentials: "include" });
      if (!nonceRes.ok) throw new Error("network_error");
      const nonceData = await nonceRes.json() as { message?: string; error?: string };
      if (!nonceData.message) throw new Error(nonceData.error === "missing_address" ? "invalid_address" : "nonce_failed");

      let signature: string;
      try {
        signature = await signMessageAsync({ message: nonceData.message, connector, account: addr as `0x${string}` });
      } catch {
        throw new Error("signature_refused");
      }

      setAuthStep("verifying");
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") : null;
      const loginBody: Record<string, string> = { message: nonceData.message, signature, address: addr };
      if (urlParams) loginBody.ref = urlParams;
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(loginBody),
      });
      const data = await res.json() as { user?: { id: string; address: string }; error?: string };
      if (data.user) {
        setToken("cookie");
        localStorage.setItem("wcore_address", addr);
        setAuthStep("authenticated");
      } else {
        throw new Error(data.error === "invalid_signature" ? "invalid_signature"
          : data.error === "invalid_or_expired_nonce" ? "expired_nonce"
          : data.error === "expired_session" ? "session_expired"
          : data.error ?? "auth_failed");
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "signature_refused") setError("Signature was declined. Please try again.");
      else if (msg === "network_error") setError("Network error. Check your connection and retry.");
      else if (msg === "invalid_signature") setError("Invalid signature. Please try signing again.");
      else if (msg === "expired_nonce" || msg === "session_expired") setError("Session expired. Please try connecting again.");
      else if (msg === "nonce_failed") setError("Could not generate a login challenge. Retry.");
      else setError(msg.includes("User rejected") ? "Connection was cancelled." : msg.includes("Connector") ? "Wallet connection failed." : `Connection failed: ${msg}`);

      try { wagmiDisconnect(); } catch { /* ignore */ }
      setAddress(null);
      setToken(null);
      setAuthStep("idle");
    } finally {
      setLoading(false);
    }
  }, [connectAsync, isConnected, signMessageAsync, connectors, wagmiAddress, wagmiDisconnect]);

  const disconnect = useCallback(async () => {
    await apiLogout();
    setAddress(null);
    setToken(null);
    setError("");
    setAuthStep("idle");
    wagmiDisconnect();
  }, [wagmiDisconnect]);

  const clearError = useCallback(() => setError(""), []);

  return (
    <WalletCtx.Provider value={{ address, token, loading, authStep, error, connect, disconnect, clearError }}>
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallet(): WalletState {
  return useContext(WalletCtx);
}

export function ConnectButton() {
  const { address, token, loading, authStep, error, connect, disconnect, clearError } = useWallet();
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const stepLabel = authStep === "connecting" ? "Connecting wallet..."
    : authStep === "signing" ? "Signing..."
    : authStep === "verifying" ? "Verifying..."
    : "";

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
        </span>
        <span className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted">{stepLabel}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-400 max-w-[200px] truncate">{error}</span>
        <button type="button" onClick={clearError} className="text-xs text-muted hover:text-fg">✕</button>
      </div>
    );
  }

  if (authStep === "expired") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-yellow-400">Session expired</span>
        <button type="button" onClick={connect} className="rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition">
          Reconnect
        </button>
      </div>
    );
  }

  if ((address || isConnected) && !token) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" title="Wallet connected, sign-in required" />
        <span className="text-xs text-yellow-400">Sign in required</span>
        <button type="button" onClick={connect} className="rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition">
          Sign in
        </button>
        <button type="button" onClick={disconnect} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-fg transition">
          Disconnect
        </button>
      </div>
    );
  }

  if (address || isConnected) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" title="Connected" />
        <span className="text-xs text-accent font-mono truncate max-w-[120px]">
          {(address ?? "").slice(0, 6)}...{(address ?? "").slice(-4)}
        </span>
        <button type="button" onClick={disconnect} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-fg transition">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={connect} className="rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition">
      Connect wallet
    </button>
  );
}
```

---

### Task 6: Update GmButton.tsx

**Files:**
- Modify: `apps/web/components/GmButton.tsx`

- [ ] **Step 1: Replace Bearer auth with apiFetch**

Changes:
- Import `apiFetch` from `@/lib/auth`
- Replace `fetch(..., { headers: { authorization: ... } })` with `apiFetch(...)`
- Remove `localStorage.removeItem("wcore_token")` calls (server handles logout)

```typescript
"use client";
import { getApiUrl } from "@/lib/api";
import { apiFetch } from "@/lib/auth";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "./ConnectButton";
import { Logo } from "./Logo";
import { useOnChainGm } from "@/hooks/useOnChainGm";

const API_URL = getApiUrl();

export function GmButton() {
  const { address, token } = useWallet();
  const [streak, setStreak] = useState<number | null>(null);
  const [alreadyOffChain, setAlreadyOffChain] = useState(false);
  const [alreadyOnChain, setAlreadyOnChain] = useState(false);
  const [offchainSending, setOffchainSending] = useState(false);
  const [showChoice, setShowChoice] = useState(false);

  const { sendGm, sending } = useOnChainGm({
    walletAddress: address,
    streak: streak ?? 0,
  });

  const fetchGmStatus = useCallback(() => {
    if (!token) return;
    apiFetch(`${API_URL}/api/auth/me`)
      .then(r => {
        if (!r.ok) return;
        return r.json();
      })
      .then((d: { gmStreak?: number; gmOffChainToday?: boolean; gmOnChainToday?: boolean } | void) => {
        if (d && d.gmStreak != null) setStreak(d.gmStreak);
        if (d) setAlreadyOffChain(!!d.gmOffChainToday);
        if (d) setAlreadyOnChain(!!d.gmOnChainToday);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!address) return;
    fetchGmStatus();

    const handler = () => fetchGmStatus();
    window.addEventListener("wcore-gm-done", handler);
    window.addEventListener("focus", fetchGmStatus);
    return () => {
      window.removeEventListener("wcore-gm-done", handler);
      window.removeEventListener("focus", fetchGmStatus);
    };
  }, [address, fetchGmStatus]);

  const doOffChainGm = useCallback(async () => {
    if (!token || alreadyOffChain || offchainSending) return;
    setOffchainSending(true);
    setShowChoice(false);
    try {
      const res = await apiFetch(`${API_URL}/api/gm`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data = await res.json() as { error?: string; streak?: number };
      if (res.status === 401 || data.error === "not_authenticated") {
        window.location.reload();
        return;
      }
      if (data.error) { alert(data.error); return; }
      setStreak(data.streak ?? streak);
      fetchGmStatus();
      window.dispatchEvent(new CustomEvent("wcore-gm-done"));
    } catch (_e) { console.error("Off-chain GM failed:", _e); alert("GM failed"); }
    finally { setOffchainSending(false); }
  }, [token, alreadyOffChain, offchainSending, streak, fetchGmStatus]);

  const doOnChainGm = useCallback(async () => {
    if (!address || sending) return;
    setShowChoice(false);
    try {
      await sendGm();
      fetchGmStatus();
    } catch (e) {
      alert((e as Error).message || "On-chain GM failed");
    }
  }, [address, sending, sendGm, fetchGmStatus]);

  if (!address) return null;

  const hasDoneAnyGm = alreadyOffChain || alreadyOnChain;
  const offchainDisabled = !token || alreadyOffChain || offchainSending;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { fetchGmStatus(); setShowChoice(!showChoice); }}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          hasDoneAnyGm
            ? "border-accent/30 bg-accent/5 text-accent"
            : "border-yellow-400/30 bg-yellow-400/5 text-yellow-400 hover:bg-yellow-400/10"
        }`}
      >
        {hasDoneAnyGm ? "✅ GM" : "Say GM"}
        {streak != null && streak > 0 ? (
          <span className="text-accent">{streak}d 🔥</span>
        ) : null}
      </button>

      {showChoice ? (
        <div className="absolute top-full mt-1 right-0 z-50 rounded-lg border border-border bg-card p-2 shadow-lg min-w-[200px]">
          <button
            type="button"
            onClick={doOffChainGm}
            disabled={offchainDisabled}
            className={`w-full text-left rounded px-3 py-2 text-xs transition ${offchainDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/5"}`}
          >
            <span className="font-medium">🌐 Off-chain</span>
            <span className="text-muted ml-2">{!token ? "Sign in required" : alreadyOffChain ? "Done today" : offchainSending ? "Sending..." : "Free · 10+ pts"}</span>
          </button>
          <button
            type="button"
            onClick={doOnChainGm}
            disabled={sending || alreadyOnChain}
            className={`w-full text-left rounded px-3 py-2 text-xs transition ${alreadyOnChain ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/5"}`}
          >
            <span className="font-medium">⛽ On-chain</span>
            <span className="text-muted ml-2">{alreadyOnChain ? "Done today" : "+25 pts"}</span>
            {sending ? <Logo className="h-3 w-3 text-accent animate-spin inline-block ml-1" /> : null}
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

---

### Task 7: Update useOnChainGm.ts

**Files:**
- Modify: `apps/web/hooks/useOnChainGm.ts`

- [ ] **Step 1: Replace all localStorage token reads with apiFetch**

Key changes:
- Import `apiFetch` from `@/lib/auth`
- Replace `fetch(..., { headers: { authorization: ... } })` with `apiFetch(...)`
- The `localStorage.getItem("wcore_token")` checks become `typeof window !== "undefined" && document.cookie.includes("wcore_access")` or just rely on apiFetch returning 401

```typescript
// At top, add:
import { apiFetch } from "@/lib/auth";

// checkHasDeployed (line 90-109): replace the token check and fetch
// FROM:
const token = typeof window !== "undefined" ? localStorage.getItem("wcore_token") : null;
if (token) {
  const depRes = await fetch(`${API_URL}/api/gm/has-deployed?chain=${chain}`, { headers: { authorization: `Bearer ${token}` } });
// TO:
const depRes = await apiFetch(`${API_URL}/api/gm/has-deployed?chain=${chain}`);
if (depRes.ok) {

// getUserContract (line 162-183): replace
// FROM:
const token = typeof window !== "undefined" ? localStorage.getItem("wcore_token") : null;
if (!token) return null;
try {
  const res = await fetch(`${API_URL}/api/gm/my-contracts`, { headers: { authorization: `Bearer ${token}` } });
// TO:
try {
  const res = await apiFetch(`${API_URL}/api/gm/my-contracts`);
  if (!res.ok) return null;

// sendGm backend record (line 232-247): replace
// FROM:
const token = typeof window !== "undefined" ? localStorage.getItem("wcore_token") : null;
if (token) {
  try {
    const res = await fetch(`${API_URL}/api/gm/onchain`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ txHash, chainKey, contractAddress }),
    });
// TO:
try {
  await apiFetch(`${API_URL}/api/gm/onchain`, {
    method: "POST",
    body: JSON.stringify({ txHash, chainKey, contractAddress }),
  });
} catch (err) {
  console.warn("Backend GM record unreachable:", (err as Error).message);
}

// deployContract verify (line 327-336): replace
// FROM:
const token = typeof window !== "undefined" ? localStorage.getItem("wcore_token") : null;
const verifyRes = await fetch(`${API_URL}/api/gm/contracts/deploy`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ chainKey: config.chainKey, contractAddress, txHash }),
});
// TO:
const verifyRes = await apiFetch(`${API_URL}/api/gm/contracts/deploy`, {
  method: "POST",
  body: JSON.stringify({ chainKey: config.chainKey, contractAddress, txHash }),
});
```

---

### Task 8: Update useGmChain.ts

**Files:**
- Modify: `apps/web/hooks/useGmChain.ts`

- [ ] **Step 1: Replace token check with apiFetch**

```typescript
// At top, add:
import { apiFetch } from "@/lib/auth";

// checkStatus (line 26-47): replace
// FROM:
const token = typeof window !== "undefined" ? window.localStorage.getItem("wcore_token") : null;
if (!token) return;
try {
  const res = await fetch(`${API_URL}/api/gm/status`, { headers: { authorization: `Bearer ${token}` } });
// TO:
try {
  const res = await apiFetch(`${API_URL}/api/gm/status`);
  if (!res.ok) return;
```

---

### Task 9: Update HomePageClient.tsx

**Files:**
- Modify: `apps/web/app/HomePageClient.tsx`

- [ ] **Step 1: Read the file first, then update**

Read lines around 113 and 150 to see the exact context, then replace:
- `localStorage.getItem("wcore_token")` → use `apiFetch` which handles auth via cookies
- `fetch(..., { headers: { authorization: ... } })` → `apiFetch(...)`

---

### Task 10: Update remaining frontend files

**Files:**
- Modify: `apps/web/components/TokenTable.tsx`
- Modify: `apps/web/components/WalletContent.tsx`
- Modify: `apps/web/components/WelcomeModal.tsx`
- Modify: `apps/web/components/ChainCard.tsx`
- Modify: `apps/web/contexts/GmContext.tsx`

- [ ] **Step 1: For each file, apply the same pattern:**
  1. Add `import { apiFetch } from "@/lib/auth";`
  2. Replace `localStorage.getItem("wcore_token")` token reads — for conditional checks, use `typeof window !== "undefined"` or just try the apiFetch call
  3. Replace `fetch(url, { headers: { authorization: `Bearer ${token}` } })` → `apiFetch(url)`
  4. Remove `localStorage.removeItem("wcore_token")` calls (server handles this)

**TokenTable.tsx (line 83):**
```typescript
// FROM:
const token = window.localStorage.getItem("wcore_token");
// ... fetch with Bearer header
// TO:
const res = await apiFetch(url);
```

**WalletContent.tsx (lines 133, 807, 845):**
```typescript
// FROM:
const token = localStorage.getItem("wcore_token");
// ... fetch with Bearer header
// TO:
const res = await apiFetch(url);
```

**WelcomeModal.tsx (line 24):**
```typescript
// FROM:
const token = typeof window !== "undefined" ? window.localStorage.getItem("wcore_token") : null;
// TO:
// Just use apiFetch — it handles auth automatically
```

**ChainCard.tsx (line 114):**
```typescript
// FROM:
const token = localStorage.getItem("wcore_token");
// ... fetch with Bearer header
// TO:
const res = await apiFetch(url);
```

**GmContext.tsx (line 72):**
```typescript
// FROM:
const token = typeof window !== "undefined" ? localStorage.getItem("wcore_token") : null;
// ... fetch with Bearer header
// TO:
const res = await apiFetch(url);
```

---

### Task 11: Update e2e tests

**Files:**
- Modify: `apps/web/e2e/profile.spec.ts`
- Modify: `apps/web/e2e/critical-flows.spec.ts`

- [ ] **Step 1: Update profile.spec.ts**

```typescript
// Line 13: FROM:
localStorage.setItem("wcore_token", "test-token");
// TO:
// For e2e tests with Playwright, set cookies instead:
await page.context().addCookies([{
  name: "wcore_access",
  value: "e2e-token",
  domain: "localhost",
  path: "/",
  httpOnly: true,
  secure: false,
}]);
```

- [ ] **Step 2: Update critical-flows.spec.ts**

```typescript
// Line 198: FROM:
await expect.poll(() => page.evaluate(() => localStorage.getItem("wcore_token"))).toBe("e2e-token");
// TO:
// Check cookie instead
await expect.poll(async () => {
  const cookies = await page.context().cookies();
  return cookies.find(c => c.name === "wcore_access")?.value;
}).toBe("e2e-token");
```

---

### Task 12: Verify and test

- [ ] **Step 1: Typecheck API**

```bash
cd C:\Users\strau\wcore-web\apps\api && npx tsc --noEmit
```

- [ ] **Step 2: Typecheck Web**

```bash
cd C:\Users\strau\wcore-web\apps\web && npx tsc --noEmit
```

- [ ] **Step 3: Run API tests**

```bash
cd C:\Users\strau\wcore-web\apps\api && pnpm test
```

- [ ] **Step 4: Start dev server and verify login flow manually**

```bash
cd C:\Users\strau\wcore-web && pnpm dev
```

Verify:
1. Connect wallet → sign → cookies `wcore_access` and `wcore_refresh` are set
2. Refresh page → session persists via cookies
3. Wait 15min → access cookie expires → auto-refresh works
4. Logout → cookies cleared
5. Bearer token still works for backward compat

---

## Gotchas to Watch For

1. **Cookie domain in dev**: On localhost, do NOT set the `domain` attribute. Browsers reject cookies with domain `.localhost`. The `getCookieDomain()` function handles this.

2. **SameSite=lax**: This means cookies are sent on top-level GET navigation but NOT on cross-site POST. Since the API and web are on different domains in prod, POST requests from the frontend will NOT send cookies with `SameSite=lax`. **Solution**: Use `SameSite="none"` + `Secure=true` in production. Update `setAuthCookies`:
   ```typescript
   sameSite: process.env.NODE_ENV === "production" ? "none" as const : "lax" as const,
   ```

3. **CORS preflight with credentials**: When `credentials: true` is set, CORS `origin` cannot be `*`. Must be explicit origins. Already handled in server.ts.

4. **Fastify cookie plugin**: Must be registered BEFORE routes that set/read cookies. Register it right after cors in server.ts.

5. **Cookie access in Fastify**: Cookies are accessed via `req.cookies` but only after `@fastify/cookie` is registered. The type cast `(req as unknown as { cookies?: Record<string, string> }).cookies` is needed if TypeScript doesn't pick up the augmentation. Alternatively, add `import "@fastify/cookie"` to augment the types.

6. **Redis revocation TTL**: 24 hours is enough because refresh tokens are 7 days. A revoked JTI only needs to live until the refresh token naturally expires.

7. **Token rotation security**: Each refresh invalidates the old refresh token. If a refresh token is stolen and used, the legitimate user's next refresh will fail (token already revoked). This is a detectable theft scenario.

8. **Next.js RSC**: The `apiFetch` helper is client-side only (uses `document.cookie` implicitly via browser fetch). Server components should NOT use it. All auth-dependent data fetching in RSC should use the cookie header from the request.

9. **Backward compat window**: The Bearer header fallback in the auth hook allows existing localStorage-based sessions to continue working. Once all clients are migrated, this fallback can be removed.

10. **E2E test cookies**: Playwright's `addCookies()` requires the correct domain. For localhost tests, use `domain: "localhost"`. For cross-domain tests, match the cookie domain logic.
