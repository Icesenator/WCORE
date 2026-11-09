// 2026-11-09 — P0-DATA-CHAIN-SUNSET-EARLY-WARNING / TRUST_PROXY INVALID_FOR_CURRENT_RELEASE_GATE.
// La valeur de production observée par l'opérateur a la forme : cinq plages publiques /24 plus
// 100.64.0.0/10. Les plages réelles ne sont PAS reproduites ici (adresses génériques à la place).
// Mesure Railway : le pair direct vu par le conteneur est le proxy d'entrée, en 100.64.0.0/10 ; les
// plages publiques ne servent pas à l'atteindre. Ce test fige :
//   1. le défaut du code déployé (valeur brute) : un client réel d'une plage publique de confiance
//      fait adopter le X-Forwarded-For qu'il forge ;
//   2. la correction fail-closed : les entrées publiques sont retirées, le proxy reste de confiance,
//      request.ip redevient l'IP réelle ;
//   3. les chemins privés directs (10/8, ULA) n'influencent jamais request.ip ;
//   4. le risque résiduel : un pair direct en 100.64.0.0/10 qui n'est pas le proxy reste cru.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { describeTrustProxyScope, parseTrustProxy, restrictTrustProxyToNonPublic } from "./trust-proxy.js";

const SHAPE = "1.2.3.0/24,9.9.9.0/24,192.0.2.0/24,198.51.100.0/24,203.0.113.0/24,100.64.0.0/10";
const PROXY = "100.64.0.16"; // forme du pair mesuré (CGNAT), adresse générique

async function seen(trustProxy: string, remoteAddress: string, xff?: string) {
  const app = Fastify({ trustProxy });
  app.get("/who", async (req) => ({ ip: req.ip }));
  await app.ready();
  const res = await app.inject({ method: "GET", url: "/who", remoteAddress,
    headers: { host: "api.example.test", ...(xff ? { "x-forwarded-for": xff } : {}) } });
  await app.close();
  return (res.json() as { ip: string }).ip;
}

const raw = parseTrustProxy(SHAPE);
const fixed = restrictTrustProxyToNonPublic(raw);

describe("TRUST_PROXY de forme production (5 /24 publiques + 100.64.0.0/10)", () => {
  it("la valeur brute est acceptée par la validation syntaxique (c'est le défaut)", () => {
    assert.equal(raw, SHAPE);
  });

  it("défaut reproduit : un client réel d'une /24 de confiance usurpe request.ip via le proxy", async () => {
    // Le client 1.2.3.50 (dans une /24 de confiance) forge 6.6.6.6 ; le proxy ajoute l'IP réelle à droite.
    assert.equal(await seen(raw, PROXY, "6.6.6.6, 1.2.3.50"), "6.6.6.6");
  });

  it("correction : les 5 entrées publiques sont retirées, seule 100.64.0.0/10 reste", () => {
    assert.equal(fixed.value, "100.64.0.0/10");
  });

  it("correction : le même client garde son IP réelle, l'adresse forgée est ignorée", async () => {
    assert.equal(await seen(fixed.value, PROXY, "6.6.6.6, 1.2.3.50"), "1.2.3.50");
  });

  it("correction : un client public ordinaire n'est jamais affecté", async () => {
    assert.equal(await seen(fixed.value, PROXY, "6.6.6.6, 8.8.4.4"), "8.8.4.4");
    assert.equal(await seen(raw, PROXY, "6.6.6.6, 8.8.4.4"), "8.8.4.4");
  });

  it("correction : le proxy reste de confiance (pas de retour à l'identité partagée)", async () => {
    assert.equal(await seen(fixed.value, PROXY, "8.8.4.4"), "8.8.4.4");
  });

  it("chemin privé direct IPv4 (10/8) : X-Forwarded-For forgé ignoré", async () => {
    assert.equal(await seen(fixed.value, "10.0.0.9", "8.8.4.4"), "10.0.0.9");
  });

  it("chemin privé direct ULA (fd12::/16) : X-Forwarded-For forgé ignoré", async () => {
    assert.equal(await seen(fixed.value, "fd12:b412:1:1::9", "8.8.4.4"), "fd12:b412:1:1::9");
  });

  it("le journal de démarrage signale le retrait sans aucune adresse", () => {
    const line = describeTrustProxyScope(fixed);
    for (const leaked of ["1.2.3", "9.9.9", "192.0.2", "198.51.100", "203.0.113", "100.64"]) {
      assert.ok(!line.includes(leaked), `adresse absente du journal : ${leaked}`);
    }
    assert.match(line, /5/);
  });

  it("risque résiduel documenté : un pair direct en 100.64.0.0/10 autre que le proxy reste cru", async () => {
    // L'adresse n'est pas une identité garantie : seule l'absence d'autorisation fondée sur l'IP
    // (jeton de lecture des scans anonymes) protège les frontières d'autorisation.
    assert.equal(await seen(fixed.value, "100.64.200.1", "8.8.4.4"), "8.8.4.4");
  });
});
