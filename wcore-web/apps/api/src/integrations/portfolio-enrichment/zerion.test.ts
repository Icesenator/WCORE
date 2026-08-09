import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createZerionProvider,
  ZerionProviderError,
  type CreateZerionProviderOptions,
  type ZerionErrorKind,
} from "./zerion.js";

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
