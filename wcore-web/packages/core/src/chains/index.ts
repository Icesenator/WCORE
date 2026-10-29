// Manually maintained — do NOT regenerate: this index merges WEB_CHAIN_OVERRIDES
// (see below) on top of @wcore/chains, which build-chains-index.mjs does not know about.
// Source: @wcore/chains (158 chains from wcore-gsheet/dist) + 0 local web-only chains.
// v4.16.66(web): les overrides web-only (RPC.MAX_LOG_RANGE) sont fusionnés
// par-dessus le dist gsheet — voir web-overrides.ts. Le gsheet ne connaît pas
// ce champ, sans override la fenêtre par défaut (5000 blocs) part non bornée
// sur des nœuds qui la rejettent (CITREA/HYPEREVM/SEI/MOONRIVER/FLARE...).

import {
  chains as gsheetChains,
} from "@wcore/chains";
import type { ChainConfig } from "@wcore/chains/types";
import { WEB_CHAIN_OVERRIDES } from "./web-overrides.js";
import { isRetiredChain } from "@wcore/shared";

// Local web-only chains (not yet ported to wcore-gsheet/src/*.gs).

// Keep stale upstream/generated registries from resurrecting a removed chain.
const merged = Object.fromEntries(Object.entries(gsheetChains).filter(([key, chain]) =>
  !isRetiredChain(key) && !isRetiredChain(chain.key) && !isRetiredChain(String(chain.CHAIN?.CHAIN_ID)),
)) as Record<string, ChainConfig>;
for (const [overrideKey, override] of Object.entries(WEB_CHAIN_OVERRIDES)) {
  const base = merged[overrideKey];
  if (!base) continue;
  merged[overrideKey] = { ...base, RPC: { ...base.RPC, ...override.RPC } };
}

export const chains = merged as typeof gsheetChains;

export type ChainKey = keyof typeof chains;

export const chainList: readonly ChainConfig[] = Object.values(chains);

export function getChain(key: string): ChainConfig | undefined {
  return (chains as Record<string, ChainConfig>)[key];
}
