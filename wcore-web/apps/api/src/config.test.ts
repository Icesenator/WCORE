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
    assert.equal(config.integrations.gsheetOwnerAddress, "0x17d518736ee9341dcdc0a2498e013d33cfcdd080");
    assert.equal(config.integrations.internalApiUrl, "https://api.internal");
    assert.equal(config.integrations.publicUrl, "https://wcore.xyz");
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
});
