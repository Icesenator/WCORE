// 2026-11-09 — P0-SEC-TRUST-PROXY-PUBLIC-RANGES. Mesure de production (130 requêtes, 18:30-19:20Z) :
// la chaîne réelle est client -> bord public Railway (POP) -> proxy interne 100.64.0.0/10 -> conteneur.
// Les plages publiques de TRUST_PROXY sont les adresses des bords : les retirer ferait de l'adresse du
// bord le request.ip de tout le monde (identité partagée). Les garder sans contrainte de position laisse
// un client de ces plages faire adopter l'adresse qu'il forge. La confiance est donc liée à la position :
//   saut 0 (pair direct)   : seulement une entrée NON publique (proxy interne) ;
//   saut 1 (ajouté par le proxy interne) : seulement une entrée PUBLIQUE configurée (bord) ;
//   saut 2 et au-delà      : jamais. request.ip = l'adresse ajoutée par le bord, c'est-à-dire le client.
// Adresses génériques : les plages réelles ne sont pas reproduites.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { parseTrustProxy, positionalTrustProxy, describePositionalTrust } from "./trust-proxy.js";

const SHAPE = "1.2.3.0/24,9.9.9.0/24,192.0.2.0/24,198.51.100.0/24,203.0.113.0/24,100.64.0.0/10";
const PROXY = "100.64.0.16";   // proxy interne (forme mesurée)
const EDGE = "1.2.3.7";        // bord listé
const UNLISTED_EDGE = "1.2.99.7"; // bord hors liste (8 % du trafic mesuré)
const CLIENT = "8.8.4.4";

async function seen(trustProxy: unknown, remoteAddress: string, xff?: string) {
  const app = Fastify({ trustProxy: trustProxy as never });
  app.get("/who", async (req) => ({ ip: req.ip, ips: req.ips }));
  await app.ready();
  const res = await app.inject({ method: "GET", url: "/who", remoteAddress,
    headers: { host: "api.example.test", ...(xff ? { "x-forwarded-for": xff } : {}) } });
  await app.close();
  return (res.json() as { ip: string }).ip;
}
const trust = positionalTrustProxy(parseTrustProxy(SHAPE));

describe("TRUST_PROXY lié à la position du saut (bord public + proxy interne)", () => {
  it("IP réelle conservée : client -> bord listé -> proxy interne", async () => {
    assert.equal(await seen(trust.trust, PROXY, `${CLIENT}, ${EDGE}`), CLIENT);
  });

  it("usurpation impossible depuis le chemin public : l'adresse forgée à gauche est ignorée", async () => {
    assert.equal(await seen(trust.trust, PROXY, `6.6.6.6, ${CLIENT}, ${EDGE}`), CLIENT);
  });

  it("défaut corrigé : un client dont l'IP réelle est dans une plage de bord ne peut plus usurper", async () => {
    // Avec la valeur brute, proxy-addr croit aussi le client (1.2.3.50 est « de confiance ») et adopte 6.6.6.6.
    assert.equal(await seen(parseTrustProxy(SHAPE), PROXY, `6.6.6.6, 1.2.3.50, ${EDGE}`), "6.6.6.6");
    assert.equal(await seen(trust.trust, PROXY, `6.6.6.6, 1.2.3.50, ${EDGE}`), "1.2.3.50");
  });

  it("bord hors liste : request.ip reste l'adresse du bord (comportement actuel, pas de régression)", async () => {
    assert.equal(await seen(trust.trust, PROXY, `${CLIENT}, ${UNLISTED_EDGE}`), UNLISTED_EDGE);
  });

  it("une adresse de bord n'est jamais crue comme pair direct (saut 0)", async () => {
    assert.equal(await seen(trust.trust, EDGE, `6.6.6.6`), EDGE);
  });

  it("le proxy interne n'est jamais cru au saut 1 (pas d'élargissement de la chaîne)", async () => {
    assert.equal(await seen(trust.trust, PROXY, `6.6.6.6, 100.64.0.99`), "100.64.0.99");
  });

  it("chemin privé direct IPv4 (10/8) : X-Forwarded-For forgé ignoré", async () => {
    assert.equal(await seen(trust.trust, "10.0.0.9", `6.6.6.6, ${EDGE}`), "10.0.0.9");
  });

  it("chemin privé direct ULA : X-Forwarded-For forgé ignoré", async () => {
    assert.equal(await seen(trust.trust, "fd12:b412:1:1::9", `6.6.6.6, ${EDGE}`), "fd12:b412:1:1::9");
  });

  it("adresse IPv4 mappée en IPv6 pour le pair direct : traitée comme IPv4", async () => {
    assert.equal(await seen(trust.trust, `::ffff:${PROXY}`, `${CLIENT}, ${EDGE}`), CLIENT);
  });

  it("sans entrée publique : le bord n'est jamais cru (repli sûr, identité = bord)", async () => {
    const internalOnly = positionalTrustProxy(parseTrustProxy("100.64.0.0/10"));
    assert.equal(await seen(internalOnly.trust, PROXY, `6.6.6.6, ${CLIENT}, ${EDGE}`), EDGE);
  });

  it("valeur absente ou loopback : rien n'est cru hors de l'hôte", async () => {
    const lo = positionalTrustProxy(parseTrustProxy(undefined));
    assert.equal(await seen(lo.trust, PROXY, `6.6.6.6`), PROXY);
  });

  it("alias non publics (uniquelocal) : saut 0 seulement", async () => {
    const t = positionalTrustProxy(parseTrustProxy("uniquelocal"));
    assert.equal(await seen(t.trust, "10.1.2.3", `6.6.6.6, ${EDGE}`), EDGE);
    assert.equal(await seen(t.trust, "10.1.2.3", `${CLIENT}`), CLIENT);
  });

  it("le journal de démarrage décrit la portée sans aucune adresse", () => {
    const line = describePositionalTrust(trust);
    for (const leaked of ["1.2.3", "9.9.9", "192.0.2", "198.51.100", "203.0.113", "100.64"]) {
      assert.ok(!line.includes(leaked), `adresse absente du journal : ${leaked}`);
    }
    assert.match(line, /internal=1/);
    assert.match(line, /edges=5/);
    assert.match(line, /maxHops=2/);
  });

  it("risque résiduel documenté : un pair direct en 100.64.0.0/10 qui connaît une adresse de bord peut usurper", async () => {
    // Exige un pair dans l'espace CGNAT de la plateforme ; aucune frontière d'autorisation ne repose plus
    // sur l'IP (jeton de lecture des scans anonymes), seul le rate limiting est concerné.
    assert.equal(await seen(trust.trust, "100.64.200.1", `6.6.6.6, ${EDGE}`), "6.6.6.6");
  });
});
