# API Env Config Centralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize boot-critical WCORE API environment parsing in a typed `config.ts` module while preserving current runtime behavior.

**Architecture:** Add a pure `getApiConfig(env)` parser with explicit sections for runtime, server, auth, CORS, Redis, limits, scan, and integrations. Migrate targeted files incrementally so behavior stays stable and tests prove defaults and production safety rules.

**Tech Stack:** Node.js 20+, TypeScript ESM, Fastify, Node built-in test runner (`node --import tsx --test`), pnpm workspace.

---

## File Structure

- Create: `apps/api/src/config.ts` - typed API config parser, pure helpers, no side effects except returning values.
- Create: `apps/api/src/config.test.ts` - unit tests using explicit env objects.
- Modify: `apps/api/src/auth.ts` - replace JWT, cookie, CORS, bearer reads with `apiConfig`.
- Modify: `apps/api/src/server.ts` - replace server boot, Redis, CORS, rate-limit, gsheet token, and test gating env reads.
- Modify: `apps/api/src/plugins/scan.ts` - replace scan constants with `apiConfig.scan`.
- Modify: `apps/api/src/plugins/scan-job.ts` - replace TTL and timeout constants with `apiConfig.scan`.
- Modify: `apps/api/src/plugins/metrics-plugin.ts` - use config/dependency values for cache backend and scan concurrency.

---

### Task 1: Add Failing Config Tests

**Files:**
- Create: `apps/api/src/config.test.ts`
- Create later: `apps/api/src/config.ts`

- [ ] **Step 1: Write the failing test file**

Create `apps/api/src/config.test.ts` with:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getApiConfig } from "./config.js";

const STRONG_SECRET = "abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG";

describe("getApiConfig", () => {
  it("uses development defaults without requiring JWT_SECRET", () => {
    const config = getApiConfig({ NODE_ENV: "development" });

    assert.equal(config.runtime.nodeEnv, "development");
    assert.equal(config.runtime.isProduction, false);
    assert.equal(config.server.port, 4000);
    assert.equal(config.server.host, "127.0.0.1");
    assert.equal(config.auth.jwtSecret, "wcore-dev-secret-change-in-prod");
    assert.equal(config.auth.authAllowBearer, true);
    assert.equal(config.auth.cookieSecure, false);
    assert.equal(config.auth.cookieSameSite, "lax");
  });

  it("rejects production without JWT_SECRET", () => {
    assert.throws(
      () => getApiConfig({ NODE_ENV: "production" }),
      /JWT_SECRET must be set/,
    );
  });

  it("rejects weak production JWT_SECRET values", () => {
    assert.throws(
      () => getApiConfig({ NODE_ENV: "production", JWT_SECRET: "wcore-staging-placeholder" }),
      /JWT_SECRET is too weak/,
    );
  });

  it("uses secure cookie settings in production", () => {
    const config = getApiConfig({ NODE_ENV: "production", JWT_SECRET: STRONG_SECRET });

    assert.equal(config.auth.cookieSecure, true);
    assert.equal(config.auth.cookieSameSite, "none");
  });

  it("keeps bearer auth deny-by-default in production", () => {
    const defaultConfig = getApiConfig({ NODE_ENV: "production", JWT_SECRET: STRONG_SECRET });
    const enabledConfig = getApiConfig({ NODE_ENV: "production", JWT_SECRET: STRONG_SECRET, AUTH_ALLOW_BEARER: "true" });

    assert.equal(defaultConfig.auth.authAllowBearer, false);
    assert.equal(enabledConfig.auth.authAllowBearer, true);
  });

  it("keeps bearer auth enabled outside production unless explicitly false", () => {
    const defaultConfig = getApiConfig({ NODE_ENV: "test" });
    const disabledConfig = getApiConfig({ NODE_ENV: "test", AUTH_ALLOW_BEARER: "false" });

    assert.equal(defaultConfig.auth.authAllowBearer, true);
    assert.equal(disabledConfig.auth.authAllowBearer, false);
  });

  it("parses comma-separated CORS origins and trims empty entries", () => {
    const config = getApiConfig({
      NODE_ENV: "production",
      JWT_SECRET: STRONG_SECRET,
      CORS_ORIGIN: " https://wcore.xyz, ,https://web-production-e72584.up.railway.app ",
    });

    assert.deepEqual(config.cors.origins, [
      "https://wcore.xyz",
      "https://web-production-e72584.up.railway.app",
    ]);
    assert.deepEqual(config.cors.fastifyOrigin, config.cors.origins);
  });

  it("disables CORS origins in production when CORS_ORIGIN is missing", () => {
    const config = getApiConfig({ NODE_ENV: "production", JWT_SECRET: STRONG_SECRET });

    assert.equal(config.cors.fastifyOrigin, false);
  });

  it("allows dev CORS origins when CORS_ORIGIN is missing outside production", () => {
    const config = getApiConfig({ NODE_ENV: "development" });

    assert.equal(config.cors.fastifyOrigin, true);
  });

  it("defaults and clamps scan concurrency values", () => {
    const defaults = getApiConfig({ NODE_ENV: "test" });
    const invalid = getApiConfig({ NODE_ENV: "test", SCAN_CONCURRENCY: "0", NON_EVM_SCAN_CONCURRENCY: "nope" });

    assert.equal(defaults.scan.scanConcurrency, 50);
    assert.equal(defaults.scan.nonEvmScanConcurrency, 5);
    assert.equal(invalid.scan.scanConcurrency, 1);
    assert.equal(invalid.scan.nonEvmScanConcurrency, 5);
  });

  it("prefers REDIS_URL over REDIS_HOST fields", () => {
    const config = getApiConfig({
      NODE_ENV: "test",
      REDIS_URL: "redis://default:secret%21@redis.example.com:6380",
      REDIS_HOST: "ignored.local",
      REDIS_PORT: "6379",
      REDIS_PASSWORD: "ignored",
    });

    assert.deepEqual(config.redis.config, {
      host: "redis.example.com",
      port: 6380,
      password: "secret!",
      fromUrl: true,
    });
  });

  it("parses REDIS_HOST fields when REDIS_URL is missing", () => {
    const config = getApiConfig({
      NODE_ENV: "test",
      REDIS_HOST: "redis.internal",
      REDIS_PORT: "6381",
      REDIS_PASSWORD: "pw",
    });

    assert.deepEqual(config.redis.config, {
      host: "redis.internal",
      port: 6381,
      password: "pw",
      fromUrl: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `wcore-web`:

```powershell
rtk pnpm --filter @wcore/api exec node --import tsx --test src/config.test.ts
```

Expected: FAIL with module not found for `./config.js`.

- [ ] **Step 3: Commit the red test**

```powershell
rtk git add apps/api/src/config.test.ts
rtk git commit -m "test(api): specify env config parsing"
```

---

### Task 2: Implement `config.ts`

**Files:**
- Create: `apps/api/src/config.ts`
- Test: `apps/api/src/config.test.ts`

- [ ] **Step 1: Add minimal implementation**

Create `apps/api/src/config.ts` with:

```ts
export type ApiEnv = Record<string, string | undefined>;

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  fromUrl: boolean;
}

export interface ApiConfig {
  runtime: {
    nodeEnv: string;
    isProduction: boolean;
    isTest: boolean;
    isDevelopmentLike: boolean;
  };
  server: {
    port: number;
    host: string;
    trustProxy: number | string;
    logLevel: string;
    usePrettyLogger: boolean;
  };
  auth: {
    jwtSecret: string;
    authAllowBearer: boolean;
    cookieSecure: boolean;
    cookieSameSite: "none" | "lax";
  };
  cors: {
    origins: string[];
    fastifyOrigin: string[] | boolean;
  };
  redis: {
    config: RedisConfig | null;
    configuredViaUrl: boolean;
  };
  limits: {
    maxChainsPerScan: number;
    anonymousMaxChainsPerScan: number;
    rateLimitScan: number;
    rateLimitScanAnon: number;
    rateLimitAuth: number;
    rateLimitLeaderboard: number;
    rateLimitCatchAll: number;
    rateLimitGmRead: number;
    rateLimitGmReadAnon: number;
  };
  scan: {
    scanConcurrency: number;
    nonEvmScanConcurrency: number;
    scanResultCacheTtlMs: number;
    chainTimeoutMs: number;
    batchChainTimeoutMs: number;
    nonEvmMaxAttempts: number;
    jobTtlRunningMs: number;
    jobTtlDoneMs: number;
    jobTtlNoProgressMs: number;
  };
  integrations: {
    gsheetApiToken: string | undefined;
    internalApiUrl: string;
    publicUrl: string;
  };
}

const DEV_ENVS = new Set(["development", "test"]);
const DEV_JWT_SECRET = "wcore-dev-secret-change-in-prod";
const WEAK_SECRET_PATTERNS = [/change-in-(prod|real-deploy)/i, /placeholder/i, /^wcore-staging-/i, /^test-/i, /^dev-/i];

function readNumber(env: ApiEnv, key: string, fallback: number, options: { min?: number } = {}): number {
  const raw = env[key];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const value = Math.floor(parsed);
  if (options.min != null) return Math.max(options.min, value);
  return value;
}

function readCsv(env: ApiEnv, key: string): string[] {
  return (env[key] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseTrustProxy(raw: string | undefined): number | string {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "true") return 1;
  if (normalized === "false" || !normalized) return "loopback";
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}

function readJwtSecret(env: ApiEnv, nodeEnv: string, isDevelopmentLike: boolean): string {
  const secret = env.JWT_SECRET ?? (isDevelopmentLike
    ? DEV_JWT_SECRET
    : (() => { throw new Error(`JWT_SECRET must be set when NODE_ENV is "${nodeEnv || "<unset>"}"`); })());

  if (!isDevelopmentLike && (secret.length < 32 || WEAK_SECRET_PATTERNS.some((rx) => rx.test(secret)))) {
    throw new Error(`JWT_SECRET is too weak or a known placeholder (NODE_ENV="${nodeEnv || "<unset>"}"). Rotate to a 32+ char random secret.`);
  }

  return secret;
}

function parseRedisConfig(env: ApiEnv): RedisConfig | null {
  if (env.REDIS_URL) {
    const url = new URL(env.REDIS_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: decodeURIComponent(url.password || ""),
      fromUrl: true,
    };
  }

  if (env.REDIS_HOST) {
    return {
      host: env.REDIS_HOST,
      port: readNumber(env, "REDIS_PORT", 6379, { min: 1 }),
      password: env.REDIS_PASSWORD ?? "",
      fromUrl: false,
    };
  }

  return null;
}

export function getApiConfig(env: ApiEnv = process.env): ApiConfig {
  const nodeEnv = env.NODE_ENV ?? "";
  const isProduction = nodeEnv === "production";
  const isTest = nodeEnv === "test";
  const isDevelopmentLike = DEV_ENVS.has(nodeEnv);
  const origins = readCsv(env, "CORS_ORIGIN");
  const redisConfig = parseRedisConfig(env);
  const scanConcurrency = readNumber(env, "SCAN_CONCURRENCY", 50, { min: 1 });
  const nonEvmScanConcurrency = readNumber(env, "NON_EVM_SCAN_CONCURRENCY", 5, { min: 1 });

  return {
    runtime: {
      nodeEnv,
      isProduction,
      isTest,
      isDevelopmentLike,
    },
    server: {
      port: readNumber(env, "PORT", 4000, { min: 1 }),
      host: env.HOST ?? "127.0.0.1",
      trustProxy: parseTrustProxy(env.TRUST_PROXY),
      logLevel: env.LOG_LEVEL ?? "info",
      usePrettyLogger: nodeEnv === "development" || !nodeEnv,
    },
    auth: {
      jwtSecret: readJwtSecret(env, nodeEnv, isDevelopmentLike),
      authAllowBearer: env.AUTH_ALLOW_BEARER === "true" || (!isProduction && env.AUTH_ALLOW_BEARER !== "false"),
      cookieSecure: isProduction,
      cookieSameSite: isProduction ? "none" : "lax",
    },
    cors: {
      origins,
      fastifyOrigin: origins.length > 0 ? origins : (isProduction ? false : true),
    },
    redis: {
      config: redisConfig,
      configuredViaUrl: redisConfig?.fromUrl ?? false,
    },
    limits: {
      maxChainsPerScan: readNumber(env, "MAX_CHAINS_PER_SCAN", 120, { min: 1 }),
      anonymousMaxChainsPerScan: readNumber(env, "ANONYMOUS_MAX_CHAINS_PER_SCAN", 20, { min: 1 }),
      rateLimitScan: readNumber(env, "RATE_LIMIT_SCAN", 2000, { min: 1 }),
      rateLimitScanAnon: readNumber(env, "RATE_LIMIT_SCAN_ANON", 100, { min: 1 }),
      rateLimitAuth: readNumber(env, "RATE_LIMIT_AUTH", 30, { min: 1 }),
      rateLimitLeaderboard: readNumber(env, "RATE_LIMIT_LEADERBOARD", 30, { min: 1 }),
      rateLimitCatchAll: readNumber(env, "RATE_LIMIT_CATCH_ALL", 120, { min: 1 }),
      rateLimitGmRead: readNumber(env, "RATE_LIMIT_GM_READ", 300, { min: 1 }),
      rateLimitGmReadAnon: readNumber(env, "RATE_LIMIT_GM_READ_ANON", 60, { min: 1 }),
    },
    scan: {
      scanConcurrency,
      nonEvmScanConcurrency,
      scanResultCacheTtlMs: readNumber(env, "SCAN_RESULT_CACHE_TTL_MS", 6 * 60 * 60 * 1000, { min: 1 }),
      chainTimeoutMs: readNumber(env, "SCAN_CHAIN_TIMEOUT_MS", 90_000, { min: 1 }),
      batchChainTimeoutMs: readNumber(env, "SCAN_BATCH_CHAIN_TIMEOUT_MS", 180_000, { min: 1 }),
      nonEvmMaxAttempts: readNumber(env, "NON_EVM_SCAN_RETRIES", 3, { min: 1 }),
      jobTtlRunningMs: readNumber(env, "JOB_TTL_RUNNING_MS", 30 * 60 * 1000, { min: 1 }),
      jobTtlDoneMs: readNumber(env, "JOB_TTL_DONE_MS", 30 * 60 * 1000, { min: 1 }),
      jobTtlNoProgressMs: 10 * 60 * 1000,
    },
    integrations: {
      gsheetApiToken: env.GSHEET_API_TOKEN,
      internalApiUrl: env.INTERNAL_API_URL || "http://localhost:4000",
      publicUrl: env.PUBLIC_URL ?? "http://localhost:3000",
    },
  };
}

export const apiConfig = getApiConfig();
```

- [ ] **Step 2: Run config tests**

Run from `wcore-web`:

```powershell
rtk pnpm --filter @wcore/api exec node --import tsx --test src/config.test.ts
```

Expected: PASS, all `getApiConfig` tests pass.

- [ ] **Step 3: Run API typecheck**

Run from `wcore-web`:

```powershell
rtk pnpm --filter @wcore/api typecheck
```

Expected: TypeScript succeeds.

- [ ] **Step 4: Commit implementation**

```powershell
rtk git add apps/api/src/config.ts apps/api/src/config.test.ts
rtk git commit -m "feat(api): add typed env config parser"
```

---

### Task 3: Migrate `auth.ts`

**Files:**
- Modify: `apps/api/src/auth.ts`
- Test: `apps/api/src/config.test.ts`, `apps/api/src/auth.test.ts`

- [ ] **Step 1: Write a failing regression test for SIWE CORS domain via config behavior**

Append this test to `apps/api/src/config.test.ts` inside the `describe` block:

```ts
  it("derives SIWE allowed hosts from CORS origins", () => {
    const config = getApiConfig({
      NODE_ENV: "production",
      JWT_SECRET: STRONG_SECRET,
      CORS_ORIGIN: "https://wcore.xyz,https://web-production-e72584.up.railway.app",
    });

    const hosts = config.cors.origins.map((origin) => new URL(origin).hostname);
    assert.deepEqual(hosts, ["wcore.xyz", "web-production-e72584.up.railway.app"]);
  });
```

- [ ] **Step 2: Run the test**

Run from `wcore-web`:

```powershell
rtk pnpm --filter @wcore/api exec node --import tsx --test src/config.test.ts
```

Expected: PASS. This pins behavior before migrating `auth.ts`.

- [ ] **Step 3: Replace env reads in `auth.ts`**

Apply these focused edits in `apps/api/src/auth.ts`:

```ts
import { apiConfig } from "./config.js";
```

Replace the JWT config block at lines 25-42 with:

```ts
// --- JWT Config ---

const JWT_SECRET = apiConfig.auth.jwtSecret;

if (!process.env.JWT_SECRET && apiConfig.runtime.isDevelopmentLike) {
  console.warn("[AUTH] JWT_SECRET not set. Using development secret. All existing tokens will be invalidated on server restart. Set JWT_SECRET to persist sessions across restarts.");
}
```

Replace `COOKIE_OPTS` with:

```ts
const COOKIE_OPTS = {
  httpOnly: true,
  secure: apiConfig.auth.cookieSecure,
  sameSite: apiConfig.auth.cookieSameSite,
  path: "/",
};
```

Replace `_siweAllowedDomains` construction with:

```ts
const _siweAllowedDomains = new Set<string>(
  apiConfig.cors.origins
    .map(origin => {
      try { return new URL(origin).hostname; } catch { return ""; }
    })
    .filter(Boolean)
);
```

Replace the `allowBearer` calculation in the auth hook with:

```ts
    const allowBearer = apiConfig.auth.authAllowBearer;
```

Replace the nonce route `corsOrigins` line with:

```ts
    const corsOrigins = apiConfig.cors.origins;
```

- [ ] **Step 4: Run targeted tests**

Run from `wcore-web`:

```powershell
rtk pnpm --filter @wcore/api exec node --import tsx --test src/config.test.ts src/auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run API typecheck**

```powershell
rtk pnpm --filter @wcore/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit auth migration**

```powershell
rtk git add apps/api/src/auth.ts apps/api/src/config.test.ts
rtk git commit -m "refactor(api): use typed config in auth"
```

---

### Task 4: Migrate `server.ts`

**Files:**
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/src/config.test.ts`

- [ ] **Step 1: Add server parsing coverage**

Append this test inside `apps/api/src/config.test.ts`:

```ts
  it("parses server, rate-limit, and integration values", () => {
    const config = getApiConfig({
      NODE_ENV: "test",
      PORT: "4100",
      HOST: "0.0.0.0",
      TRUST_PROXY: "true",
      LOG_LEVEL: "debug",
      MAX_CHAINS_PER_SCAN: "77",
      ANONYMOUS_MAX_CHAINS_PER_SCAN: "9",
      RATE_LIMIT_SCAN: "200",
      RATE_LIMIT_GM_READ: "333",
      GSHEET_API_TOKEN: "token-1",
      INTERNAL_API_URL: "https://api.internal",
      PUBLIC_URL: "https://wcore.xyz",
    });

    assert.equal(config.server.port, 4100);
    assert.equal(config.server.host, "0.0.0.0");
    assert.equal(config.server.trustProxy, 1);
    assert.equal(config.server.logLevel, "debug");
    assert.equal(config.limits.maxChainsPerScan, 77);
    assert.equal(config.limits.anonymousMaxChainsPerScan, 9);
    assert.equal(config.limits.rateLimitScan, 200);
    assert.equal(config.limits.rateLimitGmRead, 333);
    assert.equal(config.integrations.gsheetApiToken, "token-1");
    assert.equal(config.integrations.internalApiUrl, "https://api.internal");
    assert.equal(config.integrations.publicUrl, "https://wcore.xyz");
  });
```

- [ ] **Step 2: Run test**

```powershell
rtk pnpm --filter @wcore/api exec node --import tsx --test src/config.test.ts
```

Expected: PASS before migration, proving parser has needed values.

- [ ] **Step 3: Replace server env reads**

In `apps/api/src/server.ts`, add:

```ts
import { apiConfig } from "./config.js";
```

Replace lines 24-37 with:

```ts
const PORT = apiConfig.server.port;
const HOST = apiConfig.server.host;
const trustProxy = apiConfig.server.trustProxy;
```

Replace Fastify logger initialization with:

```ts
const app = Fastify({
  trustProxy,
  logger: apiConfig.runtime.isTest
    ? false
    : (apiConfig.server.usePrettyLogger
      ? { level: apiConfig.server.logLevel, transport: { target: "pino-pretty" } }
      : { level: apiConfig.server.logLevel }),
});
```

Delete the `getRedisConfig()` function and replace `const redisConfig = getRedisConfig();` with:

```ts
const redisConfig = apiConfig.redis.config;
```

Replace the Redis warning object field:

```ts
redisUrlConfigured: apiConfig.redis.configuredViaUrl
```

Replace limits and rate limit constants with:

```ts
const MAX_CHAINS_PER_SCAN = apiConfig.limits.maxChainsPerScan;
const ANONYMOUS_MAX_CHAINS_PER_SCAN = apiConfig.limits.anonymousMaxChainsPerScan;
```

```ts
const RATE_LIMIT_SCAN = apiConfig.limits.rateLimitScan;
const RATE_LIMIT_SCAN_ANON = apiConfig.limits.rateLimitScanAnon;
const RATE_LIMIT_AUTH = apiConfig.limits.rateLimitAuth;
const RATE_LIMIT_LEADERBOARD = apiConfig.limits.rateLimitLeaderboard;
const RATE_LIMIT_CATCH_ALL = apiConfig.limits.rateLimitCatchAll;
const RATE_LIMIT_GM_READ = apiConfig.limits.rateLimitGmRead;
const RATE_LIMIT_GM_READ_ANON = apiConfig.limits.rateLimitGmReadAnon;
```

Replace CORS registration `origin` with:

```ts
  origin: apiConfig.cors.fastifyOrigin,
```

Replace CSRF production check and origins:

```ts
      if (apiConfig.cors.origins.length === 0 && apiConfig.runtime.isProduction) {
        return reply.code(500).send({ error: "csrf_config_missing", message: "CORS_ORIGIN must be set in production." });
      }
      if (apiConfig.cors.origins.length > 0) {
      const allowedHosts = apiConfig.cors.origins
        .map(s => {
          try { return new URL(s.trim()).hostname.toLowerCase(); } catch { return s.trim().toLowerCase(); }
        });
```

Replace dev bypass line with:

```ts
      const allowDevBypass = apiConfig.runtime.isTest;
```

Replace gsheet token line with:

```ts
const gsheetApiToken = apiConfig.integrations.gsheetApiToken;
```

Replace startup guard line with:

```ts
if (!apiConfig.runtime.isTest && isMainModule) {
```

- [ ] **Step 4: Run targeted checks**

```powershell
rtk pnpm --filter @wcore/api exec node --import tsx --test src/config.test.ts
rtk pnpm --filter @wcore/api typecheck
```

Expected: both PASS.

- [ ] **Step 5: Search direct env reads in `server.ts`**

Run from repo root:

```powershell
rtk grep "process\.env\." wcore-web/apps/api/src/server.ts
```

Expected: no matches, or only an intentional test/logging line that is documented in the final summary. Prefer no matches.

- [ ] **Step 6: Commit server migration**

```powershell
rtk git add apps/api/src/server.ts apps/api/src/config.test.ts
rtk git commit -m "refactor(api): centralize server env config"
```

---

### Task 5: Migrate Scan Plugins and Metrics

**Files:**
- Modify: `apps/api/src/plugins/scan.ts`
- Modify: `apps/api/src/plugins/scan-job.ts`
- Modify: `apps/api/src/plugins/metrics-plugin.ts`
- Test: `apps/api/src/config.test.ts`

- [ ] **Step 1: Add scan config coverage**

Append this test inside `apps/api/src/config.test.ts`:

```ts
  it("parses scan timeout, cache, retry, and job TTL values", () => {
    const config = getApiConfig({
      NODE_ENV: "test",
      SCAN_RESULT_CACHE_TTL_MS: "1234",
      SCAN_CHAIN_TIMEOUT_MS: "2222",
      SCAN_BATCH_CHAIN_TIMEOUT_MS: "3333",
      NON_EVM_SCAN_RETRIES: "4",
      JOB_TTL_RUNNING_MS: "4444",
      JOB_TTL_DONE_MS: "5555",
    });

    assert.equal(config.scan.scanResultCacheTtlMs, 1234);
    assert.equal(config.scan.chainTimeoutMs, 2222);
    assert.equal(config.scan.batchChainTimeoutMs, 3333);
    assert.equal(config.scan.nonEvmMaxAttempts, 4);
    assert.equal(config.scan.jobTtlRunningMs, 4444);
    assert.equal(config.scan.jobTtlDoneMs, 5555);
    assert.equal(config.scan.jobTtlNoProgressMs, 10 * 60 * 1000);
  });
```

- [ ] **Step 2: Run config tests**

```powershell
rtk pnpm --filter @wcore/api exec node --import tsx --test src/config.test.ts
```

Expected: PASS before migration, proving parser has needed values.

- [ ] **Step 3: Migrate `plugins/scan.ts`**

In `apps/api/src/plugins/scan.ts`, add:

```ts
import { apiConfig } from "../config.js";
```

Replace the constants at lines 13-17 with:

```ts
const SCAN_CONCURRENCY = apiConfig.scan.scanConcurrency;
const NON_EVM_SCAN_CONCURRENCY = apiConfig.scan.nonEvmScanConcurrency;
const SCAN_RESULT_CACHE_TTL_MS = apiConfig.scan.scanResultCacheTtlMs;
const CHAIN_TIMEOUT_MS = apiConfig.scan.chainTimeoutMs;
const BATCH_CHAIN_TIMEOUT_MS = apiConfig.scan.batchChainTimeoutMs;
```

Replace the `NON_EVM_MAX_ATTEMPTS` calculation near the non-EVM retry loop with:

```ts
      const NON_EVM_MAX_ATTEMPTS = apiConfig.scan.nonEvmMaxAttempts;
```

- [ ] **Step 4: Migrate `plugins/scan-job.ts`**

In `apps/api/src/plugins/scan-job.ts`, add:

```ts
import { apiConfig } from "../config.js";
```

Replace lines 4-7 with:

```ts
const CHAIN_TIMEOUT_MS = apiConfig.scan.chainTimeoutMs;
const JOB_TTL_RUNNING_MS = apiConfig.scan.jobTtlRunningMs;
const JOB_TTL_DONE_MS = apiConfig.scan.jobTtlDoneMs;
const JOB_TTL_NO_PROGRESS_MS = apiConfig.scan.jobTtlNoProgressMs;
```

- [ ] **Step 5: Migrate `plugins/metrics-plugin.ts`**

In `apps/api/src/plugins/metrics-plugin.ts`, add:

```ts
import { apiConfig } from "../config.js";
```

Replace cache backend and scan concurrency fields with:

```ts
      cache: {
        backend: apiConfig.redis.config ? "redis" : "memory",
        redis: snapshot.cache.redis,
        session: snapshot.cache.session,
      },
      scanConcurrency: apiConfig.scan.scanConcurrency,
```

- [ ] **Step 6: Run targeted checks**

```powershell
rtk pnpm --filter @wcore/api exec node --import tsx --test src/config.test.ts
rtk pnpm --filter @wcore/api typecheck
```

Expected: both PASS.

- [ ] **Step 7: Search direct env reads in targeted files**

Run from repo root:

```powershell
rtk grep "process\.env\." wcore-web/apps/api/src/auth.ts wcore-web/apps/api/src/server.ts wcore-web/apps/api/src/plugins/scan.ts wcore-web/apps/api/src/plugins/scan-job.ts wcore-web/apps/api/src/plugins/metrics-plugin.ts
```

Expected: no matches except the development warning in `auth.ts` if intentionally left. If `auth.ts` still has `process.env.JWT_SECRET` for the warning, either migrate it to `apiConfig` plus an exported `usedFallbackJwtSecret` flag or document why it remains.

- [ ] **Step 8: Commit scan and metrics migration**

```powershell
rtk git add apps/api/src/plugins/scan.ts apps/api/src/plugins/scan-job.ts apps/api/src/plugins/metrics-plugin.ts apps/api/src/config.test.ts
rtk git commit -m "refactor(api): centralize scan env config"
```

---

### Task 6: Final Verification and Docs Update

**Files:**
- Modify if needed: `ROADMAP.md`
- Modify if needed: `wcore-web/ROADMAP.md`
- Verify: targeted files and tests

- [ ] **Step 1: Run full API tests if DB env is available, otherwise run pure targeted tests**

First run pure tests that do not require DB:

```powershell
rtk pnpm --filter @wcore/api exec node --import tsx --test src/config.test.ts src/auth.test.ts
```

Expected: PASS.

If `TEST_DATABASE_URL` and `TEST_REDIS_URL` are safely configured for non-production Railway test/staging, also run:

```powershell
rtk pnpm --filter @wcore/api test
```

Expected: PASS. If missing, do not run against production and state it in the final summary.

- [ ] **Step 2: Run typecheck from repo root**

Run from `C:\Users\strau\WCORE`:

```powershell
rtk npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run static GSheet validation to ensure cross-runtime repo remains clean**

Run from `C:\Users\strau\WCORE`:

```powershell
rtk npm run validate:static
```

Expected: `Static validation OK (2904 global functions checked).`

- [ ] **Step 4: Run diff checks**

```powershell
rtk git diff --check
rtk git status -sb
```

Expected: no whitespace errors; status only contains intended changed files.

- [ ] **Step 5: Update roadmap if implementation completes the backlog item**

If all targeted files were migrated, edit root `ROADMAP.md` backlog line:

```md
- Centralize web API environment reads through a typed config module.
```

Change to:

```md
- Continue API environment centralization: boot, auth, scan, and metrics now use a typed config module; CEX/GM env reads remain for a later pass.
```

- [ ] **Step 6: Commit final docs if changed**

```powershell
rtk git add ROADMAP.md
rtk git commit -m "docs: update env config centralization status"
```

Skip this commit if no docs changed.

- [ ] **Step 7: Push all commits**

```powershell
rtk git push origin master
```

Expected: push succeeds.

---

## Self-Review Notes

Spec coverage:

- `config.ts` is added in Task 2.
- Env parsing and production safety tests are added in Tasks 1, 3, 4, and 5.
- Targeted files from the spec are migrated in Tasks 3, 4, and 5.
- CEX/GM-specific env migration remains out of scope, as specified.
- Verification commands cover targeted tests, typecheck, static validation, and diff checks.

No placeholders remain. Function names and property names are consistent across tasks: `getApiConfig`, `apiConfig`, `ApiConfig`, `RedisConfig`, `runtime`, `server`, `auth`, `cors`, `redis`, `limits`, `scan`, and `integrations`.
