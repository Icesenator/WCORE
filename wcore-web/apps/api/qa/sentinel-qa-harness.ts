// HARNAIS QA LOCAL UNIQUEMENT — jamais deploye, jamais enregistre dans server.ts.
// Sert le vrai sentinelPlugin avec un MemoryCacheStore et un utilisateur de test
// fictif (expositions SYNTHETIQUES, aucune adresse ni montant reel).
// QA_AUTH=anon => visiteur non connecte. QA_FETCH=real => vraie collecte des
// sources officielles (GET publics via safeFetch) ; sinon sources simulees.
import Fastify from "fastify";
import cors from "@fastify/cors";
import { MemoryCacheStore } from "@wcore/core";
import type { ExposureInput } from "@wcore/shared";
import { sentinelPlugin, runSentinelCheck, type SentinelDeps } from "../src/plugins/sentinel";
import { safeFetch } from "../src/lib/safe-http";

const PORT = Number(process.env.QA_PORT || 4100);
const anon = process.env.QA_AUTH === "anon";
const store = new MemoryCacheStore();

const fetchText: SentinelDeps["fetchText"] = process.env.QA_FETCH === "real"
  ? async (url) => {
      const res = await safeFetch(url, { signal: AbortSignal.timeout(10_000) });
      const text = (await res.text()).slice(0, 2_000_000);
      return { status: res.status, text };
    }
  : async (url) => ({ status: 200, text: `qa-fixture ${url}` });

// Expositions SYNTHETIQUES de l'utilisateur de test (donnees de QA, pas des fonds reels).
const QA_EXPOSURES: ExposureInput[] = [
  { chainKey: "abstract", kind: "NATIVE", asset: "ETH", covered: true, balance: 0.5, balanceObservedAt: Date.now() - 3600_000 },
  { chainKey: "cronos_zkevm", kind: "ERC20", asset: "zkCRO", covered: false, balance: null, balanceObservedAt: null },
  { chainKey: "gravity", kind: "NATIVE", asset: "G", covered: true, balance: 5, balanceObservedAt: Date.parse("2026-11-01T08:44:09Z") },
  { chainKey: "blast", kind: "NATIVE", asset: "ETH", covered: true, balance: 0, balanceObservedAt: Date.now() - 3600_000 },
];

// Modes de QA supplementaires (tous locaux, donnees synthetiques) :
//   QA_FAIL=health|all  -> /api/sentinel/health (ou toutes les routes Sentinel) en 503
//   QA_STALE=1          -> derniere collecte reussie ancienne (surveillance interrompue)
//   QA_SESSION=expired  -> alertes 401 et /api/auth/refresh 401 (session expiree)
// Le compteur /qa/counters permet de verifier l'absence de boucle de refresh.
const counters = { refresh: 0, alerts: 0, scan: 0 };
const synthToken = (symbol: string, balance: number) => ({ contract: "native", symbol, name: symbol, decimals: 18, balance, priceEur: null, priceSource: null, valueEur: null, flags: [] as string[] });
const synthChain = (chainKey: string, chainName: string, symbol: string) => ({
  chainKey, chainName, vm: "EVM", native: synthToken(symbol, 1), tokens: [], totals: { valueEur: 0, tokenCount: 1, pricedCount: 0 },
  errors: [], degraded: false, fxRate: 1, scanMs: 1, cachedAt: new Date().toISOString(), scriptVersion: "qa-synthetic",
});

async function main() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: /^http:\/\/(localhost|127\.0\.0\.1):\d+$/, credentials: true });
  const fail = process.env.QA_FAIL;
  const expired = process.env.QA_SESSION === "expired";
  app.addHook("onRequest", async (req, reply) => {
    const url = req.url.split("?")[0]!;
    if (url === "/api/sentinel/alerts") counters.alerts++;
    if (fail === "all" && url.startsWith("/api/sentinel")) return reply.code(503).send({ error: "qa_unavailable" });
    if (fail === "health" && url === "/api/sentinel/health") return reply.code(503).send({ error: "qa_unavailable" });
    if (expired && (url.startsWith("/api/sentinel/alerts") || url === "/api/sentinel/history")) return reply.code(401).send({ error: "not_authenticated" });
  });
  app.post("/api/auth/refresh", async (_req, reply) => { counters.refresh++; return reply.code(401).send({ error: "not_authenticated" }); });
  app.get("/qa/counters", async () => counters);
  // Scan SYNTHETIQUE (aucune adresse ni solde reel) pour rendre de vraies ChainCard.
  const synthChains = () => [synthChain("ABSTRACT", "Abstract", "ETH"), synthChain("GRAVITY", "Gravity Alpha", "G"), synthChain("LISK", "Lisk", "ETH"), synthChain("BASE", "Base", "ETH")];
  app.get("/api/chains", async () => ({ chains: ["ABSTRACT", "GRAVITY", "LISK", "BASE"].map((key) => ({ key, vm: "EVM" })) }));
  app.post("/api/scan", async () => {
    counters.scan++;
    const chains = synthChains();
    return { chains, totals: { valueEur: 0, tokenCount: chains.length } };
  });
  app.post<{ Body: { addresses?: string[]; chains?: string[] } }>("/api/scan/batch", async (req) => {
    counters.scan++;
    const wanted = (req.body?.chains ?? []).map((c) => String(c).toUpperCase());
    console.log("[qa-harness] batch chains", wanted.join(","));
    const base = synthChains();
    const chains = [...base, ...wanted.filter((k) => !base.some((c) => c.chainKey === k)).map((k) => synthChain(k, k, "ETH"))];
    return { wallets: (req.body?.addresses ?? []).map((address) => ({ address, chains, totals: { valueEur: 0, tokenCount: chains.length } })) };
  });
  const deps: SentinelDeps = { store, fetchText, intervalMs: 6 * 3600_000 };
  await app.register(sentinelPlugin, {
    ...deps,
    isAdmin: () => false,
    userId: () => (anon ? null : "qa-user"),
    exposuresFor: async () => QA_EXPOSURES,
  });
  const first = await runSentinelCheck(deps);
  console.log("[qa-harness] collecte initiale", JSON.stringify(first.health ?? first));
  if (process.env.QA_STALE === "1") {
    const h = await store.get<Record<string, unknown>>("sentinel:v1:health");
    await store.set("sentinel:v1:health", { ...h, lastSuccessAt: new Date(Date.now() - 40 * 3600_000).toISOString() });
  }
  await app.listen({ port: PORT, host: "127.0.0.1" });
  console.log(`[qa-harness] http://127.0.0.1:${PORT} auth=${anon ? "anon" : "qa-user"} fetch=${process.env.QA_FETCH || "fixture"}`);
}

void main();
