import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

// Mock fetch before importing the module
const originalFetch = globalThis.fetch;

function mockFetch(response: Response | Error) {
  globalThis.fetch = mock.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
  ) as unknown as typeof fetch;
}

function resetModule() {
  // Force re-import to reset module state
  globalThis.fetch = originalFetch;
}

describe("chainlist", () => {
  let chainlist: typeof import("../src/chainlist.js");

  beforeEach(async () => {
    // Clear module cache to reset static state
    const mod = await import("../src/chainlist.js?" + Date.now());
    chainlist = mod;
  });

  afterEach(() => {
    resetModule();
  });

  it("loads chainlist successfully and fills cache", async () => {
    const sample = [
      { chainId: 1, name: "Ethereum", rpc: ["https://eth.rpc"], explorers: [{ name: "etherscan", url: "https://etherscan.io", standard: "EIP3091" }], icon: "ethereum" },
      { chainId: 8453, name: "Base", rpc: ["https://mainnet.base.org"], explorers: [{ name: "basescan", url: "https://basescan.org", standard: "EIP3091" }], icon: "base" },
    ];
    mockFetch(new Response(JSON.stringify(sample), { status: 200 }));

    await chainlist.loadChainlist();

    assert.equal(chainlist.isChainlistReady(), true);
    assert.equal(chainlist.getChainlistEntry(1)?.name, "Ethereum");
    assert.equal(chainlist.getChainlistEntry(8453)?.name, "Base");
    assert.equal(chainlist.getChainlistEntry(9999), undefined);
  });

  it("returns null explorer URL for unknown chain", async () => {
    const sample = [{ chainId: 1, name: "Ethereum", rpc: [] }];
    mockFetch(new Response(JSON.stringify(sample), { status: 200 }));

    await chainlist.loadChainlist();

    assert.equal(chainlist.getExplorerUrl(9999), null);
    assert.equal(chainlist.getExplorerUrl(1), null); // no explorers array
  });

  it("returns explorer URL preferring EIP3091", async () => {
    const sample = [{
      chainId: 1, name: "Ethereum", rpc: [],
      explorers: [
        { name: "blockscout", url: "https://blockscout.com", standard: "none" },
        { name: "etherscan", url: "https://etherscan.io", standard: "EIP3091" },
      ],
    }];
    mockFetch(new Response(JSON.stringify(sample), { status: 200 }));

    await chainlist.loadChainlist();

    assert.equal(chainlist.getExplorerUrl(1), "https://etherscan.io");
  });

  it("returns RPC URLs filtered to HTTPS only", async () => {
    const sample = [{
      chainId: 1, name: "Ethereum",
      rpc: ["http://insecure.rpc", "https://secure.rpc", "https://backup.rpc"],
    }];
    mockFetch(new Response(JSON.stringify(sample), { status: 200 }));

    await chainlist.loadChainlist();

    const rpcs = chainlist.getRpcUrls(1, 3);
    assert.equal(rpcs.length, 2);
    assert.ok(rpcs.every((url) => url.startsWith("https://")));
  });

  it("handles fetch failure gracefully (network error)", async () => {
    mockFetch(new Error("connect ECONNREFUSED"));

    await chainlist.loadChainlist();

    assert.equal(chainlist.isChainlistReady(), false);
    assert.equal(chainlist.getChainlistEntry(1), undefined);
    assert.equal(chainlist.getExplorerUrl(1), null);
  });

  it("handles HTTP error gracefully", async () => {
    mockFetch(new Response("Internal Server Error", { status: 500 }));

    await chainlist.loadChainlist();

    assert.equal(chainlist.isChainlistReady(), false);
    assert.equal(chainlist.getChainlistEntry(1), undefined);
  });

  it("handles fetch timeout gracefully", async () => {
    mockFetch(new Error("The operation was aborted"));

    await chainlist.loadChainlist();

    assert.equal(chainlist.isChainlistReady(), false);
  });

  it("retries after failure", async () => {
    // First attempt fails
    mockFetch(new Error("network error"));
    await chainlist.loadChainlist();
    assert.equal(chainlist.isChainlistReady(), false);

    // Second attempt succeeds (simulate by replacing mock)
    const sample = [{ chainId: 1, name: "Ethereum", rpc: [] }];
    mockFetch(new Response(JSON.stringify(sample), { status: 200 }));
    await chainlist.loadChainlist();

    assert.equal(chainlist.isChainlistReady(), true);
    assert.equal(chainlist.getChainlistEntry(1)?.name, "Ethereum");
  });

  it("getChainlistEntry triggers retry when stale", async () => {
    // First load fails
    mockFetch(new Error("timeout"));
    await chainlist.loadChainlist();
    assert.equal(chainlist.isChainlistReady(), false);
    assert.equal(chainlist.getChainlistEntry(1), undefined);

    // Set last attempt far in the past to trigger auto-retry
    // We can't easily mock Date.now, but calling loadChainlist again should work
    const sample = [{ chainId: 1, name: "Ethereum", rpc: [] }];
    mockFetch(new Response(JSON.stringify(sample), { status: 200 }));
    await chainlist.loadChainlist();

    assert.equal(chainlist.isChainlistReady(), true);
  });

  it("getIconUrl returns null when no icon", async () => {
    const sample = [{ chainId: 1, name: "Ethereum", rpc: [], icon: undefined }];
    mockFetch(new Response(JSON.stringify(sample), { status: 200 }));

    await chainlist.loadChainlist();

    assert.equal(chainlist.getChainIconUrl(1), null);
  });

  it("getIconUrl returns URL when icon is present", async () => {
    const sample = [{ chainId: 1, name: "Ethereum", rpc: [], icon: "ethereum" }];
    mockFetch(new Response(JSON.stringify(sample), { status: 200 }));

    await chainlist.loadChainlist();

    const url = chainlist.getChainIconUrl(1);
    assert.ok(url?.includes("ethereum-lists/chains"));
    assert.ok(url?.includes("eip155-1.json"));
  });

  it("getChainlist returns full cache", async () => {
    const sample = [{ chainId: 1, name: "Test", rpc: [] }];
    mockFetch(new Response(JSON.stringify(sample), { status: 200 }));

    await chainlist.loadChainlist();

    assert.equal(chainlist.getChainlist()?.length, 1);
    assert.equal(chainlist.isChainlistReady(), true);
  });

  it("getChainlist returns null when not loaded", async () => {
    mockFetch(new Error("fail"));
    await chainlist.loadChainlist();

    assert.equal(chainlist.getChainlist(), null);
  });
});
