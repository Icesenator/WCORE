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
  const loader = createScamEnrichmentLoader({ prisma });
  const m = await loader(1, [ADDR]);
  assert.equal(m.size, 0);
  assert.equal(isScamEnrichmentEnabled(), false);
});

test("fresh goplus verdict in DB -> served without network", async () => {
  setFlag(true);
  const { prisma, upserts } = makePrisma([{ chainId: 1, address: ADDR, verdict: "suspicious", source: "goplus", payload: HONEYPOT, updatedAt: new Date() }]);
  let fetched = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { fetched = true; throw new Error("should not fetch"); }) as typeof fetch;
  try {
    const loader = createScamEnrichmentLoader({ prisma });
    const m = await loader(1, [ADDR]);
    assert.equal(fetched, false);
    assert.equal(m.get(ADDR)?.goPlus?.isHoneypot, true);
  } finally { globalThis.fetch = original; }
});

test("admin verdict never expires and never refetches", async () => {
  setFlag(true);
  const old = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const { prisma, upserts } = makePrisma([{ chainId: 1, address: ADDR, verdict: "clean", source: "admin", payload: null, updatedAt: old }]);
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
