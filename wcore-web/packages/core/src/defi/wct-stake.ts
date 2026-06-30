// v0.3.x: WCT Stake dynamic liquidity status — queries lockUntil(address) on the
// WalletConnect staking contract to determine if the user's position is still
// locked or has become flexible. Replaces the hardcoded `liquidityStatus:"lock"`
// in the registry which kept the [Lock] badge forever even after expiry.
import { decodeUint256 } from "../tokens/abi.js";
import type { LiquidityStatus } from "./positions.js";

export const WCT_STAKE_CONTRACT = "0x521b4c065bbdbe3e20b3727340730936912dfa46";
// keccak256("lockUntil(address)")[:4]
const LOCK_UNTIL_SELECTOR = "0x025b22f4";

function padAddress(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

// Minimal interface — accept any object exposing ethCall. This keeps the function
// decoupled from the full EvmRpc class and lets callers (apps/api) inject a custom
// RPC stub (e.g., for tests or a fetch-based endpoint).
export interface RpcLike {
  ethCall: (endpoint: string, contract: string, data: string) => Promise<string>;
}

export async function getWCTStakeLockStatus(
  rpc: RpcLike,
  endpoint: string,
  userAddress: string,
): Promise<LiquidityStatus> {
  try {
    const data = `${LOCK_UNTIL_SELECTOR}${padAddress(userAddress)}`;
    const hex = await rpc.ethCall(endpoint, WCT_STAKE_CONTRACT, data);
    const lockUntil = Number(decodeUint256(hex));
    const now = Math.floor(Date.now() / 1000);
    if (Number.isFinite(lockUntil) && lockUntil > now) return "lock";
    return "flex";
  } catch {
    // RPC failure → default to flex (safe default; better than falsely showing Lock)
    return "flex";
  }
}
