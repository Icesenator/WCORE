// Behavioral decision core of useOnChainGm.checkHasDeployed / useGmChain.
//
// Extracted so the "failure is unknown, not absent" invariant is covered by a real
// behavioral test instead of only living in a code comment. A GM request that could not
// be trusted must NEVER be reported as "not deployed": doing so would show a Deploy
// button (and charge a fresh contract) to a user who already deployed on that chain.

export interface HasDeployedSignals {
  /** The chain key resolved to a non-empty value. */
  chainPresent: boolean;
  /** localStorage already records a deployment for this chain. */
  lsDeployed: boolean;
  /** The /api/gm/has-deployed response was HTTP-ok. */
  ok: boolean;
  /** Parsed `hasDeployed` field from a successful response. */
  hasDeployed?: boolean;
}

/**
 * true  → a contract is deployed on this chain.
 * false → definitively no contract (a trustworthy "no").
 * null  → UNKNOWN (missing chain, or the request could not be trusted); callers
 *         render this as "still loading", never as an offer to Deploy.
 */
export function resolveHasDeployed(signals: HasDeployedSignals): boolean | null {
  if (!signals.chainPresent) return null;
  if (signals.lsDeployed) return true;
  if (!signals.ok) return null;
  return signals.hasDeployed ? true : false;
}
