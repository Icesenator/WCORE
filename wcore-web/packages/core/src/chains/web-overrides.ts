/**
 * Overrides web-only appliqués par-dessus @wcore/chains (généré depuis le
 * gsheet, qui ne connaît pas les champs spécifiques au scanner web).
 *
 * MAX_LOG_RANGE = plage max de blocs pour UN appel eth_getLogs. Sans cette
 * limite côté web, la fenêtre par défaut (DEFAULT_LOG_SCAN_BLOCKS = 5000) est
 * envoyée telle quelle et les nœuds bornés rejettent toute la découverte de
 * tokens (-32602/-32000 "block range too large") → scan marqué dégradé alors
 * que les soldes sont corrects.
 *
 * Valeurs relevées des erreurs runtime (2026-08-21) + configs historiques du
 * dépôt. Le dist @wcore/chains ne porte ce champ que pour BSC/DEGEN/MONAD/
 * SOMNIA/TAC/ZERO — toutes les autres chaînes listées ici en étaient dépourvues.
 */
export const WEB_CHAIN_OVERRIDES: Readonly<Record<string, { RPC?: { MAX_LOG_RANGE?: number } }>> = {
  BASE: { RPC: { MAX_LOG_RANGE: 5000 } },
  BOTANIX: { RPC: { MAX_LOG_RANGE: 2000 } },
  CITREA: { RPC: { MAX_LOG_RANGE: 1000 } },
  CRONOS: { RPC: { MAX_LOG_RANGE: 2000 } },
  FLARE: { RPC: { MAX_LOG_RANGE: 30 } }, // nœud Flare : "maximum is set to 30"
  GRAVITY: { RPC: { MAX_LOG_RANGE: 2000 } },
  HYPEREVM: { RPC: { MAX_LOG_RANGE: 1000 } },
  MERLIN: { RPC: { MAX_LOG_RANGE: 5000 } },
  MOONBEAM: { RPC: { MAX_LOG_RANGE: 1024 } },
  MOONRIVER: { RPC: { MAX_LOG_RANGE: 1024 } },
  MORPH: { RPC: { MAX_LOG_RANGE: 5000 } },
  SEI: { RPC: { MAX_LOG_RANGE: 2000 } },
};
