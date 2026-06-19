import test from "node:test";
import assert from "node:assert/strict";
import { MemoryCacheStore } from "../cache/memory-cache.js";
import { resolveTokenLogoAsync, resetTokenLogoResolverStateForTests } from "./token-logo-resolver.js";

const H = "0xcf5104d094e3864cfcbda43b82e1cefd26a016eb";

test("resolveTokenLogoAsync returns positive cache before network", async () => {
  resetTokenLogoResolverStateForTests();
  const cache = new MemoryCacheStore();
  await cache.set("logo:ethereum:0xabc", "https://cdn.example/logo.png", 60_000);

  const result = await resolveTokenLogoAsync({
    symbol: "ABC",
    chainKey: "ETHEREUM",
    contract: "0xabc",
    cache,
    fetchImpl: async () => { throw new Error("network should not be called"); },
  });

  assert.equal(result, "https://cdn.example/logo.png");
});

test("resolveTokenLogoAsync ignores blocked coin-images cache and uses Blockscout icon_url", async () => {
  resetTokenLogoResolverStateForTests();
  const cache = new MemoryCacheStore();
  await cache.set("logo:ethereum:" + H, "https://coin-images.coingecko.com/coins/images/1/large/bad.png", 60_000);

  const calls: string[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return new Response(JSON.stringify({ icon_url: "https://assets.coingecko.com/coins/images/66811/small/H_tokenLogo_original.png" }), { status: 200 });
  };

  const result = await resolveTokenLogoAsync({
    symbol: "H",
    chainKey: "ETHEREUM",
    contract: H,
    cache,
    fetchImpl,
  });

  assert.equal(result, "https://assets.coingecko.com/coins/images/66811/small/H_tokenLogo_original.png");
  assert.equal(await cache.get("logo:ethereum:" + H), result);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /api\/v2\/tokens\/0xcf5104/);
});

test("resolveTokenLogoAsync falls back to DexScreener imageUrl when Blockscout misses", async () => {
  resetTokenLogoResolverStateForTests();
  const cache = new MemoryCacheStore();

  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("blockscout")) return new Response(JSON.stringify({}), { status: 200 });
    return new Response(JSON.stringify({ pairs: [{ info: { imageUrl: "https://dd.dexscreener.com/ds-data/tokens/ethereum/0xabc.png" } }] }), { status: 200 });
  };

  const result = await resolveTokenLogoAsync({
    symbol: "ABC",
    chainKey: "ETHEREUM",
    contract: "0xabc",
    cache,
    fetchImpl,
  });

  assert.equal(result, "https://dd.dexscreener.com/ds-data/tokens/ethereum/0xabc.png");
});

test("resolveTokenLogoAsync negative-caches misses and returns fallback", async () => {
  resetTokenLogoResolverStateForTests();
  const cache = new MemoryCacheStore();
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const first = await resolveTokenLogoAsync({ symbol: "NOPE", chainKey: "ETHEREUM", contract: "0x123", cache, fetchImpl });
  const second = await resolveTokenLogoAsync({ symbol: "NOPE", chainKey: "ETHEREUM", contract: "0x123", cache, fetchImpl });

  assert.equal(first, "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x123/logo.png");
  assert.equal(second, first);
  assert.equal(calls, 2, "first call checks Blockscout and DexScreener; second call uses negative cache and no network");
});
