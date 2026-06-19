"use client";

import { memo, useState } from "react";
import manifest from "@/lib/chain-icon-manifest.json";

interface ChainIconProps {
  chainKey: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_PX = { sm: 20, md: 28, lg: 36 } as const;

const EMOJIS: Record<string, string> = {
  ETHEREUM: "\u27E0", BASE: "\uD83D\uDD35", ARBITRUM_ONE: "\uD83D\uDD36", OPTIMISM: "\uD83D\uDD34",
  POLYGON: "\uD83D\uDFE3", BSC: "\uD83D\uDFE1", AVALANCHE: "\uD83D\uDD3A", GNOSIS: "\uD83D\uDFE2",
  ZKSYNC_ERA: "\u2B1C", LINEA: "\u2B1B", SOLANA: "\u25CE", COSMOS_HUB: "\u269B\uFE0F",
  XRPLEVM: "\uD83D\uDCA7", TON: "\uD83C\uDF0A",
};

const CONTAIN_LOGOS = new Set(["GNOSIS", "CEX_BINANCE", "CEX_BITPANDA", "CEX_BITFINEX", "CEX_BYBIT", "CEX_COINBASE", "CEX_OKX"]);

function ChainIconInner({ chainKey, size = "md" }: ChainIconProps) {
  const upper = chainKey.toUpperCase();
  const localPath = (manifest as Record<string, string>)[upper] ?? null;
  const [failed, setFailed] = useState(false);
  const px = SIZE_PX[size];
  const emoji = EMOJIS[upper] ?? "\u26D3\uFE0F";
  const src = localPath ?? `https://icons.llamao.fi/icons/chains/rsz_${chainKey.toLowerCase().replace(/_/g, "")}.jpg`;
  const contain = CONTAIN_LOGOS.has(upper);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-border relative ${contain ? "bg-white" : "bg-card"}`}
      style={{ width: px, height: px }}
    >
      {!failed ? (
        <img
          src={src}
          alt={chainKey}
          className={`block w-full h-full rounded-full relative ${contain ? "object-contain p-0.5" : "object-cover"}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-sm leading-none">{emoji}</span>
      )}
    </span>
  );
}

export const ChainIcon = memo(ChainIconInner);
