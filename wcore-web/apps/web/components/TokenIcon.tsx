"use client";

import { getTokenColor } from "./icons";
import { memo, useEffect, useState } from "react";

interface TokenIconProps {
  symbol: string;
  size?: "sm" | "md" | "lg";
  logoUrl?: string;
}

const ICON_CDN = "https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color";
const TOKEN_LOGO_OVERRIDES: Record<string, string> = {
  op: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/assets/0x4200000000000000000000000000000000000042/logo.png",
  arb: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
  sol: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
  btc: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
  btcb: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png",
  eth: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  bnb: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png",
  matic: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
  pol: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
  atom: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cosmos/info/logo.png",
  osmo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/osmosis/info/logo.png",
  celo: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/celo/info/logo.png",
  cro: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/info/logo.png",
  ftm: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/fantom/info/logo.png",
  luna: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/terra/info/logo.png",
  lunc: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/terra/info/logo.png",
  dot: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polkadot/info/logo.png",
  ksm: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/kusama/info/logo.png",
  near: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/near/info/logo.png",
  apt: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/aptos/info/logo.png",
  sui: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sui/info/logo.png",
  kava: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/kava/info/logo.png",
  evmos: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/evmos/info/logo.png",
  strd: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stride/info/logo.png",
  axl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/axelar/info/logo.png",
  glmr: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/moonbeam/info/logo.png",
  movr: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/moonriver/info/logo.png",
  mnt: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/mantle/info/logo.png",
  sei: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sei/info/logo.png",
  blast: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/blast/info/logo.png",
  zk: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/zksync/info/logo.png",
  manta: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/manta/info/logo.png",
  zeta: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/zetachain/info/logo.png",
  ron: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ronin/info/logo.png",
  kcs: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/kcc/info/logo.png",
  ton: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png",
  scroll: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/scroll/info/logo.png",
  xpl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/plasma/info/logo.png",
  mito: "https://coin-images.coingecko.com/coins/images/68355/large/mitosis.png",
  hype: "https://s2.coinmarketcap.com/static/img/coins/64x64/32196.png",
  okb: "https://s2.coinmarketcap.com/static/img/coins/64x64/3897.png",
  open: "https://coin-images.coingecko.com/coins/images/67482/large/open.png",
  btcn: "https://coin-images.coingecko.com/coins/images/53914/large/bitcorn_logo_200.png",
  metis: "https://icons.llamao.fi/icons/chains/rsz_metis.jpg",
  flr: "https://icons.llamao.fi/icons/chains/rsz_flare.jpg",
  astr: "https://icons.llamao.fi/icons/chains/rsz_astar.jpg",
  plume: "https://icons.llamao.fi/icons/chains/rsz_plume.jpg",
  kaia: "https://icons.llamao.fi/icons/chains/rsz_kaia.jpg",
  bera: "https://icons.llamao.fi/icons/chains/rsz_berachain.jpg",
  vana: "https://icons.llamao.fi/icons/chains/rsz_vana.jpg",
  gho: "https://coin-images.coingecko.com/coins/images/30663/large/gho-token-logo.png",
  g: "https://coin-images.coingecko.com/coins/images/39200/large/gravity.jpg",
  // New natives not in spothq/cryptocurrency-icons
  somi: "https://icons.llamao.fi/icons/chains/rsz_somnia.jpg",
  mon: "https://icons.llamao.fi/icons/chains/rsz_monad.jpg",
  // Token-specific overrides from previous set
  xdai: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/gnosis/info/logo.png",
  frax: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x853d955aCEf822Db058eb8505911ED77F175b99e/logo.png",
  imx: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7b35cE1a2CFe631eeB754DaBb2CEF6Bcb1A4eEf5/logo.png",
};
const CMC_IDS: Record<string, number> = {
  inj: 7226, luna: 4172, lunc: 4172, cro: 3635, atom: 3794, osmo: 12220,
  sei: 23149, tia: 22861, dot: 6636, near: 6535, flow: 4558, sui: 20947,
  apt: 21794, hnt: 5665, kava: 4846, evmos: 19899, strd: 22182,
  axl: 17799, weth: 2396, usdc: 3408, usdt: 825, dai: 4943, wbtc: 3717,
  sol: 5426, bnb: 1839, matic: 3890, pol: 3890, avax: 5805, ftm: 3513,
  op: 11840, arb: 11841, pepe: 24478, shib: 5994, bonk: 23095, floki: 10804,
  hype: 32333, open: 34032, btcn: 33916, gho: 24277, g: 33560,
  h: 35744, l3: 33718, zkp: 33558, era: 33372, somi: 37637, mon: 30495,
};

export function getTokenLogoUrl(symbol: string): string {
  const key = symbol.toLowerCase();
  return TOKEN_LOGO_OVERRIDES[key] ?? `${ICON_CDN}/${key}.svg`;
}

export function getTokenIconSource(symbol: string, logoUrl: string | undefined, errorLevel: number): string | null {
  if (logoUrl && errorLevel === 0) return logoUrl;
  if (errorLevel <= 1) return getTokenLogoUrl(symbol);
  if (errorLevel <= 2) {
    const cmcId = CMC_IDS[symbol.toLowerCase()];
    return cmcId ? `https://s2.coinmarketcap.com/static/img/coins/64x64/${cmcId}.png` : null;
  }
  return null;
}

function TokenIconInner({ symbol, size = "md", logoUrl }: TokenIconProps) {
  const [errorLevel, setErrorLevel] = useState(0); // 0=try logoUrl, 1=try CDN, 2=fallback
  const [imageBroken, setImageBroken] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const short = symbol.length <= 4 ? symbol : symbol.slice(0, 4);
  const color = getTokenColor(short);
  const sizeClass = size === "sm" ? "w-5 h-5 text-[8px]" : size === "lg" ? "w-9 h-9 text-xs" : "w-7 h-7 text-[9px]";
  const src = getTokenIconSource(symbol, logoUrl, errorLevel);

  // When the source changes (e.g. after cascading to the next fallback),
  // reset both flags so the new image gets a clean attempt.
  useEffect(() => { setImageBroken(false); setImageLoaded(false); }, [src]);

  const handleError = () => {
    setImageBroken(true);
    setImageLoaded(false);
    setErrorLevel((prev) => prev + 1);
  };
  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (e.currentTarget.naturalWidth === 0) handleError();
    else { setImageBroken(false); setImageLoaded(true); }
  };

  // The colored letter circle sits behind the image only while it is loading or
  // broken. Once the image renders, hide the fallback so transparent logos
  // (e.g. stock favicons) don't show the colored circle/letter behind them.
  const fallback = (
    <span
      className={`absolute inset-0 inline-flex items-center justify-center rounded-full font-bold text-white leading-none ${imageLoaded ? "opacity-0" : ""}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {short.slice(0, size === "sm" ? 2 : 3)}
    </span>
  );

  if (src) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white leading-none relative overflow-hidden ${imageLoaded ? "" : "bg-bg"} ${sizeClass}`} title={symbol}>
        {fallback}
        {!imageBroken ? (
          <img
            src={src}
            alt={symbol}
            className="relative z-10 block w-full h-full rounded-full object-contain"
            onError={handleError}
            onLoad={handleLoad}
          />
        ) : null}
      </span>
    );
  }

  // Last resort: colored circle
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white leading-none ${sizeClass}`}
      style={{ backgroundColor: color }}
      title={symbol}
    >
      {short.slice(0, size === "sm" ? 2 : 3)}
    </span>
  );
}

export const TokenIcon = memo(TokenIconInner);
