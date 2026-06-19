const TOKEN_COLORS: Record<string, string> = {
  ETH: "#627EEA", WETH: "#627EEA", BNB: "#F0B90B", USDC: "#2775CA",
  USDT: "#26A17B", DAI: "#F5AC35", WBTC: "#F7931A", SOL: "#9945FF",
  AVAX: "#E84142", POL: "#8247E5", ATOM: "#2E3148", ARB: "#28A0F1",
  OP: "#FF0420", LINK: "#2A5ADA", UNI: "#FF007A", MKR: "#1AAB9B",
  AAVE: "#B6509E", CRV: "#3C3C3C", LDO: "#00A3FF", STETH: "#00A3FF",
  RETH: "#D34A24", SUSHI: "#FA52A0", GRT: "#6747ED", SNX: "#00D1FF",
  COMP: "#00D395", YFI: "#006AE3", BAL: "#1E1E1E", ENS: "#5298FF",
  APE: "#004EEB", BLUR: "#FF6600", PEPE: "#398D2F", SHIB: "#FFA409",
  FTM: "#1969FF", NEAR: "#000000", FLOW: "#00EF8B", INJ: "#00F0FE",
  TIA: "#8646F4", RUNE: "#33FFCC", SEI: "#8B0000", SUI: "#4DA2FF",
  APT: "#000000", DOT: "#E6007A", KSM: "#000000", TON: "#0098EA",
  MATIC: "#8247E5", FRAX: "#000000", LUSD: "#B5B5FF", GUSD: "#00DCFA",
  TUSD: "#000000", BUSD: "#F0B90B", USDP: "#000000", EURS: "#1A3FFF",
};

export function getTokenColor(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (TOKEN_COLORS[upper]) return TOKEN_COLORS[upper]!;
  let hash = 0;
  for (let i = 0; i < upper.length; i++) hash = upper.charCodeAt(i) + ((hash << 5) - hash);
  const palette = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6"];
  return palette[Math.abs(hash) % palette.length]!;
}

export function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
