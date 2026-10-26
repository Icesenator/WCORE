import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { assessTrustProxy, parseTrustProxy, trustProxyStartupWarning } from "./trust-proxy.js";

describe("TRUST_PROXY validation", () => {
  // proxy-addr only rejects these when Fastify is constructed, at import time of server.ts,
  // with a message that does not name the variable. They now fail in configuration.
  for (const value of ["10.0.0.0/33", "railway", "999.1.1.1", "192.0.2.10/abc", "2001:db8::/129", "192.0.2.0/255.0.255.0"]) {
    it(`rejects malformed entry ${JSON.stringify(value)} before Fastify sees it`, () => {
      assert.throws(() => parseTrustProxy(value), /^Error: TRUST_PROXY/);
    });
  }

  // Ranges this wide trust a forwarded header from any peer, which is what `true` did.
  for (const value of ["0.0.0.0/1,128.0.0.0/1", "::/1,8000::/1", "0.0.0.0/7", "0.0.0.0/0", "::/15"]) {
    it(`rejects catch-all coverage ${JSON.stringify(value)}`, () => {
      assert.throws(() => parseTrustProxy(value), /TRUST_PROXY.*too broad/);
    });
  }

  it("rejects an unbounded list", () => {
    const many = Array.from({ length: 65 }, (_, i) => `10.${i}.0.0/16`).join(",");
    assert.throws(() => parseTrustProxy(many), /TRUST_PROXY.*at most 64/);
  });

  for (const [value, expected] of [
    ["100.64.0.0/10", "100.64.0.0/10"],
    ["fd12::/16", "fd12::/16"],
    ["uniquelocal, linklocal", "uniquelocal,linklocal"],
    ["192.0.2.0/255.255.255.0", "192.0.2.0/255.255.255.0"],
    ["10.0.0.0/8", "10.0.0.0/8"],
    ["2001:DB8::/32", "2001:db8::/32"],
  ] as const) {
    it(`accepts ${value}, and Fastify accepts the result`, async () => {
      const parsed = parseTrustProxy(value);
      assert.equal(parsed, expected);
      const app = Fastify({ trustProxy: parsed });
      await app.ready();
      await app.close();
    });
  }

  it("a rejected value never reaches the error message", () => {
    assert.throws(() => parseTrustProxy("203.0.113.7/99"), (error: Error) => !error.message.includes("203.0.113.7"));
  });

  it("assesses a configuration for a deploy preflight without echoing it", () => {
    assert.deepEqual(assessTrustProxy(undefined), { ok: true, mode: "loopback-only" });
    assert.deepEqual(assessTrustProxy("false"), { ok: true, mode: "loopback-only" });
    assert.deepEqual(assessTrustProxy("100.64.0.0/10, fd12::/16"), { ok: true, mode: "addresses", entries: 2 });
    const refused = assessTrustProxy("true");
    assert.equal(refused.ok, false);
    assert.ok(refused.ok === false && !refused.reason.includes("true\""));
  });

  // Naming loopback explicitly trusts nothing more than the default: behind a proxy every
  // anonymous client still shares one identity, so it must not pass as an address list.
  for (const value of ["loopback", " LOOPBACK ", "127.0.0.1", "::1", "loopback,127.0.0.0/8,::1"]) {
    it(`treats ${JSON.stringify(value)} as loopback-only, like an unset value`, () => {
      assert.deepEqual(assessTrustProxy(value), { ok: true, mode: "loopback-only" });
      assert.match(trustProxyStartupWarning(parseTrustProxy(value), true) ?? "", /share one rate-limit identity/);
    });
  }

  it("warns at production startup only when nothing but the direct peer is trusted", () => {
    assert.match(trustProxyStartupWarning("loopback", true) ?? "", /share one rate-limit identity/);
    assert.equal(trustProxyStartupWarning("loopback", false), null);
    assert.equal(trustProxyStartupWarning("100.64.0.0/10", true), null);
  });
});
