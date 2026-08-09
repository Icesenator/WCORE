import assert from "node:assert/strict";
import { test } from "node:test";

import { toWcoreChain } from "./chain-map.js";
import { canonicalProtocol } from "./protocol-aliases.js";
import { DISABLED_PROVIDER_IDS } from "./types.js";

test("maps only reviewed Zerion mainnets", () => {
  const cases = {
    ethereum: "ETHEREUM",
    arbitrum: "ARBITRUM_ONE",
    optimism: "OPTIMISM",
    base: "BASE",
    polygon: "POLYGON",
    avalanche: "AVALANCHE",
    "binance-smart-chain": "BSC",
    xdai: "GNOSIS",
    "zksync-era": "ZKSYNC_ERA",
    linea: "LINEA",
    scroll: "SCROLL",
    mantle: "MANTLE",
    blast: "BLAST",
    solana: "SOLANA",
  };
  for (const [providerChain, chain] of Object.entries(cases)) assert.equal(toWcoreChain(providerChain), chain);
  assert.equal(toWcoreChain("  ArBiTrUm  "), "ARBITRUM_ONE");
  for (const value of ["arbitrum-one", "ethereum/mainnet", "bsc", "gnosis", "unknown-chain"]) {
    assert.equal(toWcoreChain(value), undefined);
  }
});

test("canonicalizes reviewed aliases and safely namespaces unknown protocols", () => {
  const cases = {
    "aave-v3": "aave-v3",
    compound_v3: "compound-v3",
    "lido-staked-eth": "lido",
    eigenlayer: "eigenlayer",
    "spark-protocol": "spark",
    "morpho-blue": "morpho",
    "curve-finance": "curve",
    "convex-finance": "convex",
    "uniswap-v3": "uniswap-v3",
    "balancer-v2": "balancer-v2",
  };
  for (const [providerProtocol, protocol] of Object.entries(cases)) {
    assert.equal(canonicalProtocol("zerion", providerProtocol), protocol);
  }
  assert.equal(canonicalProtocol("zerion", " New_Protocol.V2 "), "zerion:new-protocol-v2");
  assert.equal(canonicalProtocol("helius", "New_Protocol.V2"), "helius:new-protocol-v2");
  for (const value of ["", "   ", "../aave", "aave/v3", "aave:v3", "aave<script>"]) {
    assert.equal(canonicalProtocol("zerion", value), undefined);
  }
});

test("keeps unimplemented providers disabled", () => {
  assert.deepEqual(DISABLED_PROVIDER_IDS, ["helius", "etherscan", "lifi-earn"]);
});
