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
