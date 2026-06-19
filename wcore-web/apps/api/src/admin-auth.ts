import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison to avoid timing attacks on the admin token. */
export function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Authorize an admin request via the `ADMIN_TOKEN` env var. Accepts either an
 * `Authorization: Bearer <token>` header or an `x-admin-token` header, compared
 * in constant time. Returns false when `ADMIN_TOKEN` is unset (admin disabled).
 */
export function isAdminAuthorized(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const adminToken = process.env.ADMIN_TOKEN ?? "";
  if (!adminToken) return false;
  const auth = req.headers["authorization"];
  const authStr = Array.isArray(auth) ? auth[0] : auth;
  const xToken = req.headers["x-admin-token"];
  const xTokenStr = Array.isArray(xToken) ? xToken[0] : xToken;
  const bearerMatches = authStr?.startsWith("Bearer ") ? safeEq(authStr.slice(7), adminToken) : false;
  const headerMatches = typeof xTokenStr === "string" && safeEq(xTokenStr, adminToken);
  return bearerMatches || headerMatches;
}
