export type ApiEnv = Record<string, string | undefined>;

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  fromUrl: boolean;
}

export interface ZerionEnrichmentConfig {
  enabled: boolean;
  apiKey?: string;
  timeoutMs: number;
  cacheTtlMs: number;
  lastGoodTtlMs: number;
  dailyBudget: number;
  maxResponseBytes: number;
  maxPositions: number;
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
    usedDevelopmentJwtFallback: boolean;
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
    rateLimitScanChainChecks: number;
    rateLimitScanChainChecksAnon: number;
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
    maxAsyncJobs: number;
    maxAsyncJobsPerPrincipal: number;
  };
  portfolioEnrichment: {
    zerion: ZerionEnrichmentConfig;
  };
  integrations: {
    gsheetApiToken: string | undefined;
    gsheetOwnerAddress: string | undefined;
    internalApiUrl: string;
    publicUrl: string;
  };
}

const DEV_ENVS = new Set(["development", "test"]);
const DEV_JWT_SECRET = "wcore-dev-secret-change-in-prod";
const MAX_TIMER_MS = 2_147_483_647;
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

function readBoolean(env: ApiEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw == null) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${key} must be true or false`);
}

function readPositiveInteger(
  env: ApiEnv,
  key: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = env[key];
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive safe integer`);
  }
  if (value > max) throw new Error(`${key} must be at most ${max}`);
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
  const usedDevelopmentJwtFallback = env.JWT_SECRET == null && isDevelopmentLike;
  const zerionEnabled = readBoolean(env, "ZERION_ENRICHMENT_ENABLED", false);
  const zerionApiKey = env.ZERION_API_KEY?.trim() || undefined;

  if (zerionEnabled && !zerionApiKey) {
    throw new Error("ZERION_API_KEY is required when Zerion enrichment is enabled");
  }

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
      usedDevelopmentJwtFallback,
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
      // Budget in chain-checks per minute, the unit that actually drives outbound RPC
      // and pricing work. The request-count limits above cannot bound it, since one
      // request may span 120 chains and a batch of wallets. Sized well above a full
      // multi-wallet refresh and far below what the request limits alone would allow.
      rateLimitScanChainChecks: readNumber(env, "RATE_LIMIT_SCAN_CHAIN_CHECKS", 5000, { min: 1 }),
      rateLimitScanChainChecksAnon: readNumber(env, "RATE_LIMIT_SCAN_CHAIN_CHECKS_ANON", 1000, { min: 1 }),
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
    // Each job pins the scan results of every chain it covers, so the store has to be
    // bounded. A wide scan in the browser runs SCAN_CONCURRENCY / CHAIN_BATCH_SIZE jobs
    // at once (50/5 = 10 today), so the per-caller allowance keeps room for several
    // tabs before refusing anything legitimate.
    maxAsyncJobs: readNumber(env, "SCAN_MAX_ASYNC_JOBS", 200, { min: 1 }),
    maxAsyncJobsPerPrincipal: readNumber(env, "SCAN_MAX_ASYNC_JOBS_PER_PRINCIPAL", 32, { min: 1 }),
    },
    portfolioEnrichment: {
      zerion: {
        enabled: zerionEnabled,
        apiKey: zerionApiKey,
        timeoutMs: readPositiveInteger(env, "ZERION_TIMEOUT_MS", 3000, MAX_TIMER_MS),
        cacheTtlMs: readPositiveInteger(env, "ZERION_CACHE_TTL_MS", 600000, MAX_TIMER_MS),
        lastGoodTtlMs: readPositiveInteger(env, "ZERION_LAST_GOOD_TTL_MS", 86400000, MAX_TIMER_MS),
        dailyBudget: readPositiveInteger(env, "ZERION_DAILY_BUDGET", 1000),
        maxResponseBytes: readPositiveInteger(env, "ZERION_MAX_RESPONSE_BYTES", 2000000),
        maxPositions: readPositiveInteger(env, "ZERION_MAX_POSITIONS", 1000),
      },
    },
    integrations: {
      gsheetApiToken: env.GSHEET_API_TOKEN,
      gsheetOwnerAddress: env.GSHEET_OWNER_ADDRESS?.trim().toLowerCase() || undefined,
      internalApiUrl: env.INTERNAL_API_URL || "http://localhost:4000",
      publicUrl: env.PUBLIC_URL ?? "http://localhost:3000",
    },
  };
}

export const apiConfig: ApiConfig = new Proxy({} as ApiConfig, {
  get(_target, property: keyof ApiConfig) {
    return getApiConfig()[property];
  },
});
