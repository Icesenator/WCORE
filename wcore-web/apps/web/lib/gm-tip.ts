// Pure tip computation used by useOnChainGm.sendGm.
//
// The user pays this amount on-chain, so the formula is behavior worth locking:
// ~$0.05 converted to native wei, plus a small buffer so a fast price move between
// quote and inclusion does not revert the "insufficient tip" guard.

export function computeGmTipWei(ethPriceUsd: number, tipUsd = 0.05, buffer = 1.02): bigint {
  if (!(ethPriceUsd > 0)) throw new Error("Native price unavailable");
  return BigInt(Math.ceil((tipUsd / ethPriceUsd) * 1e18 * buffer));
}
