// 2026-11-09 — revue Supervisor : controle d'acces aux scans asynchrones anonymes.
// Un scan anonyme appartient a son IP source (`ownsScanJob` : job.ip === req.ip). Ce test mesure
// si un pair du reseau prive, capable de forger X-Forwarded-For, franchit ce controle quand il
// connait deja le jobId. Il ne juge pas la difficulte d'obtenir le jobId (aleatoire de 128 bits),
// seulement la verification effective d'autorisation. Adresses : plages de documentation et
// prefixes generiques uniquement.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { parseTrustProxy, restrictTrustProxyToNonPublic } from "./trust-proxy.js";
import { jobPrincipal, ownsScanJob } from "./plugins/scan-job.js";

const JOB_ID = "0123456789abcdef0123456789abcdef";
const VICTIM = "198.51.100.23";
const EDGE = "100.64.0.5"; // proxy Railway vu en CGNAT (generique)
const EDGE_ULA = "fd00:1234:5678::5"; // proxy Railway vu en ULA (prefixe generique)
const PRIVATE_PEER = "10.0.0.9"; // autre service du reseau prive

async function poll(trustProxy: string, edge: string, remoteAddress: string, headers: Record<string, string>) {
  const jobs = new Map<string, { userId: string | null; ip: string }>();
  const app = Fastify({ trustProxy });
  // Reproduction fidele des deux routes : creation (enregistre req.ip) puis lecture (ownsScanJob).
  app.post("/create", async (req) => {
    jobs.set(JOB_ID, { userId: null, ip: req.ip });
    return { jobId: JOB_ID, principal: jobPrincipal({ ip: req.ip }) };
  });
  app.get("/api/scan/async/:jobId", async (req, reply) => {
    const row = jobs.get((req.params as { jobId: string }).jobId);
    if (!row || !ownsScanJob(row, undefined, req.ip)) return reply.code(404).send({ error: "job_not_found" });
    return { ok: true };
  });
  await app.ready();
  // La victime cree son scan via le proxy public.
  await app.inject({ method: "POST", url: "/create", remoteAddress: edge, headers: { "x-forwarded-for": VICTIM } });
  const res = await app.inject({ method: "GET", url: `/api/scan/async/${JOB_ID}`, remoteAddress, headers });
  await app.close();
  return res.statusCode;
}

const restrict = (raw: string) => restrictTrustProxyToNonPublic(parseTrustProxy(raw)).value;

describe("scans anonymes : propriete par IP face a un X-Forwarded-For forge", () => {
  it("proprietaire legitime via le proxy public : 200", async () => {
    assert.equal(await poll(restrict("uniquelocal"), EDGE_ULA, EDGE_ULA, { "x-forwarded-for": VICTIM }), 200);
  });

  it("FRONTIERE FRANCHIE (cas B) : avec l'alias uniquelocal, un pair prive qui connait le jobId et forge l'IP de la victime lit le scan", async () => {
    assert.equal(await poll(restrict("uniquelocal"), EDGE_ULA, PRIVATE_PEER, { "x-forwarded-for": VICTIM }), 200);
  });

  it("FRONTIERE FRANCHIE (cas B) : idem avec une plage privee large 10.0.0.0/8 qui couvre le pair", async () => {
    assert.equal(await poll(restrict("10.0.0.0/8,100.64.0.0/10"), EDGE, PRIVATE_PEER, { "x-forwarded-for": VICTIM }), 200);
  });

  it("cas A : confiance limitee a la plage du proxy, le pair prive est refuse (404)", async () => {
    assert.equal(await poll(restrict("100.64.0.0/10"), EDGE, PRIVATE_PEER, { "x-forwarded-for": VICTIM }), 404);
  });

  it("chemin public : un autre client qui connait le jobId est refuse (404), meme s'il injecte l'IP a gauche", async () => {
    assert.equal(await poll(restrict("uniquelocal"), EDGE_ULA, EDGE_ULA, { "x-forwarded-for": `${VICTIM}, 203.0.113.40` }), 404);
  });

  it("le correctif TRUST_PROXY (espace public exclu) ne ferme PAS le chemin prive : il ne touche pas aux alias prives", () => {
    assert.equal(restrict("uniquelocal"), "uniquelocal");
  });
});
