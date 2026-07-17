import { test } from "node:test";
import assert from "node:assert/strict";
import { toWcoreChain } from "./chain-map.js";
import { canonicalProtocol } from "./protocol-aliases.js";
import { DISABLED_PROVIDER_IDS } from "./types.js";
import type {
  NormalizedProviderPosition,
  PortfolioEnrichmentProvider,
  PortfolioEnrichmentResult,
  ProviderCapabilities,
  ProviderPortfolioSnapshot,
  ProviderRequestContext,
} from "./types.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends (<Value>() => Value extends Right ? 1 : 2)
    ? (<Value>() => Value extends Right ? 1 : 2) extends (<Value>() => Value extends Left ? 1 : 2)
      ? true
      : false
    : false;

type Assert<Condition extends true> = Condition;

type ExpectedPosition = {
  readonly provider: "zerion" | "helius" | "etherscan" | "lifi-earn";
  readonly chain: string;
  readonly protocol: string;
  readonly type:
    | "collateral"
    | "vault_share"
    | "lending_debt"
    | "staking_locked"
    | "staking_liquid"
    | "claimable"
    | "real_world_asset"
    | "unknown_defi";
  readonly contract?: string;
  readonly underlyingContract?: string;
  readonly receiptContract?: string;
  readonly poolAddress?: string;
  readonly positionId: string;
  readonly groupId?: string;
  readonly balance: number;
  readonly priceEur: number | null;
  readonly valueEur: number;
  readonly liquidity: "liquid" | "locked" | "claimable" | "unknown";
  readonly providerVerified: true;
};

type ExpectedProvider = {
  readonly id: "zerion" | "helius" | "etherscan" | "lifi-earn";
  readonly capabilities: ProviderCapabilities;
  supports(address: string): boolean;
  load(context: ProviderRequestContext): Promise<ProviderPortfolioSnapshot>;
};

type ContractShapeChecks = readonly [
  Assert<Equal<NormalizedProviderPosition, ExpectedPosition>>,
  Assert<Equal<PortfolioEnrichmentProvider, ExpectedProvider>>,
  Assert<Equal<ProviderPortfolioSnapshot["diagnostics"], Readonly<Record<string, number | string | boolean>>>>,
  Assert<Equal<PortfolioEnrichmentResult["diagnostics"], Readonly<Record<string, number | string | boolean>>>>,
];

const CONTRACT_SHAPE_CHECKS: ContractShapeChecks = [true, true, true, true];

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
    assert.equal(toWcoreChain(providerChain), canonicalChain);
  }
});

test("chain mapping only normalizes safe casing and surrounding whitespace", () => {
  assert.equal(toWcoreChain("  ArBiTrUm  "), "ARBITRUM_ONE");
  assert.equal(toWcoreChain("arbitrum-one"), undefined);
  assert.equal(toWcoreChain("ethereum/mainnet"), undefined);
  assert.equal(toWcoreChain("unknown-chain"), undefined);
});

test("maps reviewed protocol aliases to stable canonical protocol IDs", () => {
  const cases = {
    "aave-v3": "aave-v3",
    "compound_v3": "compound-v3",
    "lido-staked-eth": "lido",
    eigenlayer: "eigenlayer",
    "spark-protocol": "spark",
    "morpho-blue": "morpho",
    "curve-finance": "curve",
    "convex-finance": "convex",
    "uniswap-v3": "uniswap-v3",
    "balancer-v2": "balancer-v2",
  } as const;

  for (const [providerProtocol, expectedProtocol] of Object.entries(cases)) {
    assert.equal(canonicalProtocol("zerion", providerProtocol), expectedProtocol);
  }
});

test("namespaces normalized unknown protocols by provider", () => {
  assert.equal(canonicalProtocol("zerion", " New_Protocol.V2 "), "zerion:new-protocol-v2");
  assert.equal(canonicalProtocol("helius", "New_Protocol.V2"), "helius:new-protocol-v2");
});

test("rejects empty and unsafe provider protocol IDs", () => {
  for (const value of ["", "   ", "../aave", "aave/v3", "aave:v3", "aave<script>"]) {
    assert.equal(canonicalProtocol("zerion", value), undefined);
  }
});

test("keeps future providers disabled until their contracts are implemented", () => {
  assert.deepEqual(DISABLED_PROVIDER_IDS, ["helius", "etherscan", "lifi-earn"]);
});

test("provider contracts retain their exact approved shape", () => {
  assert.deepEqual(CONTRACT_SHAPE_CHECKS, [true, true, true, true]);
});
