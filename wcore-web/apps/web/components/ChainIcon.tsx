"use client";

import { memo, useState } from "react";
import manifest from "@/lib/chain-icon-manifest.json";

interface ChainIconProps {
  chainKey: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_PX = { sm: 20, md: 28, lg: 36 } as const;
const CONTAIN_LOGOS = new Set(["GNOSIS", "CEX_BINANCE", "CEX_BITPANDA", "CEX_BITFINEX", "CEX_BYBIT", "CEX_COINBASE", "CEX_OKX", "CEX_KRAKEN"]);

/**
 * Deterministic monogram used when no verified asset can be loaded.
 *
 * Deliberately NOT an emoji/glyph: emoji fallbacks rendered inconsistently
 * across platforms and read as corrupted icons. A monogram keeps the exact same
 * box, centring and contrast as every other icon.
 */
function monogram(chainKey: string): string {
  const bare = chainKey.replace(/^CEX_/i, "").replace(/[^A-Za-z0-9]/g, "");
  return (bare.slice(0, 2) || "?").toUpperCase();
}

function ChainIconInner({ chainKey, size = "md" }: ChainIconProps) {
  const upper = chainKey.trim().toUpperCase();
  const localPath = (manifest as Record<string, string>)[upper] ?? null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const px = SIZE_PX[size];
  const src = localPath ?? `https://icons.llamao.fi/icons/chains/rsz_${upper.toLowerCase().replace(/_/g, "")}.jpg`;
  const failed = failedSrc === src;
  const contain = CONTAIN_LOGOS.has(upper);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-border relative overflow-hidden ${contain && !failed ? "bg-white" : "bg-card"}`}
      role={failed ? "img" : undefined}
      aria-label={failed ? chainKey : undefined}
      style={{ width: px, height: px }}
    >
      {!failed ? (
        <img
          src={src}
          alt={chainKey}
          className={`block w-full h-full rounded-full ${contain ? "object-contain p-0.5" : "object-cover"}`}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span
          className="font-semibold leading-none text-muted select-none"
          style={{ fontSize: Math.round(px * 0.45) }}
          aria-hidden="true"
        >
          {monogram(chainKey)}
        </span>
      )}
    </span>
  );
}

export const ChainIcon = memo(ChainIconInner);
