export function detectChainType(addr: string): "EVM" | "SVM" | "COSMOS" | "TON" {
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return "EVM";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return "SVM";
  if (/^[a-z]{1,32}1[a-z0-9]{38,58}$/.test(addr)) return "COSMOS";
  if (/^(EQ|UQ|Ef|Uf)[A-Za-z0-9_-]{40,60}$/.test(addr)) return "TON";
  if (/^-?[0-9]+:[a-fA-F0-9]{64}$/.test(addr)) return "TON";
  return "EVM";
}
