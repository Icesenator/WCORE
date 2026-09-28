/**
 * Balance selection for the GM withdraw button (pure, unit-tested).
 *
 * Why this exists (2026-09-28, Arc): the "Fees Earned" button kept offering a
 * withdrawal for a contract whose on-chain `creatorBalance` was already 0. The
 * localStorage cache (`gm_bal_*`) had been written while the balance was still
 * non-zero and was never invalidated — it won over the fresh server read of
 * "0", so every click submitted `withdrawCreator` and reverted with
 * "nothing to withdraw".
 *
 * Precedence, highest first:
 *   1. `walletBalance`  — an authoritative read from the wallet RPC, any value
 *                         including 0. The caller must have confirmed the wallet
 *                         is on the contract's own chain before trusting it.
 *   2. `backendBalance` — the server read. A genuine "0" must beat the local
 *                         cache; that inversion was the bug.
 *   3. `cachedBalance`  — optimistic value, used only before any read lands.
 */
export interface GmBalanceSources {
  walletBalance?: string | null;
  backendBalance?: string | null;
  cachedBalance?: string | null;
}

export function resolveGmBalance({
  walletBalance,
  backendBalance,
  cachedBalance,
}: GmBalanceSources): string {
  for (const candidate of [walletBalance, backendBalance, cachedBalance]) {
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return "0";
}
