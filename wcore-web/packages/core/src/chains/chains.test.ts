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

  assert.equal(chainList.length, 158, "registry count changed: update the verified roadmaps with the same commit");

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

test("Elysium is Kinetiq's mainnet (99901), with HYPE priced like HyperEVM", () => {
  const chain = getChain("ELYSIUM");

  assert.ok(chain, "ELYSIUM chain should be registered");
  assert.equal(chain.vm, "EVM");
  assert.equal(chain.CHAIN?.NAME, "Elysium");
  assert.equal(chain.CHAIN?.CHAIN_ID, 99901);
  // Never Kinetiq's testnet (99801) nor Vulcan Forged's Elysium (1339, LAVA).
  assert.notEqual(chain.CHAIN?.CHAIN_ID, 99801);
  assert.notEqual(chain.CHAIN?.CHAIN_ID, 1339);
  assert.equal(chain.CHAIN?.NATIVE_SYMBOL, "HYPE");
  assert.equal(chain.CHAIN?.NATIVE_DECIMALS, 18);
  assert.deepEqual(chain.RPC?.ENDPOINTS, ["https://rpc.elysium.kinetiq.xyz"]);
  assert.equal(chain.CHAIN?.NATIVE_LLAMA_ID, getChain("HYPEREVM")?.CHAIN?.NATIVE_LLAMA_ID);
  assert.equal(chain.CHAIN?.NATIVE_GECKO_ID, "hyperliquid");
  assert.equal(chain.CHAIN?.DEX_SLUG, "elysium");
  assert.equal(chain.RPC?.MAX_LOG_RANGE, undefined);
  assert.equal(chain.RPC?.MIN_LOG_SCAN_BLOCKS, 500000);
  assert.ok((chain.RPC?.LOG_CHUNK_BLOCKS as number) > (chain.RPC?.MIN_LOG_SCAN_BLOCKS as number), "one eth_getLogs call per direction: the RPC rate-limits 100 chunked calls");
  assert.equal(chainList.some((c) => c.CHAIN?.CHAIN_ID === 1339 || c.CHAIN?.CHAIN_ID === 99801), false);
});

test("Lisk L2 (1135) stays in the registry so Chain Sentinel can still show held exposure", () => {
  // The network is shut down and the GAS tombstone stops every Sheets scan, but Chain Sentinel
  // reads exposure through this registry: removing Lisk here would turn a held claim
  // (manual claims announced for January 2027) into NOT_COVERED. Same treatment as Gravity.
  assert.equal(getChain("LISK")?.CHAIN?.CHAIN_ID, 1135);
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

test("chains retired on 2026-09-30 stay out of the registry", () => {
  // Dead networks, recorded in wcore-gsheet/docs/chains-retirees.md. This replaced
  // a check of the DEGEN endpoints, which no longer exist since its sunset.
  for (const key of ["BOTANIX", "DEGEN", "DUCKCHAIN", "SUPERPOSITION", "RACE"]) {
    assert.equal(getChain(key), undefined, `${key} is retired and must not be scanned`);
  }
});

test("retired Degen, Superposition and Superseed remain absent from the active registry and GM factories", () => {
  for (const key of ["DEGEN", "SUPERPOSITION", "SUPERSEED"]) {
    assert.equal(getChain(key), undefined, `${key} must not be restored to make GM eligible`);
    assert.equal(GM_FACTORIES[key.toLowerCase()], undefined, `${key} must not advertise an active factory`);
  }
});

test("ABSTRACT keeps its verified mainnet identity while it remains tracked", () => {
  // Verified 2026-10-12 from the primary source (@AbstractChain post 2107554632675340420 and
  // docs.abs.xyz, which renders its own "shutting down" banner): the Abstract L2 winds down on
  // 2026-12-15. Ticket P2-CHAIN-ABSTRACT-WINDDOWN blocks NEW GM deployments (see
  // apps/web/lib/gm-winddown.ts) while keeping the chain tracked so users can still see the
  // assets they must migrate.
  //
  // This guard deliberately does NOT force the chain to stay active: retirement is an
  // evidence-driven decision, so a future removal of ABSTRACT from the registry is allowed
  // and must then be covered by a "remains absent" test, like retired Degen/Superposition.
  const chain = getChain("ABSTRACT");
  if (chain) assert.equal(chain.CHAIN?.CHAIN_ID, 2741, "verified Abstract mainnet chain id (0xAB5)");
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
