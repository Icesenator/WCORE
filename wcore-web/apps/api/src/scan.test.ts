// Run: node --import tsx --test apps/api/src/scan.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildChainScan, getApiRateLimitBucket, getScanChainLimit, requiresCsrfOriginCheck, validateChains } from "./server-helpers.js";
import { resolveScanChainLimit } from "./plugins/scan.js";

// Rate-limit identity helper — mirrors the logic in server.ts
function rateLimitIdentity(req: { ip: string; headers: Record<string, string | string[] | undefined>; cookies?: Record<string, string> }): string {
  return "ip:" + req.ip;
}

describe("validateChains", () => {
  test("returns default chains when undefined", () => {
    const result = validateChains(undefined);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.chains, ["BASE", "ETHEREUM"]);
  });

  test("returns default chains when null", () => {
    const result = validateChains(null);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.chains, ["BASE", "ETHEREUM"]);
  });

  test("accepts valid EVM chain", () => {
    const result = validateChains(["base"]);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.chains, ["BASE"]);
  });

  test("uppercase normalize", () => {
    const result = validateChains(["ethereum"]);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.chains, ["ETHEREUM"]);
  });

  test("accepts multiple valid chains", () => {
    const result = validateChains(["base", "ethereum"]);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.chains, ["BASE", "ETHEREUM"]);
  });

  test("rejects invalid chain name", () => {
    const result = validateChains(["invalid_chain"]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.error.includes("no valid chains"));
  });

  test("accepts SVM chain (SOLANA)", () => {
    const result = validateChains(["SOLANA"]);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.chains, ["SOLANA"]);
  });

  test("accepts Cosmos chain (COSMOS_HUB)", () => {
    const result = validateChains(["COSMOS_HUB"]);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.chains, ["COSMOS_HUB"]);
  });

  test("rejects non-array input", () => {
    const result = validateChains("base");
    assert.equal(result.ok, false);
  });

  test("rejects empty array", () => {
    const result = validateChains([]);
    assert.equal(result.ok, false);
  });

  test("rejects array with non-string values", () => {
    const result = validateChains([42]);
    assert.equal(result.ok, false);
  });

  test("rejects empty string chain", () => {
    const result = validateChains([""]);
    assert.equal(result.ok, false);
  });

  test("rejects whitespace-only chain", () => {
    const result = validateChains(["  "]);
    assert.equal(result.ok, false);
  });

  test("skips unknown chains when at least one valid chain remains", () => {
    const result = validateChains(["base", "invalid"]);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.chains, ["BASE"]);
      assert.deepEqual(result.skipped, ["INVALID"]);
    }
  });
});

describe("buildChainScan", () => {
  test("preserves engine scanMs for async scan metrics", () => {
    const chainScan = buildChainScan("BASE", {
      chain: "base",
      chainName: "Base",
      native: { symbol: "ETH", balance: 0, priceEur: null, valueEur: null },
      tokens: [],
      errors: [],
      totalValueEur: 0,
      scanMs: 1234,
    });

    assert.equal(chainScan.scanMs, 1234);
  });

  test("marks dynamically discovered DeFi positions for trusted aggregation and UI", () => {
    const chainScan = buildChainScan("OPTIMISM", {
      chain: "OPTIMISM",
      chainName: "Optimism",
      native: { symbol: "ETH", balance: 0, priceEur: 1600, valueEur: 0 },
      tokens: [{
        contract: "0x1111111111111111111111111111111111111111",
        symbol: "Comp OTHER",
        name: "Compound V3 OTHER Collateral [Flex]",
        decimals: 18,
        balance: 1,
        priceEur: 1,
        valueEur: 1,
        defi: { protocol: "compound-v3", type: "lending_collateral", liquidityStatus: "flex", confidence: "high", pricing: { mode: "direct", sign: "asset" } },
      }],
      errors: [],
      totalValueEur: 1,
      scanMs: 10,
    });

    assert.deepEqual(chainScan.tokens[0]?.flags, ["DEFI"]);
  });
});

describe("rateLimitIdentity", () => {
  // Regression: rate-limit must NOT use raw Bearer header for user bucketing.
  // An attacker could rotate random Bearer tokens to create infinite buckets.
  // Cookies are parsed before auth verification, so they are also untrusted here.
  test("ignores forged access cookies for rate-limit bucketing", () => {
    const id1 = rateLimitIdentity({
      ip: "192.168.1.1",
      headers: { authorization: "Bearer some-token" },
      cookies: { wcore_access: "forged-cookie-A-with-enough-length" },
    });
    const id2 = rateLimitIdentity({
      ip: "192.168.1.1",
      headers: { authorization: "Bearer some-token" },
      cookies: { wcore_access: "forged-cookie-B-with-enough-length" },
    });
    assert.equal(id1, id2, "different unverified cookies should produce the same IP bucket");
    assert.equal(id1, "ip:192.168.1.1");
  });

  test("falls back to IP when no access cookie", () => {
    const id = rateLimitIdentity({
      ip: "10.0.0.1",
      headers: { authorization: "Bearer random-token" },
    });
    assert.ok(id.startsWith("ip:"), "should use IP bucket when no cookie");
    assert.ok(id.includes("10.0.0.1"), "should include IP in bucket key");
  });

  test("ignores Bearer header for rate-limit bucketing", () => {
    const id1 = rateLimitIdentity({
      ip: "10.0.0.1",
      headers: { authorization: "Bearer token-A" },
    });
    const id2 = rateLimitIdentity({
      ip: "10.0.0.1",
      headers: { authorization: "Bearer token-B" },
    });
    assert.equal(id1, id2, "different Bearer tokens should produce same IP bucket");
  });
});

describe("CSRF route classification", () => {
  test("requires an origin check for any mutating API route by default", () => {
    assert.equal(requiresCsrfOriginCheck("POST", "/api/support/tickets"), true);
    assert.equal(requiresCsrfOriginCheck("DELETE", "/api/future/state-change"), true);
  });

  test("does not require CSRF checks for safe methods or SIWE pre-auth endpoints", () => {
    assert.equal(requiresCsrfOriginCheck("GET", "/api/gm/random"), false);
    assert.equal(requiresCsrfOriginCheck("POST", "/api/auth/nonce"), false);
    assert.equal(requiresCsrfOriginCheck("POST", "/api/auth/login"), false);
  });
});

describe("API rate-limit bucket classification", () => {
  test("applies gm_read rate limit to public GM reads", () => {
    assert.equal(getApiRateLimitBucket("GET", "/api/gm/random"), "gm_read");
    assert.equal(getApiRateLimitBucket("GET", "/api/gm/contracts"), "gm_read");
    assert.equal(getApiRateLimitBucket("GET", "/api/gm/status"), "gm_read");
  });

  test("keeps GM writes on the stricter gm bucket", () => {
    assert.equal(getApiRateLimitBucket("POST", "/api/gm"), "gm");
    assert.equal(getApiRateLimitBucket("POST", "/api/gm/onchain"), "gm");
    assert.equal(getApiRateLimitBucket("POST", "/api/gm/contracts/deploy"), "gm");
  });
});

describe("scan chain limits", () => {
  test("uses a stricter anonymous chain limit than the authenticated limit", async () => {
    const limit = await getScanChainLimit(undefined, async () => 120, 20);
    assert.equal(limit, 20);
  });

  test("uses the authenticated plan limit for logged-in users", async () => {
    const limit = await getScanChainLimit("user_123", async (userId) => userId === "user_123" ? 120 : 1, 20);
    assert.equal(limit, 120);
  });

  test("scan plugin uses the anonymous limit instead of the global max for anonymous requests", async () => {
    const limit = await resolveScanChainLimit(undefined, async () => 120, 120, 20);
    assert.equal(limit, 20);
  });

  test("scan plugin uses the authenticated plan limit for authenticated requests", async () => {
    const limit = await resolveScanChainLimit("user_123", async () => 42, 120, 20);
    assert.equal(limit, 42);
  });
});
