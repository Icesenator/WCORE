import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { fetchBatchScan, MAX_BATCH_ADDRESSES } from "../lib/scan-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("scan API batching", () => {
  test("splits server requests at 20 addresses and fuses wallet responses", async () => {
    const requestSizes: number[] = [];
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { addresses: string[] };
      requestSizes.push(body.addresses.length);
      return Response.json({
        wallets: body.addresses.map(address => ({ address, chains: [], totals: { valueEur: 0, tokenCount: 0 } })),
      });
    };
    const addresses = Array.from({ length: 45 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);

    const result = await fetchBatchScan(addresses, ["BASE"], false);

    assert.equal(MAX_BATCH_ADDRESSES, 20);
    assert.deepEqual(requestSizes, [20, 20, 5]);
    assert.equal(result.wallets?.length, 45);
    assert.deepEqual(result.wallets?.map(wallet => wallet.address), addresses);
  });

  test("aborting during retry backoff prevents another request", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ error: "temporary" }, { status: 503 });
    };
    const controller = new AbortController();
    const pending = fetchBatchScan([`0x${"1".repeat(40)}`], ["BASE"], false, [], false, controller.signal);
    setTimeout(() => controller.abort(), 10);

    await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
    assert.equal(calls, 1);
  });
});
