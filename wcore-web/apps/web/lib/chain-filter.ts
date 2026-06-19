export type ScanVm = "EVM" | "SVM" | "COSMOS" | "TON";

export interface ChainScanMeta {
  vm: string;
  disabled?: boolean;
}

export function matchCompatibleChains(
  addrVm: string,
  chainKeys: string[],
  chainMetaMap: Record<string, ChainScanMeta>,
): string[] {
  return chainKeys.filter((ch) => {
    const key = ch.toUpperCase();
    const meta = chainMetaMap[key];
    if (!meta) {
      // VM not cached - scan anyway so a stale /api/chains response does not hide new chains.
      return true;
    }
    if (meta.disabled) return false;
    return meta.vm === addrVm;
  });
}
