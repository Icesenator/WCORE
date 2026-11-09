// 2026-11-09 — revue Supervisor : controle d'acces aux scans asynchrones anonymes.
// Un scan anonyme appartenait seulement a son IP source (job.ip === req.ip). Ce test mesure si un
// pair du reseau prive, capable de forger X-Forwarded-For, franchit ce controle quand il connait
// deja le jobId. Il ne juge pas la difficulte d'obtenir le jobId (aleatoire de 128 bits, mais
// present dans l'URL donc dans les journaux de requetes), seulement la verification effective
// d'autorisation. Adresses : plages de documentation et prefixes generiques uniquement.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { parseTrustProxy, restrictTrustProxyToNonPublic } from "./trust-proxy.js";
import { jobPrincipal, ownsScanJob } from "./plugins/scan-job.js";
import { SCAN_POLL_TOKEN_HEADER, scanPollToken, verifyScanPollToken } from "./plugins/scan-poll-token.js";

const SECRET = "test-secret-0123456789abcdef0123456789";
const JOB_ID = "0123456789abcdef0123456789abcdef";
const VICTIM = "198.51.100.23";
const EDGE = "100.64.0.5"; // proxy Railway vu en CGNAT (generique)
const EDGE_ULA = "fd00:1234:5678::5"; // proxy Railway vu en ULA (prefixe generique)
const PRIVATE_PEER = "10.0.0.9"; // autre service du reseau prive

type Mode = "ip-only" | "ip-and-token";

async function poll(mode: Mode, trustProxy: string, edge: string, remoteAddress: string, headers: Record<string, string>) {
  const jobs = new Map<string, { userId: string | null; ip: string }>();
  const app = Fastify({ trustProxy });
  // Reproduction des deux routes : creation (enregistre req.ip, rend le jeton) puis lecture.
  app.post("/create", async (req) => {
    jobs.set(JOB_ID, { userId: null, ip: req.ip });
    return { jobId: JOB_ID, principal: jobPrincipal({ ip: req.ip }), pollToken: scanPollToken(SECRET, JOB_ID) };
  });
  app.get("/api/scan/async/:jobId", async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    const row = jobs.get(jobId);
    // "ip-only" = controle d'origine (avant correctif) ; "ip-and-token" = controle corrige.
    const tokenOk = mode === "ip-only" ? true : verifyScanPollToken(SECRET, jobId, req.headers[SCAN_POLL_TOKEN_HEADER]);
    if (!row || !ownsScanJob(row, undefined, req.ip, tokenOk)) return reply.code(404).send({ error: "job_not_found" });
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
const token = { [SCAN_POLL_TOKEN_HEADER]: scanPollToken(SECRET, JOB_ID) };

describe("scans anonymes, controle d'origine (IP seule) face a un X-Forwarded-For forge", () => {
  it("proprietaire legitime via le proxy public : 200", async () => {
    assert.equal(await poll("ip-only", restrict("uniquelocal"), EDGE_ULA, EDGE_ULA, { "x-forwarded-for": VICTIM }), 200);
  });

  it("FRONTIERE FRANCHIE (cas B) : avec l'alias uniquelocal, un pair prive qui connait le jobId et forge l'IP de la victime lit le scan", async () => {
    assert.equal(await poll("ip-only", restrict("uniquelocal"), EDGE_ULA, PRIVATE_PEER, { "x-forwarded-for": VICTIM }), 200);
  });

  it("FRONTIERE FRANCHIE (cas B) : idem avec une plage privee large 10.0.0.0/8 qui couvre le pair", async () => {
    assert.equal(await poll("ip-only", restrict("10.0.0.0/8,100.64.0.0/10"), EDGE, PRIVATE_PEER, { "x-forwarded-for": VICTIM }), 200);
  });

  it("cas A : confiance limitee a la plage du proxy, un pair prive hors de cette plage est refuse (404)", async () => {
    assert.equal(await poll("ip-only", restrict("100.64.0.0/10"), EDGE, PRIVATE_PEER, { "x-forwarded-for": VICTIM }), 404);
  });

  it("chemin public : un autre client qui connait le jobId est refuse (404), meme s'il injecte l'IP a gauche", async () => {
    assert.equal(await poll("ip-only", restrict("uniquelocal"), EDGE_ULA, EDGE_ULA, { "x-forwarded-for": `${VICTIM}, 203.0.113.40` }), 404);
  });

  it("le correctif TRUST_PROXY (espace public exclu) ne ferme PAS le chemin prive : il ne touche pas aux alias prives", () => {
    assert.equal(restrict("uniquelocal"), "uniquelocal");
  });
});

describe("scans anonymes, controle corrige (IP et jeton de lecture)", () => {
  it("proprietaire legitime avec son jeton : 200", async () => {
    assert.equal(await poll("ip-and-token", restrict("uniquelocal"), EDGE_ULA, EDGE_ULA, { "x-forwarded-for": VICTIM, ...token }), 200);
  });

  it("FRONTIERE FERMEE : le pair prive qui connait le jobId et forge l'IP, sans le jeton, est refuse (404)", async () => {
    assert.equal(await poll("ip-and-token", restrict("uniquelocal"), EDGE_ULA, PRIVATE_PEER, { "x-forwarded-for": VICTIM }), 404);
    assert.equal(await poll("ip-and-token", restrict("10.0.0.0/8,100.64.0.0/10"), EDGE, PRIVATE_PEER, { "x-forwarded-for": VICTIM }), 404);
  });

  it("un jeton d'un autre job ou altere est refuse (404)", async () => {
    const other = { [SCAN_POLL_TOKEN_HEADER]: scanPollToken(SECRET, "ffffffffffffffffffffffffffffffff") };
    assert.equal(await poll("ip-and-token", restrict("uniquelocal"), EDGE_ULA, PRIVATE_PEER, { "x-forwarded-for": VICTIM, ...other }), 404);
  });

  it("le jeton seul ne suffit pas : une autre IP reste refusee (404)", async () => {
    assert.equal(await poll("ip-and-token", restrict("uniquelocal"), EDGE_ULA, EDGE_ULA, { "x-forwarded-for": "203.0.113.40", ...token }), 404);
  });
});
