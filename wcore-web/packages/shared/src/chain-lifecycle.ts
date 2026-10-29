/** Permanent retirement of the Superseed L2, not Ethereum or its SUPR token. */
export function isRetiredChain(key: string): boolean {
  return ["superseed", "sseed", "5330", "0x14d2"].includes(key.trim().toLowerCase());
}

/** Migrate legacy selections without hiding unknown, newly supported chains. */
export function filterActiveChainKeys(keys: readonly string[]): string[] {
  return keys.filter((key) => !isRetiredChain(key));
}
