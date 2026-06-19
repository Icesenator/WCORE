import type { ChainScan } from "@wcore/shared";

export function isCexDistributionChain(chainKey: string): boolean {
  return chainKey.toUpperCase().startsWith("CEX_");
}

export function getDistributionVm(chain: Pick<ChainScan, "chainKey" | "vm">): string {
  if (isCexDistributionChain(chain.chainKey)) return "CEX";
  return chain.vm || "EVM";
}
