// Chains whose network has announced an end-of-life.
//
// Policy (2026-10-12, ticket P2-CHAIN-ABSTRACT-WINDDOWN):
//   - New GM contract creation is BLOCKED: it spends gas and creates a contract on a
//     chain that is going away, so the deployed contract becomes inaccessible.
//   - Existing contracts, balances and GM sends are NOT touched: users must keep
//     seeing their assets while they migrate.
//   - WCORE does NOT migrate assets and cannot recover funds after the deadline.
//
// Retirement of the chain itself (registry / GM factory) is a separate, evidence-driven
// decision and must not be deduced from this module.
export type GmWindDown = {
  chainKey: string;
  /** ISO date of the officially announced network shutdown. */
  announcedShutdown: string;
  /** User-facing wording; never promises recovery or migration by WCORE. */
  notice: string;
  /** Official resources the user must use themselves. */
  officialResources: string[];
};

export const GM_WIND_DOWN = {
  abstract: {
    chainKey: "abstract",
    announcedShutdown: "2026-12-15",
    notice:
      "Abstract is shutting down on 2026-12-15. WCORE keeps tracking your assets but does not migrate them. " +
      "Migrate with the official Abstract resources before the deadline, or the funds become inaccessible. " +
      "Never act on migration instructions received by DM.",
    officialResources: ["https://migrate.abs.xyz", "https://native-bridge.abs.xyz"],
  },
} satisfies Record<string, GmWindDown>;

/** Case-insensitive lookup; never index the map directly. */
export function getGmWindDown(chainKey: string | null | undefined): GmWindDown | undefined {
  if (!chainKey) return undefined;
  return GM_WIND_DOWN[chainKey.trim().toLowerCase()];
}

/** True when creating a NEW GM contract must be refused for this chain. */
export function isGmDeployBlocked(chainKey: string | null | undefined): boolean {
  return getGmWindDown(chainKey) !== undefined;
}

/** Message used to refuse a new deployment; keeps the announced date and the disclaimer. */
export function gmDeployBlockedMessage(windDown: GmWindDown): string {
  return `${windDown.chainKey} is winding down (${windDown.announcedShutdown}). New GM contracts are disabled on this chain. ${windDown.notice}`;
}
