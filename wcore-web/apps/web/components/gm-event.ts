export interface GmDoneEventDetail {
  date?: string;
  chain?: string;
}

export function isGmDoneForChain(detail: unknown, chainKey: string | undefined): boolean {
  if (!chainKey || !detail || typeof detail !== "object") return false;
  const chain = (detail as GmDoneEventDetail).chain;
  return typeof chain === "string" && chain.toLowerCase() === chainKey.toLowerCase();
}
