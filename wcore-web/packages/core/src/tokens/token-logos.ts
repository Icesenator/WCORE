// Token logo resolution — used by backend to attach logoUrl to all discovered tokens.
// Tries multiple CDNs: TrustWallet (by contract) → CoinMarketCap (by symbol) → spothq fallback.
// No hardcoded addresses — fully automatic resolution.

const TRUSTWALLET_BASE = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";
const CMC_BASE = "https://s2.coinmarketcap.com/static/img/coins/64x64";

// Chain key → TrustWallet blockchain directory
const CHAIN_SLUGS: Record<string, string> = {
  ETHEREUM: "ethereum", BSC: "smartchain", POLYGON: "polygon",
  ARBITRUM_ONE: "arbitrum", OPTIMISM: "optimism", BASE: "base",
  AVALANCHE: "avalanchec", FANTOM: "fantom", GNOSIS: "xdai",
  CELO: "celo", LINEA: "linea", SCROLL: "scroll",
  ZKSYNC_ERA: "zksync", MANTLE: "mantle", BLAST: "blast",
  MODE: "mode", FRAXTAL: "fraxtal", WORLDCHAIN: "worldchain",
  UNICHAIN: "unichain", BERACHAIN: "berachain", SONIC: "sonic",
  ZORA: "zora", SEI: "sei", SHAPE: "shape", ANCIENT8: "ancient8",
  BOB: "bob", LISK: "lisk", METAL_L2: "metal", REDSTONE: "redstone",
  CYBER: "cyber", RARI: "rari", ZIRCUIT: "zircuit", OPENLEDGER: "openledger",
  STABLE: "stable", TAC: "tac", SONEIUM: "soneium", MEGAETH: "megaeth",
  INK: "ink", STORY: "story", REYA: "reya", MATCHAIN: "matchain",
  ZETACHAIN: "zetachain", HASHKEY: "hashkey", FVM: "fvm",
  ASTAR: "astar", FLOW: "flow", IMMUTABLE: "immutable",
  ETHERLINK: "etherlink", SHIBARIUM: "shibarium", FUSE: "fuse",
  ROOTSTOCK: "rootstock",
};

// Symbol → CoinMarketCap ID (fallback when TrustWallet doesn't have the token)
// Only for well-known tokens where symbol is unambiguous (native tokens, major stablecoins)
const SYMBOL_CMC_IDS: Record<string, number> = {
  // Tokens not in TrustWallet — resolved by symbol (unambiguous for these)
  H: 36922, L3: 33718, ZKP: 33558, ERA: 33372,
  // Major tokens (also in TrustWallet but CMC as extra safety)
  WETH: 2396, USDC: 3408, USDT: 825, DAI: 4943, WBTC: 3717,
  LINK: 1975, UNI: 7083, AAVE: 7278, CRV: 6538, MKR: 1518,
  SNX: 2586, COMP: 5692, LDO: 8000, STETH: 13629,
  PEPE: 24478, SHIB: 5994, ARB: 11841, OP: 11840,
  MATIC: 3890, POL: 3890, AVAX: 5805, BNB: 1839,
  SOL: 5426, ATOM: 3794, OSMO: 12220, TIA: 22861,
  SEI: 23149, INJ: 7226, SUI: 20947, APT: 21794,
  DOT: 6636, NEAR: 6535, FTM: 3513, CRO: 3635,
  FLOKI: 10804, BONK: 23095, DOGE: 74, WIF: 28745,
  FRAX: 6952,
};

/**
 * Resolve logo URL for any token. Works globally across all chains.
 * Priority: 1) CMC by symbol (for known tokens) → 2) TrustWallet by contract → 3) spothq
 *
 * CMC is checked first for tokens in SYMBOL_CMC_IDS to avoid TrustWallet 404s.
 * TrustWallet covers ~80% of ERC-20 tokens indexed by contract address.
 */
export function resolveTokenLogo(symbol: string, chainKey?: string, contract?: string): string | undefined {
  // 1. CoinMarketCap by symbol (for tokens known to NOT be in TrustWallet)
  // This avoids returning broken TrustWallet URLs for tokens like H, L3, ZKP, ERA
  const key = symbol.toUpperCase();
  const symCmcId = SYMBOL_CMC_IDS[key];
  if (symCmcId) return `${CMC_BASE}/${symCmcId}.png`;

  // 2. TrustWallet per-chain asset (covers ~80% of ERC-20 tokens)
  if (contract && chainKey) {
    const chainSlug = CHAIN_SLUGS[chainKey.toUpperCase()];
    if (chainSlug) {
      return `${TRUSTWALLET_BASE}/${chainSlug}/assets/${contract.toLowerCase()}/logo.png`;
    }
  }

  // 3. spothq CDN fallback (last resort)
  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${symbol.toLowerCase()}.svg`;
}

export function getTrustWalletLogoUrl(chainKey: string | undefined, contract: string | undefined): string | undefined {
  if (!contract || !chainKey) return undefined;
  const chainSlug = CHAIN_SLUGS[chainKey.toUpperCase()];
  if (!chainSlug) return undefined;
  return `${TRUSTWALLET_BASE}/${chainSlug}/assets/${contract.toLowerCase()}/logo.png`;
}

export function getSymbolLogoUrl(symbol: string): string | undefined {
  const symCmcId = SYMBOL_CMC_IDS[symbol.toUpperCase()];
  return symCmcId ? `${CMC_BASE}/${symCmcId}.png` : undefined;
}

export function getSpothqLogoUrl(symbol: string): string {
  return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/${symbol.toLowerCase()}.svg`;
}
