import { test } from "node:test";
import assert from "node:assert/strict";
import { mapProviderChain } from "./chain-map.js";
import { canonicalProtocolId } from "./protocol-aliases.js";
import { DISABLED_PROVIDER_IDS } from "./types.js";

test("maps reviewed Zerion mainnets to canonical WCORE chain keys", () => {
  const cases = {
    ethereum: "ETHEREUM",
    arbitrum: "ARBITRUM_ONE",
    optimism: "OPTIMISM",
    base: "BASE",
    polygon: "POLYGON",
    avalanche: "AVALANCHE",
    bsc: "BSC",
    gnosis: "GNOSIS",
    "zksync-era": "ZKSYNC_ERA",
    linea: "LINEA",
    scroll: "SCROLL",
    mantle: "MANTLE",
    blast: "BLAST",
    solana: "SOLANA",
  } as const;

  for (const [providerChain, canonicalChain] of Object.entries(cases)) {
    assert.equal(mapProviderChain("zerion", providerChain), canonicalChain);
  }
});

test("chain mapping only normalizes safe casing and surrounding whitespace", () => {
  assert.equal(mapProviderChain("zerion", "  ArBiTrUm  "), "ARBITRUM_ONE");
  assert.equal(mapProviderChain("zerion", "arbitrum-one"), undefined);
  assert.equal(mapProviderChain("zerion", "ethereum/mainnet"), undefined);
  assert.equal(mapProviderChain("helius", "solana"), undefined);
});

test("maps reviewed protocol aliases to stable canonical protocol IDs", () => {
  const cases = {
    "aave-v3": "aave",
    "compound_v3": "compound",
    "lido-staked-eth": "lido",
    eigenlayer: "eigenlayer",
    "spark-protocol": "spark",
    "morpho-blue": "morpho",
    "curve-finance": "curve",
    "convex-finance": "convex",
    "uniswap-v3": "uniswap",
    "balancer-v2": "balancer",
  } as const;

  for (const [providerProtocol, canonicalProtocol] of Object.entries(cases)) {
    assert.equal(canonicalProtocolId("zerion", providerProtocol), canonicalProtocol);
  }
});

test("namespaces normalized unknown protocols by provider", () => {
  assert.equal(canonicalProtocolId("zerion", " New_Protocol.V2 "), "zerion:new-protocol-v2");
  assert.equal(canonicalProtocolId("helius", "New_Protocol.V2"), "helius:new-protocol-v2");
});

test("rejects empty and unsafe provider protocol IDs", () => {
  for (const value of ["", "   ", "../aave", "aave/v3", "aave:v3", "aave<script>"]) {
    assert.equal(canonicalProtocolId("zerion", value), undefined);
  }
});

test("keeps future providers disabled until their contracts are implemented", () => {
  assert.deepEqual(DISABLED_PROVIDER_IDS, ["helius", "etherscan", "lifi-earn"]);
});
