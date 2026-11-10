// 2026-11-09 — P0-SEC-TRUST-PROXY-PUBLIC-RANGES. La valeur de production a la forme : cinq plages
// publiques /24 plus 100.64.0.0/10 (plages réelles NON reproduites, adresses génériques à la place).
// Mesure (130 requêtes, 18:30-19:20Z) : chaîne client -> bord public Railway -> proxy interne
// 100.64.0.0/10 -> conteneur ; les /24 publiques sont les adresses des bords (120/130 requêtes voient
// l'IP réelle grâce à elles, 10/130 voient un bord hors liste). Ce test fige :
//   1. le défaut du code déployé (valeur brute) : un client d'une plage de bord usurpe request.ip ;
//   2. pourquoi la simple restriction à l'espace non public ne suffit pas : identité partagée (bord) ;
//   3. la correction retenue (confiance liée à la position du saut) : IP réelle, aucune usurpation.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { describeTrustProxyScope, parseTrustProxy, positionalTrustProxy, restrictTrustProxyToNonPublic } from "./trust-proxy.js";

const SHAPE = "1.2.3.0/24,9.9.9.0/24,192.0.2.0/24,198.51.100.0/24,203.0.113.0/24,100.64.0.0/10";
const PROXY = "100.64.0.16"; // proxy interne (forme mesurée), adresse générique
const EDGE = "1.2.3.7";      // bord public listé, adresse générique
const CLIENT = "8.8.4.4";

async function seen(trustProxy: unknown, remoteAddress: string, xff?: string) {
  const app = Fastify({ trustProxy: trustProxy as never });
  app.get("/who", async (req) => ({ ip: req.ip }));
  await app.ready();
  const res = await app.inject({ method: "GET", url: "/who", remoteAddress,
    headers: { host: "api.example.test", ...(xff ? { "x-forwarded-for": xff } : {}) } });
  await app.close();
  return (res.json() as { ip: string }).ip;
}

const raw = parseTrustProxy(SHAPE);
const restricted = restrictTrustProxyToNonPublic(raw);
const positional = positionalTrustProxy(raw);

describe("TRUST_PROXY de forme production (5 /24 de bords + 100.64.0.0/10)", () => {
  it("la valeur brute est acceptée par la validation syntaxique", () => {
    assert.equal(raw, SHAPE);
  });

  it("code déployé : l'IP réelle est vue quand le bord est listé", async () => {
    assert.equal(await seen(raw, PROXY, `${CLIENT}, ${EDGE}`), CLIENT);
  });

  it("défaut du code déployé : un client d'une plage de bord fait adopter l'adresse qu'il forge", async () => {
    assert.equal(await seen(raw, PROXY, `6.6.6.6, 1.2.3.50, ${EDGE}`), "6.6.6.6");
  });

  it("la restriction seule à l'espace non public garde 100.64.0.0/10 et retire les 5 bords", () => {
    assert.equal(restricted.value, "100.64.0.0/10");
    assert.match(describeTrustProxyScope(restricted), /dropped=5/);
  });

  it("pourquoi elle ne suffit pas : request.ip devient l'adresse du bord pour tout le monde", async () => {
    assert.equal(await seen(restricted.value, PROXY, `${CLIENT}, ${EDGE}`), EDGE);
  });

  it("correction retenue : IP réelle conservée et usurpation impossible", async () => {
    assert.equal(await seen(positional.trust, PROXY, `${CLIENT}, ${EDGE}`), CLIENT);
    assert.equal(await seen(positional.trust, PROXY, `6.6.6.6, ${CLIENT}, ${EDGE}`), CLIENT);
    assert.equal(await seen(positional.trust, PROXY, `6.6.6.6, 1.2.3.50, ${EDGE}`), "1.2.3.50");
  });

  it("correction retenue : chemins privés directs ignorés", async () => {
    assert.equal(await seen(positional.trust, "10.0.0.9", `${CLIENT}, ${EDGE}`), "10.0.0.9");
    assert.equal(await seen(positional.trust, "fd12:b412:1:1::9", `${CLIENT}, ${EDGE}`), "fd12:b412:1:1::9");
  });
});
