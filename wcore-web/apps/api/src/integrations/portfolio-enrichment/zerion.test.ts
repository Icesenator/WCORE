import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createZerionProvider, type ZerionProviderError } from "./zerion.js";

const EVM = "0x1234567890abcdef1234567890abcdef12345678";
const SOLANA = "9xQeWvG816bUx9EPjHmaT23yvVMNPoT7hCzY8nZL7QYp";
const NOW = Date.parse("2026-07-18T12:00:00.000Z");
const fixture = JSON.parse(
  await readFile(fileURLToPath(new URL("./fixtures/zerion-positions.json", import.meta.url)), "utf8"),
);
const untracked = JSON.parse(
  await readFile(fileURLToPath(new URL("./fixtures/zerion-untracked.json", import.meta.url)), "utf8"),
);

function asFetch(impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>): typeof fetch {
  return impl as typeof fetch;
}

function provider(
  fetchImpl: typeof fetch,
  overrides: Partial<{ timeoutMs: number; maxResponseBytes: number; maxPositions: number }> = {},
) {
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

function context(maxPositions = 1000) {
  return {
    address: EVM,
    requestedChains: ["ETHEREUM", "BASE"],
    purposes: ["complex-positions", "wallet-hints", "diagnostics"] as const,
    maxPositions,
  };
}

function errorKind(kind: ZerionProviderError["kind"], status?: number, retryAfterMs?: number) {
  return (error: unknown) => {
    const actual = error as ZerionProviderError;
    assert.equal(actual.kind, kind);
    assert.equal(actual.status, status);
    assert.equal(actual.retryAfterMs, retryAfterMs);
    assert.deepEqual(Object.keys(actual).sort(), ["kind", "name", "retryAfterMs", "status"].sort());
    assert.doesNotMatch(String(error), /top-secret|api\.zerion\.io\/v1\/wallets/);
    return true;
  };
}

test("declares the approved provider contract and supports only valid EVM or Solana addresses", () => {
  const subject = provider(asFetch(async () => new Response(JSON.stringify(fixture))));
  assert.equal(subject.id, "zerion");
  assert.deepEqual(subject.capabilities, {
    requestScope: "wallet",
    purposes: ["complex-positions", "wallet-hints", "diagnostics"],
    maxRequests: 1,
  });
  assert.equal(subject.supports(EVM), true);
  assert.equal(subject.supports(SOLANA), true);
  assert.equal(subject.supports("cosmos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnrql8a"), false);
  assert.equal(subject.supports("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), false);
  assert.equal(subject.supports("0x1234"), false);
});

test("makes one exact authenticated request without putting the key in the URL", async () => {
  let calls = 0;
  const subject = provider(asFetch(async (input, init) => {
    calls++;
    const request = new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, "https://api.zerion.io");
    assert.equal(url.pathname, `/v1/wallets/${encodeURIComponent(EVM)}/positions/`);
    assert.equal(url.search, "?filter%5Bpositions%5D=no_filter&currency=eur&filter%5Btrash%5D=only_non_trash");
    assert.equal(request.method, "GET");
    assert.equal(request.headers.get("authorization"), `Basic ${Buffer.from("top-secret:").toString("base64")}`);
    assert.equal(request.url.includes("top-secret"), false);
    return new Response(JSON.stringify(fixture), { headers: { "content-type": "application/json" } });
  }));

  await subject.load(context());
  assert.equal(calls, 1);
});

test("partitions wallet hints and maps every complex position type", async () => {
  const snapshot = await provider(asFetch(async () => new Response(JSON.stringify(fixture)))).load(context());
  assert.deepEqual(snapshot.walletHints, [
    { chain: "ETHEREUM", contract: "0x1111111111111111111111111111111111111111" },
    { chain: "SOLANA", contract: "So11111111111111111111111111111111111111112" },
  ]);
  const byId = new Map(snapshot.positions.map((position) => [position.positionId, position]));
  assert.equal(byId.get("deposit-aave")?.type, "collateral");
  assert.equal(byId.get("deposit-vault")?.type, "vault_share");
  assert.equal(byId.get("loan")?.type, "lending_debt");
  assert.equal(byId.get("locked")?.type, "staking_locked");
  assert.equal(byId.get("staked")?.type, "staking_liquid");
  assert.equal(byId.get("reward")?.type, "claimable");
  assert.equal(byId.get("investment")?.type, "real_world_asset");
  assert.equal(byId.get("lp-good-a")?.type, "unknown_defi");
  assert.equal(byId.get("contractless")?.contract, undefined);
  assert.equal(byId.get("contractless")?.positionId, "contractless");
  assert.equal(byId.get("deposit-aave")?.protocol, "aave-v3");
  assert.equal(byId.get("deposit-aave")?.receiptContract, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.ok(snapshot.positions.every((position) => position.providerVerified));
  assert.equal(snapshot.observedAt, "2026-07-18T12:00:00.000Z");
});

test("normalizes debt as negative and retains valid grouped LP components", async () => {
  const snapshot = await provider(asFetch(async () => new Response(JSON.stringify(fixture)))).load(context());
  const debt = snapshot.positions.find((position) => position.positionId === "loan")!;
  assert.equal(debt.balance, -4);
  assert.equal(debt.valueEur, -20);
  const lp = snapshot.positions.filter((position) => position.groupId === "lp-good");
  assert.equal(lp.length, 2);
  assert.ok(lp.every((position) => position.poolAddress === "0xcccccccccccccccccccccccccccccccccccccccc"));
});

test("drops hidden, trash, unknown-chain, native wallet, invalid, unverified, and whole mixed LP groups", async () => {
  const snapshot = await provider(asFetch(async () => new Response(JSON.stringify(fixture)))).load(context());
  const ids = new Set(snapshot.positions.map((position) => position.positionId));
  for (const id of ["hidden", "trash", "unknown-chain", "invalid-contract", "invalid-quantity", "unverified", "lp-mixed-a", "lp-mixed-b", "native-wallet"]) {
    assert.equal(ids.has(id), false, id);
  }
  assert.deepEqual(snapshot.diagnostics, {
    status: "ok",
    rawCount: 21,
    normalizedCount: 10,
    walletHintCount: 2,
    droppedCount: 9,
  });
  assert.equal(snapshot.derivedPositionValueEur, 69);
});

test("accepts a structurally valid empty snapshot", async () => {
  const empty = { links: { self: "fixture://empty", next: null, prev: null }, meta: { total: 0 }, data: [] };
  const snapshot = await provider(asFetch(async () => new Response(JSON.stringify(empty)))).load(context());
  assert.deepEqual(snapshot.positions, []);
  assert.deepEqual(snapshot.walletHints, []);
  assert.equal(snapshot.derivedPositionValueEur, 0);
});

test("times out before response headers", async () => {
  const subject = provider(asFetch((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })), { timeoutMs: 10 });
  await assert.rejects(subject.load(context()), errorKind("timeout"));
});

test("times out while a streamed response body stalls", async () => {
  const subject = provider(asFetch(async (_input, init) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"links":'));
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      },
    });
    return new Response(stream);
  }), { timeoutMs: 10 });
  await assert.rejects(subject.load(context()), errorKind("timeout"));
});

test("rejects Content-Length overflow before reading the body", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const subject = provider(asFetch(async () => new Response(stream, { headers: { "content-length": "101" } })), { maxResponseBytes: 100 });
  await assert.rejects(subject.load(context()), errorKind("oversize"));
  assert.equal(cancelled, true);
});

test("aborts a chunked body immediately when its byte cap is exceeded", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(60));
      controller.enqueue(new Uint8Array(60));
    },
    cancel() { cancelled = true; },
  });
  const subject = provider(asFetch(async () => new Response(stream)), { maxResponseBytes: 100 });
  await assert.rejects(subject.load(context()), errorKind("oversize"));
  assert.equal(cancelled, true);
});

test("rejects malformed JSON and structurally incomplete JSON:API snapshots wholly", async () => {
  const malformed = provider(asFetch(async () => new Response("{")));
  await assert.rejects(malformed.load(context()), errorKind("malformed"));
  const incomplete = provider(asFetch(async () => new Response(JSON.stringify({ data: fixture.data }))));
  await assert.rejects(incomplete.load(context()), errorKind("malformed"));
  const incompletePosition = structuredClone(fixture);
  delete incompletePosition.data[1].attributes.value;
  const partial = provider(asFetch(async () => new Response(JSON.stringify(incompletePosition))));
  await assert.rejects(partial.load(context()), errorKind("malformed"));
});

test("rejects snapshots with more than 1,000 raw positions", async () => {
  const data = Array.from({ length: 1001 }, (_, index) => ({ ...fixture.data[1], id: `raw-${index}` }));
  const oversized = { ...fixture, meta: { total: data.length }, data };
  const subject = provider(asFetch(async () => new Response(JSON.stringify(oversized))));
  await assert.rejects(subject.load(context()), errorKind("oversize"));
});

test("rejects snapshots with more than 1,000 normalized positions", async () => {
  const data = Array.from({ length: 1001 }, (_, index) => ({ ...fixture.data[1], id: `normalized-${index}` }));
  const oversized = { ...fixture, meta: { total: data.length }, data };
  const subject = provider(asFetch(async () => new Response(JSON.stringify(oversized))), { maxPositions: 1100 });
  await assert.rejects(subject.load(context(1000)), errorKind("oversize"));
});

test("allowlists only the exact synthetic untracked 400 error for a locally valid address", async () => {
  const subject = provider(asFetch(async () => new Response(JSON.stringify(untracked), { status: 400 })));
  await assert.rejects(subject.load(context()), errorKind("untracked-candidate", 400));
});

test("treats a changed 400 payload as a malformed request failure", async () => {
  const changed = { errors: [{ title: "Wallet not found", detail: "wording changed" }] };
  const subject = provider(asFetch(async () => new Response(JSON.stringify(changed), { status: 400 })));
  await assert.rejects(subject.load(context()), errorKind("malformed-request", 400));
});

test("sanitizes auth, rate, and server HTTP errors", async (t) => {
  for (const [status, kind] of [[401, "auth"], [403, "auth"], [429, "rate"], [503, "server"]] as const) {
    await t.test(String(status), async () => {
      const subject = provider(asFetch(async () => new Response("secret upstream text", { status })));
      await assert.rejects(subject.load(context()), errorKind(kind, status));
    });
  }
});

test("parses Retry-After seconds and dates only for 429/503 and caps them at ten minutes", async () => {
  const seconds = provider(asFetch(async () => new Response("", { status: 429, headers: { "retry-after": "12" } })));
  await assert.rejects(seconds.load(context()), errorKind("rate", 429, 12_000));
  const date = new Date(NOW + 30_000).toUTCString();
  const dated = provider(asFetch(async () => new Response("", { status: 503, headers: { "retry-after": date } })));
  await assert.rejects(dated.load(context()), errorKind("server", 503, 30_000));
  const bounded = provider(asFetch(async () => new Response("", { status: 429, headers: { "retry-after": "999999" } })));
  await assert.rejects(bounded.load(context()), errorKind("rate", 429, 600_000));
  const ignored = provider(asFetch(async () => new Response("", { status: 500, headers: { "retry-after": "12" } })));
  await assert.rejects(ignored.load(context()), errorKind("server", 500));
});

test("sanitizes fetch failures and never retries", async () => {
  let calls = 0;
  const subject = provider(asFetch(async () => { calls++; throw new Error("top-secret raw network failure"); }));
  await assert.rejects(subject.load(context()), errorKind("network"));
  assert.equal(calls, 1);
});
