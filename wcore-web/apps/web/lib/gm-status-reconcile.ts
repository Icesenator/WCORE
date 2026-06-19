export interface DbGmStatus {
  deployed: boolean | null;
  gmDone: boolean;
}

export function shouldCheckOnchainGmStatus(status: DbGmStatus | undefined): boolean {
  return !!status?.deployed && !status.gmDone;
}

export function shouldUseInitialGmStatusWithoutCheck(status: DbGmStatus | undefined): boolean {
  return !!status?.deployed && status.gmDone;
}

export interface GmStatusFetchPlan {
  /** Call GET /api/gm/has-deployed (per-card). */
  fetchHasDeployed: boolean;
  /** Call GET /api/gm/status (the GLOBAL status — identical for every card). */
  fetchGlobalStatus: boolean;
  /** Call GET /api/gm/status-onchain (targeted, single chain reconcile). */
  fetchOnchain: boolean;
}

/**
 * Decide what a GM card must fetch on mount.
 *
 * When the parent page already fetched the global `/api/gm/status` once and
 * passes it down as `initialStatus`, each card MUST trust it instead of
 * re-fetching the same global endpoint. Otherwise a page with N cards fires
 * 2-3×N `gm_read` requests at once and exhausts the rate-limit bucket — which
 * then 429s unrelated GM reads like the header's `/api/gm/random`.
 *
 * - No `initialStatus` (standalone card, e.g. in scan results): full fetch.
 * - `initialStatus.deployed === null`: parent tried to fetch the global status
 *   but could not prove true/false. Do a targeted has-deployed check only.
 * - `initialStatus` provided with a boolean deployment status: trust it.
 *   Only run the targeted on-chain reconcile when the page says the contract is
 *   deployed but today's GM is not yet recorded.
 */
export function gmStatusFetchPlan(initialStatus: DbGmStatus | undefined): GmStatusFetchPlan {
  if (!initialStatus) {
    return { fetchHasDeployed: true, fetchGlobalStatus: true, fetchOnchain: false };
  }
  if (initialStatus.deployed === null) {
    return { fetchHasDeployed: true, fetchGlobalStatus: false, fetchOnchain: false };
  }
  return {
    fetchHasDeployed: false,
    fetchGlobalStatus: false,
    fetchOnchain: shouldCheckOnchainGmStatus(initialStatus),
  };
}

export type ApiGmStatus = Record<string, { deployed: boolean; gmDone: boolean } | undefined>;

/**
 * Map the global `/api/gm/status` response into a per-chain status map that
 * `GmChainCard` can use as `initialStatus`.
 *
 * Critical for performance: an empty object (`{}`) means the user has no
 * contracts on any chain — that is a definitive `deployed: false` for every
 * chain, NOT `deployed: null`. Treating it as `null` would cause each card to
 * fire its own `/api/gm/has-deployed?chain=X` request on mount, multiplying
 * the page load by the number of GM chains and hitting the gm_read rate
 * limit. Only treat chains as `unknown` when the API response itself is
 * missing (network error / unauthenticated).
 */
export function buildChainStatusesFromApi(
  data: ApiGmStatus | null,
  chainKeys: readonly string[],
  lsGmDoneLookup: (chainKey: string) => boolean,
): Record<string, DbGmStatus> {
  const result: Record<string, DbGmStatus> = {};
  if (data === null) {
    for (const key of chainKeys) {
      result[key] = { deployed: null, gmDone: lsGmDoneLookup(key) };
    }
    return result;
  }
  for (const key of chainKeys) {
    const entry = data[key];
    if (entry) {
      result[key] = { deployed: entry.deployed, gmDone: entry.gmDone };
    } else {
      result[key] = { deployed: false, gmDone: false };
    }
  }
  return result;
}
