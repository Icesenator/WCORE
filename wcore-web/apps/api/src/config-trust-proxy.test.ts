import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { getApiConfig } from "./config.js";

function configFor(trustProxy?: string) {
  return getApiConfig({ NODE_ENV: "test", TRUST_PROXY: trustProxy });
}

describe("trust proxy configuration", () => {
  for (const value of ["true", " TRUE ", "0", "1", "2", "001", "9007199254740993", "-1", "+1", "1.5", "1e2", "0x1", "1,2", "192.0.2.10,1", "192.0.2.10,,2001:db8::/32", "192.0.2.10,"]) {
    it(`rejects legacy hop-count configuration ${JSON.stringify(value)} with migration guidance`, () => {
      assert.throws(() => configFor(value), /TRUST_PROXY.*IP.*CIDR/);
    });
  }

  for (const value of [undefined, "", "  ", "false", " FALSE "]) {
    it(`preserves the loopback-only fallback for ${JSON.stringify(value)}`, () => {
      assert.equal(configFor(value).server.trustProxy, "loopback");
    });
  }

  for (const value of ["192.0.2.10", "192.0.2.0/24", "::1", "2001:db8::/32", "loopback", "192.0.2.10, 2001:db8::/32"]) {
    it(`preserves address-based configuration ${value}`, () => {
      assert.equal(configFor(` ${value} `).server.trustProxy, value.replace(/\s+/g, ""));
    });
  }

  it("ignores forwarded identity, host and protocol from an untrusted connecting peer", async () => {
    const app = Fastify({ trustProxy: configFor("192.0.2.10").server.trustProxy });
    app.get("/", (request) => ({ ip: request.ip, host: request.host, protocol: request.protocol }));
    try {
      const response = await app.inject({
        url: "/",
        remoteAddress: "198.51.100.20",
        headers: {
          host: "origin.example",
          "x-forwarded-for": "203.0.113.50",
          "x-forwarded-host": "spoof.example",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { ip: "198.51.100.20", host: "origin.example", protocol: "http" });
    } finally {
      await app.close();
    }
  });

  it("honours a trusted peer but stops the IP chain at the first untrusted address", async () => {
    const app = Fastify({ trustProxy: configFor("192.0.2.10").server.trustProxy });
    app.get("/", (request) => ({ ip: request.ip, host: request.host, protocol: request.protocol }));
    try {
      const response = await app.inject({
        url: "/",
        remoteAddress: "192.0.2.10",
        headers: {
          host: "origin.example",
          "x-forwarded-for": "203.0.113.50, 198.51.100.20",
          "x-forwarded-host": "public.example",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { ip: "198.51.100.20", host: "public.example", protocol: "https" });
    } finally {
      await app.close();
    }
  });
});
