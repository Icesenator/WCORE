// 2026-11-08 — P0-DATA-CHAIN-SUNSET-EARLY-WARNING / revue Supervisor TRUST_PROXY.
// Invariant : aucun pair dont l'adresse est routable sur Internet n'est jamais un proxy de confiance.
// Sans lui, une entree admise par parseTrustProxy (jusqu'a /8) peut couvrir de l'espace public : un
// client reel de cette plage, relaye par le proxy Railway, ferait alors adopter le X-Forwarded-For
// qu'il fournit lui-meme.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import * as TP from "./trust-proxy.js";
import { parseTrustProxy } from "./trust-proxy.js";

const T = TP as unknown as Record<string, (...a: unknown[]) => any>;
const restrict = (raw: string) => T.restrictTrustProxyToNonPublic!(parseTrustProxy(raw));

async function seen(trustProxy: string, remoteAddress: string, headers: Record<string, string>) {
  const app = Fastify({ trustProxy });
  app.get("/who", async (req) => ({ ip: req.ip, host: req.host, protocol: req.protocol }));
  await app.ready();
  const res = await app.inject({ method: "GET", url: "/who", remoteAddress, headers: { host: "api.example.test", ...headers } });
  await app.close();
  return res.json() as { ip: string; host: string; protocol: string };
}

describe("TRUST_PROXY : jamais de confiance envers l'espace public", () => {
  it("expose restrictTrustProxyToNonPublic et describeTrustProxyScope", () => {
    assert.equal(typeof T.restrictTrustProxyToNonPublic, "function");
    assert.equal(typeof T.describeTrustProxyScope, "function");
  });

  it("anomalie reproduite : une plage /8 qui deborde sur l'espace public laisse usurper request.ip", async () => {
    // Proxy Railway (pair direct) en CGNAT ; client reel public 100.1.2.3, qui forge lui-meme 1.2.3.4.
    const forged = { "x-forwarded-for": "1.2.3.4, 100.1.2.3" };
    const before = await seen("100.0.0.0/8", "100.64.0.5", forged);
    assert.equal(before.ip, "1.2.3.4", "comportement de reference de proxy-addr avec la valeur brute");
    const after = await seen(restrict("100.0.0.0/8").value, "100.64.0.5", forged);
    assert.equal(after.ip, "100.1.2.3", "apres restriction : l'IP du client reel, jamais l'adresse forgee");
  });

  it("reduit chaque entree a l'espace non routable, sans jamais elargir", () => {
    const cases: Array<[string, string]> = [
      ["100.0.0.0/8", "100.64.0.0/10"],
      ["172.0.0.0/8", "172.16.0.0/12"],
      ["192.0.0.0/8", "192.168.0.0/16"],
      ["10.0.0.0/8", "10.0.0.0/8"],
      ["10.20.30.0/24", "10.20.30.0/24"],
      ["100.64.0.5", "100.64.0.5"],
      ["fd12::/16", "fd12::/16"],
      ["fd00:1234:5678::/48", "fd00:1234:5678::/48"],
      ["fe80::/16", "fe80::/16"],
      ["uniquelocal,linklocal", "uniquelocal,linklocal"],
    ];
    for (const [raw, expected] of cases) assert.equal(restrict(raw).value, expected, raw);
  });

  it("garde : fc00::/7 et toute plage plus large que /16 restent refuses par la validation existante", () => {
    assert.throws(() => parseTrustProxy("fc00::/7"), /too broad/);
  });

  it("IPv6 : une plage /16 qui couvre de l'espace public est retiree ; le ULA est conserve", () => {
    assert.equal(restrict("2001::/16").value, "loopback");
    assert.equal(restrict("2001::/16,fd12::/16").value, "fd12::/16");
  });

  it("retire les entrees entierement publiques ; une liste videe retombe sur loopback", () => {
    for (const raw of ["8.8.8.0/24", "203.0.113.10", "2001:db8::/32", "2000::/16", "1.0.0.0/8"]) {
      const r = restrict(raw);
      assert.equal(r.value, "loopback", raw);
      assert.equal(r.dropped, 1, raw);
    }
    const mixed = restrict("8.8.8.0/24,10.1.0.0/16");
    assert.equal(mixed.value, "10.1.0.0/16");
    assert.equal(mixed.dropped, 1);
  });

  it("resume de portee journalisable : aucune adresse, seulement des compteurs et des alias", () => {
    const d = String(T.describeTrustProxyScope!(restrict("100.0.0.0/8,8.8.8.0/24,uniquelocal,fd12::/16")));
    for (const leaked of ["100.", "8.8.8", "fd12", "10.0", "172.16", "192.168"]) assert.ok(!d.includes(leaked), "fuite : " + leaked + " dans " + d);
    assert.match(d, /clipped=1/);
    assert.match(d, /dropped=1/);
    assert.match(d, /aliases=uniquelocal/);
    assert.match(d, /publicSpace=excluded/);
  });
});

describe("chemins d'entree : en-tetes forges", () => {
  const edge = "100.64.0.5";
  const trust = () => restrict("100.64.0.0/10").value;

  it("chemin public via le proxy : deux clients distincts gardent deux identites (rate limiting)", async () => {
    const a = await seen(trust(), edge, { "x-forwarded-for": "198.51.100.1" });
    const b = await seen(trust(), edge, { "x-forwarded-for": "198.51.100.2" });
    assert.notEqual(a.ip, b.ip);
  });

  it("chemin public : une adresse injectee a gauche par le client est ignoree", async () => {
    const r = await seen(trust(), edge, { "x-forwarded-for": "203.0.113.77, 198.51.100.9" });
    assert.equal(r.ip, "198.51.100.9");
  });

  it("connexion directe d'un pair non approuve : X-Forwarded-For, -Host et -Proto ignores", async () => {
    const r = await seen(trust(), "198.51.100.50", { "x-forwarded-for": "1.2.3.4", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" });
    assert.deepEqual(r, { ip: "198.51.100.50", host: "api.example.test", protocol: "http" });
  });

  it("reseau prive : une liste restreinte au proxy refuse l'injection d'un autre service prive", async () => {
    const r = await seen(trust(), "10.0.0.9", { "x-forwarded-for": "1.2.3.4", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" });
    assert.deepEqual(r, { ip: "10.0.0.9", host: "api.example.test", protocol: "http" });
  });

  it("reseau prive : avec l'alias uniquelocal, un autre service prive PEUT usurper request.ip (risque residuel documente)", async () => {
    const r = await seen(restrict("uniquelocal").value, "10.0.0.9", { "x-forwarded-for": "1.2.3.4" });
    assert.equal(r.ip, "1.2.3.4");
  });

  it("repli loopback : aucune usurpation possible, mais identite partagee derriere le proxy", async () => {
    const a = await seen(restrict("false").value, edge, { "x-forwarded-for": "198.51.100.1" });
    const b = await seen(restrict("false").value, edge, { "x-forwarded-for": "198.51.100.2" });
    assert.equal(a.ip, edge);
    assert.equal(b.ip, edge);
  });
});
