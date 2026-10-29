import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

import {
  createZerionProvider,
  MAX_IMPLEMENTATIONS_PER_POSITION,
  MAX_VALIDATED_ITEMS,
  ZerionProviderError,
  type CreateZerionProviderOptions,
  type ZerionErrorKind,
} from "./zerion.js";
import { ZERION_MAX_POSITIONS_CAP } from "../../config.js";

const EVM = "0x1234567890abcdef1234567890abcdef12345678";
const SOLANA = "9xQeWvG816bUx9EPjHmaT23yvVMNPoT7hCzY8nZL7QYp";
const TOKEN = "0x1111111111111111111111111111111111111111";
const NOW = Date.parse("2026-07-18T12:00:00.000Z");

function position(id: string, overrides: Record<string, unknown> = {}): any {
  const base = {
    type: "positions",
    id,
    attributes: {
      position_type: "deposit",
      quantity: { float: 2 },
      price: 3,
      value: 6,
      flags: { displayable: true, is_trash: false },
      fungible_info: {
        flags: { verified: true },
        implementations: [{ chain_id: "ethereum", address: TOKEN }],
      },
      protocol_metadata: {
        protocol_module: "lending",
        liquidity: "liquid",
        pool_address: null,
        receipt_contract: null,
        underlying_contract: null,
      },
      group_id: null,
    },
    relationships: {
      chain: { data: { type: "chains", id: "ethereum" } },
      dapp: { data: { type: "dapps", id: "aave-v3" } },
    },
  };
  return { ...base, ...overrides };
}

function envelope(data: unknown[]) {
  return { links: { self: "fixture://zerion", next: null, prev: null }, meta: { total: data.length }, data };
}

function context(maxPositions = 1000) {
  return {
    address: EVM,
    requestedChains: ["ETHEREUM", "BASE"],
    purposes: ["complex-positions", "wallet-hints", "diagnostics"] as const,
    maxPositions,
  };
}

function provider(fetchImpl: typeof fetch, overrides: Partial<CreateZerionProviderOptions> = {}) {
  return createZerionProvider({
    apiKey: "top-secret",
    timeoutMs: 3000,
    maxResponseBytes: 2_000_000,
    maxPositions: 1000,
    fetchImpl,
    now: () => NOW,
    ...overrides,
  });
}

function expectError(kind: ZerionErrorKind, status?: number, retryAfterMs?: number) {
  return (error: unknown) => {
    assert.ok(error instanceof ZerionProviderError);
    assert.equal(error.kind, kind);
    assert.equal(error.status, status);
    assert.equal(error.retryAfterMs, retryAfterMs);
    assert.doesNotMatch(String(error), /top-secret|api\.zerion\.io\/v1\/wallets|upstream body/);
    return true;
  };
}

test("declares one wallet-scoped request and supports only EVM or Solana addresses", () => {
  const subject = provider(async () => new Response(JSON.stringify(envelope([]))));
  assert.deepEqual(subject.capabilities, {
    requestScope: "wallet",
    purposes: ["complex-positions", "wallet-hints", "diagnostics"],
    maxRequests: 1,
  });
  assert.equal(subject.supports(EVM), true);
  assert.equal(subject.supports(SOLANA), true);
  assert.equal(subject.supports("0x1234"), false);
  assert.equal(subject.supports("cosmos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a"), false);
});

test("makes the exact authenticated request without exposing the key in the URL", async () => {
  let calls = 0;
  const subject = provider(async (input, init) => {
    calls += 1;
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, "https://api.zerion.io");
    assert.equal(url.pathname, `/v1/wallets/${encodeURIComponent(EVM)}/positions/`);
    assert.equal(url.search, "?filter%5Bpositions%5D=no_filter&currency=eur&filter%5Btrash%5D=only_non_trash");
    assert.equal(request.headers.get("authorization"), `Basic ${Buffer.from("top-secret:").toString("base64")}`);
    assert.equal(request.url.includes("top-secret"), false);
    return new Response(JSON.stringify(envelope([])));
  });
  await subject.load(context());
  assert.equal(calls, 1);
});

test("normalizes wallet hints, complex positions, debt, and locked liquidity", async () => {
  const wallet = position("wallet");
  wallet.attributes.position_type = "wallet";
  wallet.attributes.protocol_metadata = null;
  wallet.relationships.dapp.data = null;
  const loan = position("loan");
  loan.attributes.position_type = "loan";
  loan.attributes.quantity.float = 4;
  loan.attributes.value = 20;
  const locked = position("locked");
  locked.attributes.position_type = "locked";
  locked.attributes.protocol_metadata!.liquidity = "liquid";
  const snapshot = await provider(async () => new Response(JSON.stringify(envelope([wallet, loan, locked])))).load(context());

  assert.deepEqual(snapshot.walletHints, [{ chain: "ETHEREUM", contract: TOKEN }]);
  assert.equal(snapshot.positions[0]?.type, "lending_debt");
  assert.equal(snapshot.positions[0]?.balance, -4);
  assert.equal(snapshot.positions[0]?.valueEur, -20);
  assert.equal(snapshot.positions[1]?.type, "staking_locked");
  assert.equal(snapshot.positions[1]?.liquidity, "locked");
  assert.equal(snapshot.derivedPositionValueEur, -14);
  assert.equal(snapshot.observedAt, "2026-07-18T12:00:00.000Z");
});

test("drops an entire grouped position when one sibling fails semantic validation", async () => {
  const first = position("lp-a");
  first.attributes.group_id = "lp";
  const second = position("lp-b");
  second.attributes.group_id = "lp";
  second.attributes.protocol_metadata!.pool_address = "invalid";
  const snapshot = await provider(async () => new Response(JSON.stringify(envelope([first, second])))).load(context());
  assert.deepEqual(snapshot.positions, []);
  assert.equal(snapshot.diagnostics.droppedCount, 2);
});

test("fails closed for pagination, count mismatch, unknown envelope fields, and incomplete rows", async () => {
  const valid = envelope([position("one")]);
  const incomplete = structuredClone(valid) as Record<string, unknown> & { data: Array<{ attributes: Record<string, unknown> }> };
  delete incomplete.data[0]!.attributes.value;
  const invalid = [
    { ...valid, links: { ...valid.links, next: "fixture://page-2" } },
    { ...valid, meta: { total: 0 } },
    { ...valid, unexpected: true },
    incomplete,
  ];
  for (const body of invalid) {
    await assert.rejects(
      provider(async () => new Response(JSON.stringify(body))).load(context()),
      expectError("malformed"),
    );
  }
});

test("bounds declared count, received count, normalized count, and response bytes", async () => {
  const rows = Array.from({ length: 3 }, (_, index) => position(String(index)));
  await assert.rejects(
    provider(async () => new Response(JSON.stringify(envelope(rows))), { maxPositions: 2 }).load(context()),
    expectError("oversize"),
  );
  await assert.rejects(
    provider(async () => new Response(JSON.stringify(envelope(rows))), { maxPositions: 3 }).load(context(2)),
    expectError("oversize"),
  );

  // An over-limit array is refused before the schema walks its elements: every
  // invalid element would otherwise allocate a validation issue (GHSA-mrhx-c7xc-m3w5).
  const hostile = { ...envelope([]), meta: { total: 0 }, data: Array.from({ length: 5000 }, (_, index) => index) };
  await assert.rejects(
    provider(async () => new Response(JSON.stringify(hostile)), { maxPositions: 3 }).load(context()),
    expectError("oversize"),
  );

  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(
    provider(async () => new Response(stream, { headers: { "content-length": "101" } }), { maxResponseBytes: 100 }).load(context()),
    expectError("oversize"),
  );
  assert.equal(cancelled, true);
});

test("sanitizes HTTP and network errors and parses bounded Retry-After", async () => {
  for (const [status, kind] of [[400, "malformed-request"], [401, "auth"], [403, "auth"], [418, "http"], [500, "server"]] as const) {
    await assert.rejects(
      provider(async () => new Response("upstream body", { status })).load(context()),
      expectError(kind, status),
    );
  }
  await assert.rejects(
    provider(async () => new Response("", { status: 429, headers: { "retry-after": "999999" } })).load(context()),
    expectError("rate", 429, 600_000),
  );
  let calls = 0;
  await assert.rejects(provider(async () => {
    calls += 1;
    throw new Error("top-secret network details");
  }).load(context()), expectError("network"));
  assert.equal(calls, 1);
});

test("times out before headers and while reading a stalled body", async () => {
  const beforeHeaders = provider((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }), { timeoutMs: 10 });
  await assert.rejects(beforeHeaders.load(context()), expectError("timeout"));

  const stalled = provider(async (_input, init) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"links":'));
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      },
    });
    return new Response(stream);
  }, { timeoutMs: 10 });
  await assert.rejects(stalled.load(context()), expectError("timeout"));
});

function countPositionRowParses() {
  const proto = z.ZodObject.prototype as unknown as { _parse: (input: { data: unknown }) => unknown };
  const original = proto._parse;
  const state = { calls: 0, restore: () => { proto._parse = original; } };
  proto._parse = function (this: unknown, input: { data: unknown }) {
    const data = input?.data as { type?: unknown } | null | undefined;
    if (data && typeof data === "object" && data.type === "positions") state.calls++;
    return original.call(this, input);
  };
  return state;
}

test("rejects more raw rows than maxPositions before validating any row", async () => {
  for (const extra of [1, 2, 3]) {
    const rows = Array.from({ length: 2 + extra }, (_, index) => ({ type: "positions", id: `bad-${index}`, attributes: {}, relationships: {} }));
    const spy = countPositionRowParses();
    try {
      await assert.rejects(
        provider(async () => new Response(JSON.stringify(envelope(rows))), { maxPositions: 2 }).load(context()),
        expectError("oversize"),
      );
    } finally {
      spy.restore();
    }
    assert.equal(spy.calls, 0);
  }
});

test("still validates and accepts exactly maxPositions rows", async () => {
  const rows = Array.from({ length: 2 }, (_, index) => position(String(index)));
  const spy = countPositionRowParses();
  let snapshot;
  try {
    snapshot = await provider(async () => new Response(JSON.stringify(envelope(rows))), { maxPositions: 2 }).load(context());
  } finally {
    spy.restore();
  }
  assert.equal(spy.calls, 2);
  assert.equal(snapshot.positions.length, 2);
});

const IMPLEMENTATIONS_BOUND = MAX_IMPLEMENTATIONS_PER_POSITION;

test("implementations bound stays the documented assumption", () => {
  assert.equal(MAX_IMPLEMENTATIONS_PER_POSITION, 128);
});

function countImplementationParses() {
  const proto = z.ZodObject.prototype as unknown as { _parse: (input: { path?: unknown[] }) => unknown };
  const original = proto._parse;
  const state = { calls: 0, restore: () => { proto._parse = original; } };
  proto._parse = function (this: unknown, input: { path?: unknown[] }) {
    const path = input?.path;
    if (Array.isArray(path) && path[path.length - 2] === "implementations") state.calls++;
    return original.call(this, input);
  };
  return state;
}

function rowWithImplementations(count: number, valid: boolean) {
  const row = position("many-implementations");
  row.attributes.fungible_info.implementations = Array.from({ length: count }, (_, index) => (
    valid
      ? { chain_id: index === 0 ? "ethereum" : `chain-${index}`, address: index === 0 ? TOKEN : `0x${String(index).padStart(40, "0")}` }
      : { bogus: index }
  ));
  return row;
}

test("rejects a row with more implementations than the bound before validating any implementation", async () => {
  for (const extra of [1, 2, 3]) {
    const spy = countImplementationParses();
    try {
      await assert.rejects(
        provider(async () => new Response(JSON.stringify(envelope([rowWithImplementations(IMPLEMENTATIONS_BOUND + extra, false)])))).load(context()),
        expectError("oversize"),
      );
    } finally {
      spy.restore();
    }
    assert.equal(spy.calls, 0);
  }
});

test("accepts a row with exactly the implementations bound", async () => {
  const spy = countImplementationParses();
  let snapshot;
  try {
    snapshot = await provider(async () => new Response(JSON.stringify(envelope([rowWithImplementations(IMPLEMENTATIONS_BOUND, true)])))).load(context());
  } finally {
    spy.restore();
  }
  assert.equal(spy.calls, IMPLEMENTATIONS_BOUND);
  assert.equal(snapshot.positions.length, 1);
  assert.equal(snapshot.positions[0]?.contract, TOKEN);
});

// The aggregate cap must hold on its own, even for a provider built with a larger maxPositions.
function compactBody(rows: number, implementationsPerRow: number): string {
  const implementations = `[${Array.from({ length: implementationsPerRow }, () => "0").join(",")}]`;
  const row = `{"type":"positions","id":"r","attributes":{"fungible_info":{"implementations":${implementations}}}}`;
  return `{"links":{"self":"x","next":null,"prev":null},"meta":{"total":${rows}},"data":[${Array.from({ length: rows }, () => row).join(",")}]}`;
}

async function loadCountingObjectParses(text: string, maxPositions: number) {
  const proto = z.ZodObject.prototype as unknown as { _parse: (input: unknown) => unknown };
  const original = proto._parse;
  let calls = 0;
  proto._parse = function (this: unknown, input: unknown) { calls++; return original.call(this, input); };
  try {
    await provider(async () => new Response(text), { maxPositions }).load(context(maxPositions));
    return { kind: "ok", calls };
  } catch (error) {
    return { kind: (error as ZerionProviderError).kind, calls };
  } finally {
    proto._parse = original;
  }
}

test("aggregate validation cap equals the default contract (1000 rows x (1 + 128))", () => {
  assert.equal(MAX_VALIDATED_ITEMS, 1000 * (1 + MAX_IMPLEMENTATIONS_PER_POSITION));
});

test("aggregate validation cap covers the configured ZERION_MAX_POSITIONS ceiling", () => {
  assert.equal(ZERION_MAX_POSITIONS_CAP, 1000);
  assert.equal(MAX_VALIDATED_ITEMS, 129_000);
  assert.ok(MAX_VALIDATED_ITEMS >= ZERION_MAX_POSITIONS_CAP * (1 + MAX_IMPLEMENTATIONS_PER_POSITION));
});

test("rejects rows plus implementations above the aggregate cap before any Zod validation", async () => {
  const text = compactBody(1001, IMPLEMENTATIONS_BOUND);
  assert.ok(text.length < 2_000_000);
  assert.deepEqual(await loadCountingObjectParses(text, 5000), { kind: "oversize", calls: 0 });
});

test("rejects an extreme maxPositions row count above the aggregate cap before any Zod validation", async () => {
  const rows = MAX_VALIDATED_ITEMS + 1;
  const text = `{"links":{"self":"x","next":null,"prev":null},"meta":{"total":${rows}},"data":[${Array.from({ length: rows }, () => "0").join(",")}]}`;
  assert.ok(text.length < 2_000_000);
  assert.deepEqual(await loadCountingObjectParses(text, 200_000), { kind: "oversize", calls: 0 });
});

test("still validates a payload exactly at the aggregate cap", async () => {
  const result = await loadCountingObjectParses(compactBody(1000, IMPLEMENTATIONS_BOUND), 5000);
  assert.equal(result.kind, "malformed");
  assert.ok(result.calls > 0);
});
