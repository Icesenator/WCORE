import { timingSafeEqual } from "node:crypto";

/** Default admin wallet: the platform owner address from shared/factories. */
export const ADMIN_WALLET_ADDRESS = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";

/** Constant-time string comparison to avoid timing attacks on the admin token. */
export function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

interface AdminUserLike {
  id: string;
  address?: string;
}

interface AdminRequestLike {
  headers: Record<string, string | string[] | undefined>;
  user?: AdminUserLike;
}

function isWalletAdmin(req: AdminRequestLike): boolean {
  const adminWallet = (process.env.ADMIN_WALLET_ADDRESS ?? ADMIN_WALLET_ADDRESS).toLowerCase();
  const userAddress = req.user?.address?.toLowerCase();
  return typeof userAddress === "string" && safeEq(userAddress, adminWallet);
}

/**
 * Authorize an admin request via either:
 * 1. The `ADMIN_TOKEN` env var (legacy, for scripts/automations), or
 * 2. A valid SIWE JWT session whose address matches `ADMIN_WALLET_ADDRESS`.
 *
 * Accepts `Authorization: Bearer <token>`, `x-admin-token` header, or the
 * session cookie already decoded into `req.user` by the auth plugin.
 * Returns false when neither path matches.
 */
export function isAdminAuthorized(req: AdminRequestLike): boolean {
  const adminToken = process.env.ADMIN_TOKEN ?? "";
  if (adminToken) {
    const auth = req.headers["authorization"];
    const authStr = Array.isArray(auth) ? auth[0] : auth;
    const xToken = req.headers["x-admin-token"];
    const xTokenStr = Array.isArray(xToken) ? xToken[0] : xToken;
    const bearerMatches = authStr?.startsWith("Bearer ") ? safeEq(authStr.slice(7), adminToken) : false;
    const headerMatches = typeof xTokenStr === "string" && safeEq(xTokenStr, adminToken);
    if (bearerMatches || headerMatches) return true;
  }
  return isWalletAdmin(req);
}
