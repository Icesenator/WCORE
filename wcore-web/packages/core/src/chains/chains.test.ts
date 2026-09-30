import test from "node:test";
import assert from "node:assert/strict";
import { GM_FACTORIES, RUNTIME_CHAIN_CONFIG_SCHEMA } from "@wcore/shared";
import { chainList, getChain } from "./index.js";

test("every published chain satisfies the runtime schema", () => {
  const failures = chainList.flatMap((chain) => {
    const result = RUNTIME_CHAIN_CONFIG_SCHEMA.safeParse(chain);
    return result.success
      ? []
      : [`${chain.key}: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`];
  });

  assert.equal(chainList.length, 160, "registry count changed: update the verified roadmaps with the same commit");

  assert.equal(new Set(chainList.map((chain) => chain.key)).size, chainList.length, "chain keys must be unique");
  assert.deepEqual(failures, []);
});

test("runtime schema rejects corrupt published metadata", () => {
  const ethereum = getChain("ETHEREUM");
  assert.ok(ethereum);

  const missingChainId = structuredClone(ethereum);
  delete missingChainId.CHAIN?.CHAIN_ID;
  assert.equal(RUNTIME_CHAIN_CONFIG_SCHEMA.safeParse(missingChainId).success, false);

  const invalidRpc = structuredClone(ethereum);
  invalidRpc.RPC = { ...invalidRpc.RPC, ENDPOINTS: ["not-a-url"] };
  assert.equal(RUNTIME_CHAIN_CONFIG_SCHEMA.safeParse(invalidRpc).success, false);

  const missingNativeSymbol = structuredClone(ethereum);
  missingNativeSymbol.CHAIN = { ...missingNativeSymbol.CHAIN, NATIVE_SYMBOL: "" };
  assert.equal(RUNTIME_CHAIN_CONFIG_SCHEMA.safeParse(missingNativeSymbol).success, false);
});

test("Nexus Mainnet is registered with verified RPC metadata", () => {
  const chain = getChain("NEXUS");

  assert.ok(chain, "NEXUS chain should be registered");
  assert.equal(chain.vm, "EVM");
  assert.equal(chain.CHAIN?.NAME, "Nexus Mainnet");
  assert.equal(chain.CHAIN?.CHAIN_ID, 3946);
  assert.equal(chain.CHAIN?.NATIVE_SYMBOL, "NEX");
  assert.equal(chain.CHAIN?.NATIVE_DECIMALS, 18);
  assert.deepEqual(chain.RPC?.ENDPOINTS, ["https://mainnet.rpc.nexus.xyz/"]);
});

test("Abstract native ETH pricing uses the Ethereum oracle ids", () => {
  const chain = getChain("ABSTRACT");

  assert.ok(chain, "ABSTRACT chain should be registered");
  assert.equal(chain.CHAIN?.NATIVE_SYMBOL, "ETH");
  assert.equal(chain.CHAIN?.NATIVE_LLAMA_ID, "coingecko:ethereum");
  assert.equal(chain.CHAIN?.NATIVE_GECKO_ID, "ethereum");
});

test("Robinhood Chain is registered with verified mainnet metadata", () => {
  const chain = getChain("ROBINHOOD_CHAIN");

  assert.ok(chain, "ROBINHOOD_CHAIN should be registered");
  assert.equal(chain.vm, "EVM");
  assert.equal(chain.CHAIN?.NAME, "Robinhood Chain");
  assert.equal(chain.CHAIN?.CHAIN_ID, 4663);
  assert.equal(chain.CHAIN?.NATIVE_SYMBOL, "ETH");
  assert.equal(chain.CHAIN?.NATIVE_LLAMA_ID, "coingecko:ethereum");
  assert.equal(chain.CHAIN?.NATIVE_GECKO_ID, "ethereum");
  assert.deepEqual(chain.RPC?.ENDPOINTS, ["https://rpc.mainnet.chain.robinhood.com"]);
});

test("Arc is registered with native USDC and the ERC-20 interface excluded", () => {
  const chain = getChain("ARC");

  assert.ok(chain, "ARC chain should be registered");
  assert.equal(chain.vm, "EVM");
  assert.equal(chain.CHAIN?.NAME, "Arc");
  assert.equal(chain.CHAIN?.CHAIN_ID, 5042);
  // USDC is the native gas token on Arc (18 decimals), not ETH.
  assert.equal(chain.CHAIN?.NATIVE_SYMBOL, "USDC");
  assert.equal(chain.CHAIN?.NATIVE_DECIMALS, 18);
  assert.equal(chain.CHAIN?.NATIVE_LLAMA_ID, "coingecko:usd-coin");
  assert.equal(chain.CHAIN?.NATIVE_GECKO_ID, "usd-coin");
  // The 6-dec ERC-20 USDC interface shares the native balance and the EIP-7708
  // system emitter logs native transfers: both would double-count USDC.
  assert.deepEqual(chain.FLAGS?.EXCLUDE_CONTRACTS, [
    "0x3600000000000000000000000000000000000000",
    "0xfffffffffffffffffffffffffffffffffffffffe",
  ]);
});

test("Somnia keeps the chainId its RPC endpoints actually serve", () => {
  const chain = getChain("SOMNIA");

  assert.ok(chain, "SOMNIA chain should be registered");
  // Every configured endpoint answers eth_chainId with 0x13a7. The config held
  // 50311 twice in the project history, which silently failed each chainId
  // consensus check while the chain itself was live.
  assert.equal(chain.CHAIN?.CHAIN_ID, 5031);
});

test("Degen prefers the measured public Alchemy gateway", () => {
  const chain = getChain("DEGEN");

  assert.ok(chain, "DEGEN chain should be registered");
  assert.equal(chain.CHAIN?.CHAIN_ID, 666666666);
  assert.equal(chain.RPC?.MAX_LOG_RANGE, 99);
  assert.deepEqual(chain.RPC?.ENDPOINTS, [
    "https://degen-mainnet.g.alchemy.com/public",
    "https://rpc.degen.tips",
  ]);
});

test("all active GM chains have native pricing oracle ids", () => {
  const missing = Object.keys(GM_FACTORIES)
    .sort()
    .filter((key) => {
      const chain = getChain(key.toUpperCase());
      return !chain || chain.FLAGS?.DISABLE_CHAIN === true || !chain.CHAIN?.NATIVE_SYMBOL || !chain.CHAIN.NATIVE_LLAMA_ID || !chain.CHAIN.NATIVE_GECKO_ID;
    });

  assert.deepEqual(missing, []);
});
