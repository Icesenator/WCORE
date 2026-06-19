// Run: node --import tsx --test packages/core/src/tokens/explorer-discovery.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverTokensFromExplorer, resetBlockscoutExplorerStateForTests } from "./explorer-discovery.js";

const OLD_ENV = { ...process.env };

test.beforeEach(() => {
  process.env = { ...OLD_ENV };
  resetBlockscoutExplorerStateForTests();
});

test.after(() => {
  process.env = OLD_ENV;
});

test("discoverTokensFromExplorer does not call Blockscout when disabled", async () => {
  process.env.BLOCKSCOUT_DISABLE = "1";
  let calls = 0;

  const result = await discoverTokensFromExplorer("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "ETHEREUM", async () => {
    calls++;
    throw new Error("should not fetch");
  });

  assert.equal(calls, 0);
  assert.deepEqual(result.tokens, []);
  assert.deepEqual(result.errors, ["explorer disabled for ETHEREUM"]);
});

test("discoverTokensFromExplorer returns error when no API key", async () => {
  delete process.env.BLOCKSCOUT_API_KEY;
  let calls = 0;

  const result = await discoverTokensFromExplorer("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "ETHEREUM", async () => {
    calls++;
    throw new Error("should not fetch");
  });

  assert.equal(calls, 0);
  assert.deepEqual(result.tokens, []);
  assert.ok(result.errors.some((e) => e.includes("no BLOCKSCOUT_API_KEY")));
});

test("discoverTokensFromExplorer uses Pro API URL with chain_id and apikey", async () => {
  process.env.BLOCKSCOUT_API_KEY = "test-key";
  let capturedUrl: string | undefined;

  const fetchImpl = async (url: string | URL | Request): Promise<Response> => {
    capturedUrl ??= String(url);
    return new Response(JSON.stringify({ status: "1", result: [] }), { status: 200 });
  };

  await discoverTokensFromExplorer("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "ETHEREUM", fetchImpl as typeof fetch);

  assert.ok(capturedUrl?.includes("api.blockscout.com/v2/api"));
  assert.ok(capturedUrl?.includes("chain_id=1"));
  assert.ok(capturedUrl?.includes("apikey=test-key"));
  assert.ok(capturedUrl?.includes("module=account&action=tokenlist"));
});

test("discoverTokensFromExplorer starts cooldown on rate limit", async () => {
  process.env.BLOCKSCOUT_API_KEY = "test-key";
  process.env.BLOCKSCOUT_COOLDOWN_MS = "60000";
  let calls = 0;

  const fetchImpl = async (): Promise<Response> => {
    calls++;
    return new Response("rate limited", { status: 429 });
  };

  const first = await discoverTokensFromExplorer("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "ETHEREUM", fetchImpl as typeof fetch);
  const second = await discoverTokensFromExplorer("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "ETHEREUM", fetchImpl as typeof fetch);

  assert.equal(calls, 1);
  assert.deepEqual(first.tokens, []);
  assert.ok(first.errors.some((error) => error.includes("explorer HTTP 429 for ETHEREUM")));
  assert.deepEqual(second.tokens, []);
  assert.ok(second.errors.some((error) => error.includes("explorer cooldown active for ETHEREUM")));
});

test("discoverTokensFromExplorer parses Pro API response format", async () => {
  process.env.BLOCKSCOUT_API_KEY = "test-key";

  const fetchImpl = async (): Promise<Response> => new Response(JSON.stringify({
    status: "1",
    message: "OK",
    result: [
      {
        contractAddress: "0x1111111111111111111111111111111111111111",
        tokenSymbol: "HINT",
        tokenName: "Hint Token",
        tokenDecimal: "6",
      },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });

  const result = await discoverTokensFromExplorer("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "ETHEREUM", fetchImpl as typeof fetch);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.tokens, [{
    contract: "0x1111111111111111111111111111111111111111",
    symbol: "HINT",
    name: "Hint Token",
    decimals: 6,
    source: "indexer",
    logoUrl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1111111111111111111111111111111111111111/logo.png",
  }]);
});

test("discoverTokensFromExplorer does not fetch token logos on the hot path", async () => {
  process.env.BLOCKSCOUT_API_KEY = "test-key";
  let calls = 0;

  const fetchImpl = async (): Promise<Response> => {
    calls++;
    return new Response(JSON.stringify({
      status: "1",
      message: "OK",
      result: [
        {
          contractAddress: "0x1111111111111111111111111111111111111111",
          tokenSymbol: "HINT",
          tokenName: "Hint Token",
          tokenDecimal: "6",
        },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await discoverTokensFromExplorer("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", fetchImpl as typeof fetch);

  assert.equal(result.tokens.length, 1);
  assert.equal(calls, 1, "only the Blockscout tokenlist request should run synchronously");
});

test("discoverTokensFromExplorer rejects oversized spam-heavy tokenlists", async () => {
  process.env.BLOCKSCOUT_API_KEY = "test-key";
  process.env.BLOCKSCOUT_MAX_TOKENLIST = "2";

  const fetchImpl = async (): Promise<Response> => new Response(JSON.stringify({
    status: "1",
    message: "OK",
    result: [
      { contractAddress: "0x1111111111111111111111111111111111111111", tokenSymbol: "AAA", tokenName: "A", tokenDecimal: "18" },
      { contractAddress: "0x2222222222222222222222222222222222222222", tokenSymbol: "BBB", tokenName: "B", tokenDecimal: "18" },
      { contractAddress: "0x3333333333333333333333333333333333333333", tokenSymbol: "CCC", tokenName: "C", tokenDecimal: "18" },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });

  const result = await discoverTokensFromExplorer("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "BASE", fetchImpl as typeof fetch);

  assert.equal(result.tokens.length, 0);
  assert.ok(result.errors.some((e) => e.includes("explorer tokenlist too large for BASE")));
});

test("discoverTokensFromExplorer returns empty for unknown chain", async () => {
  process.env.BLOCKSCOUT_API_KEY = "test-key";
  let calls = 0;

  const result = await discoverTokensFromExplorer("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "UNKNOWN_CHAIN", async () => {
    calls++;
    throw new Error("should not fetch");
  });

  assert.equal(calls, 0);
  assert.deepEqual(result.tokens, []);
  assert.deepEqual(result.errors, []);
});

test("discoverTokensFromExplorer filters spam tokens", async () => {
  process.env.BLOCKSCOUT_API_KEY = "test-key";

  const fetchImpl = async (): Promise<Response> => new Response(JSON.stringify({
    status: "1",
    result: [
      {
        contractAddress: "0x1111111111111111111111111111111111111111",
        tokenSymbol: "ThisIsASpamTokenWithLongName",
        tokenName: "Definitely Not A Scam",
        tokenDecimal: "18",
      },
      {
        contractAddress: "0x2222222222222222222222222222222222222222",
        tokenSymbol: "REALTOKEN-S-1234567890-Example",
        tokenName: "RealToken Token",
        tokenDecimal: "18",
      },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });

  const result = await discoverTokensFromExplorer("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "ETHEREUM", fetchImpl as typeof fetch);

  assert.equal(result.tokens.length, 1);
  assert.equal(result.tokens[0]!.symbol, "REALTOKEN-S-1234567890-Example");
});
