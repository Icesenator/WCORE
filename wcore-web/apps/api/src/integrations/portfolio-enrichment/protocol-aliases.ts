import type { ProviderId } from "./types.js";

const ZERION_PROTOCOL_ALIASES: Readonly<Record<string, string>> = {
  aave: "aave",
  "aave-v2": "aave",
  "aave-v3": "aave",
  compound: "compound",
  "compound-v2": "compound",
  "compound-v3": "compound",
  lido: "lido",
  "lido-staked-eth": "lido",
  "lido-steth": "lido",
  eigenlayer: "eigenlayer",
  "eigen-layer": "eigenlayer",
  spark: "spark",
  "spark-protocol": "spark",
  morpho: "morpho",
  "morpho-blue": "morpho",
  curve: "curve",
  "curve-finance": "curve",
  convex: "convex",
  "convex-finance": "convex",
  uniswap: "uniswap",
  "uniswap-v2": "uniswap",
  "uniswap-v3": "uniswap",
  balancer: "balancer",
  "balancer-v1": "balancer",
  "balancer-v2": "balancer",
};

const SAFE_PROVIDER_ID = /^[a-zA-Z0-9]+(?:[._ -][a-zA-Z0-9]+)*$/;

function normalizeProviderProtocolId(value: string): string | undefined {
  const trimmed = value.trim();
  if (!SAFE_PROVIDER_ID.test(trimmed)) return undefined;
  return trimmed.toLowerCase().replace(/[._ -]+/g, "-");
}

export function canonicalProtocolId(provider: ProviderId, providerProtocolId: string): string | undefined {
  const normalized = normalizeProviderProtocolId(providerProtocolId);
  if (!normalized) return undefined;

  if (provider === "zerion") {
    const canonical = ZERION_PROTOCOL_ALIASES[normalized];
    if (canonical) return canonical;
  }

  return `${provider}:${normalized}`;
}
