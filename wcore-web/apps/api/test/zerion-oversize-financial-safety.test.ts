// Refus `oversize` du vrai provider Zerion -> service -> scan-step/merge -> route /api/scan.
// Hermétique : fetch simulé (aucun réseau), cache mémoire, vérificateur RPC simulé, pas de DB/Redis.
import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { MemoryCacheStore } from "@wcore/core";
import type { CircuitBreaker, WalletAssets } from "@wcore/core";
import type { PrismaClient } from "@wcore/db";

import { createZerionProvider, MAX_IMPLEMENTATIONS_PER_POSITION } from "../src/integrations/portfolio-enrichment/zerion.js";
import { createPortfolioEnrichmentService, type EnrichmentCache, type EnrichmentCacheEntry } from "../src/integrations/portfolio-enrichment/service.js";
import { createPortfolioEnrichmentScanStep } from "../src/integrations/portfolio-enrichment/scan-step.js";
import { scanPlugin, type ScanPluginDeps } from "../src/plugins/scan.js";
import { buildChainScan } from "../src/server-helpers.js";

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";
const TOKEN = "0x1111111111111111111111111111111111111111";
const T0 = Date.parse("2026-10-29T10:00:00.000Z");

function row(id: string, implementations = [{ chain_id: "ethereum", address: TOKEN }]) {
  return {
    type: "positions", id,
    attributes: {
      position_type: "wallet", quantity: { float: 2 }, price: 3, value: 6,
      flags: { displayable: true, is_trash: false },
      fungible_info: { flags: { verified: true }, implementations },
      protocol_metadata: null, group_id: null,
    },
    relationships: { chain: { data: { type: "chains", id: "ethereum" } }, dapp: { data: null } },
  };
}
const envelope = (data: unknown[]) => ({ links: { self: "fixture://z", next: null, prev: null }, meta: { total: data.length }, data });
const OVERSIZE_ROWS = envelope([row("a"), row("b"), row("c")]); // maxPositions = 2
const OVERSIZE_IMPLS = envelope([row("a", Array.from({ length: MAX_IMPLEMENTATIONS_PER_POSITION + 1 }, () => ({ bogus: 1 } as never)))]);
const VALID = envelope([row("a")]);

function harness() {
  let now = T0;
  let body: unknown = VALID;
  const verifyCalls: string[] = [];
  const store = new Map<string, EnrichmentCacheEntry>();
  const cache: EnrichmentCache = { get: async (k) => store.get(k) ?? null, set: async (k, v) => { store.set(k, v); } };
  const provider = createZerionProvider({
    apiKey: "fake", timeoutMs: 1_000, maxResponseBytes: 2_000_000, maxPositions: 2,
    fetchImpl: (async () => new Response(JSON.stringify(body))) as typeof fetch,
    now: () => now,
  });
  const framework = createPortfolioEnrichmentService({
    providers: [provider],
    policyFor: () => ({ enabled: true, timeoutMs: 1_000, maxPositions: 2, allowStale: true, staleTtlMs: 60_000, purposes: ["complex-positions", "wallet-hints", "diagnostics"] }),
    budget: { tryConsume: () => true },
    breaker: { allow: () => true, recordSuccess: () => {}, recordFailure: () => {} },
    cache,
    now: () => now,
  });
  const step = createPortfolioEnrichmentScanStep({
    framework, enabled: true,
    verifyContract: async ({ contract }) => { verifyCalls.push(contract); return { contract, balance: 7 }; },
  });
  return {
    framework, step, verifyCalls, store,
    setBody: (b: unknown) => { body = b; },
    advance: (ms: number) => { now += ms; },
  };
}

const input = (assets = new Map<string, WalletAssets>()) => ({ address: WALLET, requestedChains: ["ETHEREUM"], assetsByChain: assets });

for (const [label, payload] of [["lignes > maxPositions", OVERSIZE_ROWS], ["implementations > 128", OVERSIZE_IMPLS]] as const) {
  test(`oversize (${label}) sans cache : PROVIDER_ERROR, aucun snapshot, aucun solde, rien de frais`, async () => {
    const h = harness();
    h.setBody(payload);
    const [outcome] = await h.framework.run(input());
    assert.equal(outcome?.status, "PROVIDER_ERROR");
    assert.equal(outcome?.errorKind, "oversize");
    assert.equal(outcome?.snapshot, null, "aucun snapshot (donc aucun solde 0 inventé)");
    assert.equal(outcome?.stale, false);
    assert.equal(h.store.size, 0, "un refus n'écrit jamais le cache last-good");

    const assets = new Map<string, WalletAssets>([["ETHEREUM", { chain: "ETHEREUM", tokens: [{ contract: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", balance: 5 }] } as unknown as WalletAssets]]);
    const before = structuredClone(assets.get("ETHEREUM"));
    const result = await h.step.run(input(assets));
    assert.equal(result.diagnostics.enrich_zerion, "PROVIDER_ERROR");
    assert.equal(result.diagnostics.candidates, 0);
    assert.equal(result.diagnostics.verified, 0);
    assert.equal(result.diagnostics.mutatedAssets, false);
    assert.equal(h.verifyCalls.length, 0, "aucune vérification RPC lancée sur une réponse refusée");
    assert.equal(result.assetsByChain.get("ETHEREUM"), assets.get("ETHEREUM"), "même objet WCORE");
    assert.deepEqual(assets.get("ETHEREUM"), before, "aucune mutation, aucun solde mis à 0");
    assert.ok(!Object.values(result.diagnostics).includes("SUCCESS") && !Object.values(result.diagnostics).includes("EMPTY"));
  });

  test(`oversize (${label}) avec last-good : STALE étiqueté, observedAt ancien, aucun rafraîchissement du cache`, async () => {
    const h = harness();
    const [ok] = await h.framework.run(input());
    assert.equal(ok?.status, "SUCCESS");
    const cachedAt = h.store.values().next().value!.storedAt;
    h.advance(30_000);
    h.setBody(payload);
    const [stale] = await h.framework.run(input());
    assert.equal(stale?.status, "STALE");
    assert.equal(stale?.stale, true);
    assert.equal(stale?.errorKind, "oversize");
    assert.equal(stale?.snapshot?.observedAt, new Date(T0).toISOString(), "date d'observation d'origine, pas maintenant");
    assert.equal(h.store.values().next().value!.storedAt, cachedAt, "le refus ne rafraîchit pas storedAt");

    const result = await h.step.run(input());
    assert.equal(result.diagnostics.enrich_zerion, "STALE");
    // Le merge ne reprend jamais le solde fournisseur : solde RPC (7), pas 2 ni 0.
    assert.equal(result.diagnostics.verified, 1);
  });

  test(`oversize (${label}) après expiration du last-good : pas de STALE servi`, async () => {
    const h = harness();
    await h.framework.run(input());
    h.advance(60_001);
    h.setBody(payload);
    const [o] = await h.framework.run(input());
    assert.equal(o?.status, "PROVIDER_ERROR");
    assert.equal(o?.snapshot, null);
  });
}

test("route /api/scan : un refus oversize ne change ni le statut, ni les totaux, ni les erreurs de chaîne", async () => {
  const CHAIN = "X_TEST_FAKE";
  async function scanWith(enrichment: ScanPluginDeps["enrichment"]) {
    const sharedCache = new MemoryCacheStore();
    await sharedCache.set(`scan:result:${WALLET.toLowerCase()}:${CHAIN.toLowerCase()}`, {
      chain: CHAIN, chainName: CHAIN, native: { symbol: "ETH", balance: 1, priceEur: 2000, valueEur: 2000 },
      tokens: [], errors: [], totalValueEur: 2000, scanMs: 5, ts: Date.now(),
    });
    const app = Fastify({ logger: false });
    app.decorateRequest("user", undefined);
    const deps: ScanPluginDeps = {
      prisma: { walletScan: { create: async () => ({}) } } as unknown as PrismaClient,
      sharedCache,
      getCircuitBreaker: () => ({ allowRequest: () => true, onFailure: () => {}, onSuccess: () => {}, getStatus: () => ({ state: "CLOSED" }) }) as unknown as CircuitBreaker,
      validateChains: () => ({ ok: true, chains: [CHAIN] }),
      resolveCustomTokens: async () => [],
      buildChainScan, getScanLimit: async () => 120, MAX_CHAINS_PER_SCAN: 120, ANONYMOUS_MAX_CHAINS_PER_SCAN: 20,
      scanJobQueue: { start() {}, stop: async () => {}, enqueue: async () => ({ ok: false }), getOwned: async () => null } as never,
      ...(enrichment ? { enrichment } : {}),
    } as ScanPluginDeps;
    await app.register(async (i) => scanPlugin(i, deps));
    await app.ready();
    const res = await app.inject({ method: "POST", url: "/api/scan", payload: { address: WALLET, chains: [CHAIN] } });
    await app.close();
    return res;
  }
  const h = harness();
  h.setBody(OVERSIZE_ROWS);
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...a: unknown[]) => { logs.push(JSON.stringify(a)); };
  let withEnrich, without;
  try {
    withEnrich = await scanWith({ enabled: true, step: h.step });
    without = await scanWith(undefined);
  } finally { console.log = origLog; }
  assert.equal(withEnrich.statusCode, 200);
  assert.equal(without.statusCode, 200);
  const strip = (b: Record<string, unknown>) => JSON.parse(JSON.stringify(b, (k, v) => (k === "scanMs" || k === "cachedAt" || k === "scannedAt" || k === "ts" || k === "durationMs" || k === "generatedAt" || k === "totalMs" ? undefined : v)));
  assert.deepEqual(strip(withEnrich.json()), strip(without.json()), "réponse identique : l'enrichissement n'est jamais exposé ni compté");
  assert.equal(withEnrich.json().totals.valueEur, 2000, "aucun total remplacé par 0");
  assert.doesNotMatch(withEnrich.body, /zerion|enrich|oversize/i, "aucune donnée fournisseur présentée au client");
  assert.ok(logs.some((l) => l.includes("PROVIDER_ERROR")), "l'échec est visible dans les diagnostics serveur");
});
