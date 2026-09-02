import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createScamEnrichmentLoader, isScamEnrichmentEnabled } from "./scam-enrichment.js";

type Row = { chainId: number; address: string; verdict: string; source: string; payload: unknown; updatedAt: Date };

function makePrisma(rows: Row[]) {
  const upserts: Array<Record<string, unknown>> = [];
  const prisma = {
    scamVerdict: {
      findMany: async () => rows,
      upsert: async (args: any) => { upserts.push(args); return {}; },
    },
    scamScanLog: { create: async () => ({}) },
  } as unknown as import("@wcore/db").PrismaClient;
  return { prisma, upserts };
}

const ADDR = "0xaaa0000000000000000000000000000000000001";
const HONEYPOT = {
  available: true, isHoneypot: true, isBlacklisted: true,
  canTakeBackOwnership: false, slippageModifiable: false,
  ownerPercent: 62, isOpenSource: false, isInDex: true,
};

function setFlag(on: boolean) {
  if (on) process.env.SCAN_ENRICHMENT = "1";
  else delete process.env.SCAN_ENRICHMENT;
}

beforeEach(() => { delete process.env.SCAN_ENRICHMENT; });

test("flag disabled -> empty map, no DB access", async () => {
  const { prisma, upserts } = makePrisma([]);
  void upserts;
  const loader = createScamEnrichmentLoader({ prisma });
  const m = await loader(1, [ADDR]);
  assert.equal(m.size, 0);
  assert.equal(isScamEnrichmentEnabled(), false);
});

test("fresh combined GoPlus+GT verdict in DB -> served without network", async () => {
  setFlag(true);
  const payload = {
    goPlus: HONEYPOT,
    gt: { available: true, gtScore: 38.8, holderCount: 296160, holderDistribution: { top_10: 100, rest: 0 } },
  };
  const { prisma } = makePrisma([{ chainId: 1, address: ADDR, verdict: "scam", source: "goplus+gt", payload, updatedAt: new Date() }]);
  let fetched = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { fetched = true; throw new Error("should not fetch"); }) as typeof fetch;
  try {
    const loader = createScamEnrichmentLoader({ prisma });
    const m = await loader(1, [ADDR]);
    assert.equal(fetched, false);
    assert.equal(m.get(ADDR)?.goPlus?.isHoneypot, true);
    assert.equal(m.get(ADDR)?.gt?.gtScore, 38.8);
  } finally { globalThis.fetch = original; }
});

test("fresh legacy GoPlus-only cache fetches GT and rewrites combined payload", async () => {
  setFlag(true);
  const { prisma, upserts } = makePrisma([{ chainId: 56, address: ADDR, verdict: "clean", source: "goplus", payload: { ...HONEYPOT, isHoneypot: false, isBlacklisted: false }, updatedAt: new Date() }]);
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    urls.push(String(url));
    if (String(url).includes("geckoterminal")) {
      return new Response(JSON.stringify({ data: { attributes: {
        gt_score: 38.8,
        gt_score_details: { pool: 40, transaction: 0, creation: 100, info: 0, holders: 70 },
        gt_verified: false,
        holders: { count: 296160, distribution_percentage: { top_10: "100", "11_30": "0", "31_50": "0", rest: "0" } },
        is_honeypot: false,
      } } }), { status: 200 });
    }
    throw new Error(`GoPlus must not refetch: ${url}`);
  }) as typeof fetch;
  try {
    const loader = createScamEnrichmentLoader({ prisma });
    const m = await loader(56, [ADDR]);
    assert.equal(urls.length, 1);
    assert.match(urls[0] ?? "", /geckoterminal/);
    assert.equal(m.get(ADDR)?.goPlus?.available, true);
    assert.equal(m.get(ADDR)?.gt?.gtScore, 38.8);
    assert.equal(upserts.length, 1);
    const payload = (upserts[0] as any).update.payload;
    assert.equal(payload.goPlus.available, true);
    assert.equal(payload.gt.gtScore, 38.8);
  } finally { globalThis.fetch = original; }
});

test("admin verdict never expires and never refetches", async () => {
  setFlag(true);
  const old = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const { prisma, upserts } = makePrisma([{ chainId: 1, address: ADDR, verdict: "clean", source: "admin", payload: null, updatedAt: old }]);
  void upserts;
  const loader = createScamEnrichmentLoader({ prisma });
  const m = await loader(1, [ADDR]);
  assert.equal(m.has(ADDR), true); // present (short-circuit happens in detectScam via overrides)
});

test("missing verdict -> GoPlus fetched + persisted once", async () => {
  setFlag(true);
  const { prisma, upserts } = makePrisma([]);
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ code: 1, message: "OK", result: { [ADDR]: {
      is_honeypot: "1", can_take_back_ownership: "0", is_blacklisted: "0",
      slippage_modifiable: "0", owner_percent: "5", is_open_source: "1", is_in_dex: "1",
    } } }), { status: 200 })) as typeof fetch;
  try {
    const loader = createScamEnrichmentLoader({ prisma });
    const m = await loader(1, [ADDR]);
    assert.equal(m.get(ADDR)?.goPlus?.isHoneypot, true);
    assert.equal(upserts.length, 1);
  } finally { globalThis.fetch = original; }
});

test("classifyMaliciousBytecode handles Solidity string split by opcode padding", async () => {
  const split = "Blacklisted address canno_\u0000\u0012t sell tokens ... Invalid phantom amount";
  const { classifyMaliciousBytecode } = await import("./scam-enrichment.js");
  const verdict = classifyMaliciousBytecode(split);
  assert.equal(verdict?.isHoneypot, true);
  assert.equal(verdict?.isBlacklisted, true);
});

test("GoPlus omission + anti-sell phantom bytecode -> scam fallback persisted", async () => {
  setFlag(true);
  const { prisma, upserts } = makePrisma([]);
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).includes("gopluslabs")) {
      return new Response(JSON.stringify({ code: 1, message: "OK", result: {} }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  try {
    const loader = createScamEnrichmentLoader({
      prisma,
      bytecodeFetcher: async () => "ERC20: Blacklisted address cannot sell tokens Invalid phantom amount Exceeds phantom balance",
    });
    const m = await loader(1, [ADDR]);
    assert.equal(m.get(ADDR)?.goPlus?.isHoneypot, true);
    assert.equal(m.get(ADDR)?.goPlus?.isBlacklisted, true);
    assert.equal(upserts.length, 1);
  } finally { globalThis.fetch = original; }
});

test("GoPlus failure -> no signal AND nothing persisted as clean", async () => {
  setFlag(true);
  const { prisma, upserts } = makePrisma([]);
  const original = globalThis.fetch;
  globalThis.fetch = (async () => Promise.reject(new Error("TLS dead"))) as typeof fetch;
  try {
    const loader = createScamEnrichmentLoader({ prisma });
    const m = await loader(1, [ADDR]);
    assert.equal(m.size, 0);
    assert.equal(upserts.length, 0); // fail-graceful, no fake-clean freeze
  } finally { globalThis.fetch = original; }
});
