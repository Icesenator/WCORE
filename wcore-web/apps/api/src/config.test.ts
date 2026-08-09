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

  it("derives SIWE allowed hosts from CORS origins", () => {
    const config = getApiConfig({
      NODE_ENV: "production",
      JWT_SECRET: STRONG_SECRET,
      CORS_ORIGIN: "https://wcore.xyz,https://web-production-e72584.up.railway.app",
    });

    const hosts = config.cors.origins.map((origin) => new URL(origin).hostname);
    assert.deepEqual(hosts, ["wcore.xyz", "web-production-e72584.up.railway.app"]);
  });

  it("marks when development JWT fallback is used", () => {
    const fallbackConfig = getApiConfig({ NODE_ENV: "test" });
    const explicitConfig = getApiConfig({ NODE_ENV: "test", JWT_SECRET: STRONG_SECRET });

    assert.equal(fallbackConfig.auth.usedDevelopmentJwtFallback, true);
    assert.equal(explicitConfig.auth.usedDevelopmentJwtFallback, false);
  });

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
      GSHEET_SCAN_PRICE_REPAIR_LIMIT: "0",
      GSHEET_PRICE_BATCH_CONCURRENCY: "7",
      GSHEET_OWNER_ADDRESS: " 0x17D518736EE9341dCDc0a2498e013D33CFcDD080 ",
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
    assert.equal(config.integrations.gsheetScanPriceRepairLimit, 0);
    assert.equal(config.integrations.gsheetPriceBatchConcurrency, 7);
    assert.equal(config.integrations.gsheetOwnerAddress, "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");
    assert.equal(config.integrations.internalApiUrl, "https://api.internal");
    assert.equal(config.integrations.publicUrl, "https://wcore.xyz");
  });

  it("treats a blank GSheet token as unconfigured and bounds its worker settings", () => {
    const config = getApiConfig({
      NODE_ENV: "test",
      GSHEET_API_TOKEN: "   ",
      GSHEET_SCAN_PRICE_REPAIR_LIMIT: "-4",
      GSHEET_PRICE_BATCH_CONCURRENCY: "0",
    });

    assert.equal(config.integrations.gsheetApiToken, undefined);
    assert.equal(config.integrations.gsheetScanPriceRepairLimit, 0);
    assert.equal(config.integrations.gsheetPriceBatchConcurrency, 1);
  });

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

  it("uses disabled Zerion portfolio enrichment defaults", () => {
    const config = getApiConfig({ NODE_ENV: "test" });
    assert.deepEqual(config.portfolioEnrichment.zerion, {
      enabled: false,
      apiKey: undefined,
      timeoutMs: 3000,
      cacheTtlMs: 600000,
      lastGoodTtlMs: 86400000,
      dailyBudget: 1000,
      maxResponseBytes: 2000000,
      maxPositions: 1000,
    });
  });

  it("parses all Zerion portfolio enrichment overrides", () => {
    const config = getApiConfig({
      NODE_ENV: "test",
      ZERION_ENRICHMENT_ENABLED: " TRUE ",
      ZERION_API_KEY: " secret-key ",
      ZERION_TIMEOUT_MS: "4000",
      ZERION_CACHE_TTL_MS: "700000",
      ZERION_LAST_GOOD_TTL_MS: "90000000",
      ZERION_DAILY_BUDGET: "1200",
      ZERION_MAX_RESPONSE_BYTES: "3000000",
      ZERION_MAX_POSITIONS: "1500",
    });
    assert.deepEqual(config.portfolioEnrichment.zerion, {
      enabled: true,
      apiKey: "secret-key",
      timeoutMs: 4000,
      cacheTtlMs: 700000,
      lastGoodTtlMs: 90000000,
      dailyBudget: 1200,
      maxResponseBytes: 3000000,
      maxPositions: 1500,
    });
  });

  it("normalizes blank keys and requires a key when Zerion is enabled", () => {
    assert.equal(getApiConfig({ NODE_ENV: "test", ZERION_API_KEY: "   " }).portfolioEnrichment.zerion.apiKey, undefined);
    for (const apiKey of [undefined, "   "]) {
      assert.throws(() => getApiConfig({
        NODE_ENV: "test",
        ZERION_ENRICHMENT_ENABLED: "true",
        ZERION_API_KEY: apiKey,
      }), /ZERION_API_KEY is required/);
    }
  });

  it("strictly validates Zerion booleans and positive safe integers", () => {
    assert.throws(
      () => getApiConfig({ NODE_ENV: "test", ZERION_ENRICHMENT_ENABLED: "yes" }),
      /ZERION_ENRICHMENT_ENABLED must be true or false/,
    );
    const keys = [
      "ZERION_TIMEOUT_MS",
      "ZERION_CACHE_TTL_MS",
      "ZERION_LAST_GOOD_TTL_MS",
      "ZERION_DAILY_BUDGET",
      "ZERION_MAX_RESPONSE_BYTES",
      "ZERION_MAX_POSITIONS",
    ];
    for (const key of keys) {
      for (const value of ["invalid", "Infinity", "0", "-1", "1.5", "9007199254740992"]) {
        assert.throws(
          () => getApiConfig({ NODE_ENV: "test", [key]: value }),
          new RegExp(`${key} must be a positive safe integer`),
        );
      }
    }
  });

  it("rejects Zerion timer values above the Node timeout limit", () => {
    for (const key of ["ZERION_TIMEOUT_MS", "ZERION_CACHE_TTL_MS", "ZERION_LAST_GOOD_TTL_MS"]) {
      assert.throws(
        () => getApiConfig({ NODE_ENV: "test", [key]: "2147483648" }),
        new RegExp(`${key} must be at most 2147483647`),
      );
    }
  });
});
