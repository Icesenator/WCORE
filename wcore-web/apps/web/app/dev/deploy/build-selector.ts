// Pick the right build (Shanghai default vs Paris) based on the target chain's EVM capabilities.
// KCC mainnet is pre-London (no EIP-1559 baseFeePerGas) → pre-Shanghai → no PUSH0 opcode.
// Use a Paris-compiled (solc 0.8.19) bytecode variant for those chains.
// Add other pre-Shanghai chains here as we discover them via KCC-style failure patterns.

export const PARIS_BUILD_CHAINS = new Set<string>(["KCC"]);

export interface ContractBuild {
  abi: unknown[];
  bin: string;
}

export interface BuildOutput {
  GmOnChain: ContractBuild;
  GmFactory: ContractBuild;
  GmOnChainParis?: ContractBuild;
  GmFactoryParis?: ContractBuild;
}

export function pickBuild(
  build: BuildOutput,
  chainKey: string,
  contract: "GmOnChain" | "GmFactory",
): ContractBuild {
  const isParis = PARIS_BUILD_CHAINS.has(chainKey.toUpperCase());
  if (isParis) {
    const parisKey = `${contract}Paris` as const;
    const entry = build[parisKey];
    if (!entry) {
      throw new Error(`No Paris build found for ${contract} on ${chainKey} (pre-Shanghai chain). Update build.json with the Paris-compiled bytecode.`);
    }
    return entry;
  }
  return build[contract];
}
