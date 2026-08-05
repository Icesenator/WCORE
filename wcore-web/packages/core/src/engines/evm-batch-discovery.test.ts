import { test } from "node:test";
import assert from "node:assert/strict";
import { getEvmWalletsAssets } from "./evm-batch.js";

/**
 * Each wallet's discovery issues up to LOG_CHUNK_CONCURRENCY log calls per transfer
 * topic, so running every wallet at once put ten times the wallet count of concurrent
 * eth_getLogs on one endpoint pool. A twenty-address batch meant two hundred, which
 * free-tier RPCs answer with rate limits rather than data.
 */
test("a wide batch does not run every wallet's discovery at once", async () => {
  const addresses = Array.from({ length: 12 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);

  let inFlight = 0;
  let peak = 0;
  const seen = new Set<string>();

  const tokenDiscovery = {
    discoverTokensForWallet: async (addr: string) => {
      seen.add(addr.toLowerCase());
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return { tokens: [], errors: [] };
    },
  };

  const fetchImpl = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: "0x0" }),
  })) as unknown as typeof fetch;

  await getEvmWalletsAssets(addresses, "ETHEREUM", {
    fetchImpl,
    fxRate: 1,
    tokenDiscovery: tokenDiscovery as never,
  });

  assert.equal(seen.size, addresses.length, "every wallet must still be discovered");
  assert.ok(peak > 1, `the batch must keep some parallelism, peak was ${peak}`);
  assert.ok(
    peak <= 3,
    `discovery must stay bounded whatever the batch size, peak was ${peak} of ${addresses.length}`,
  );
});
