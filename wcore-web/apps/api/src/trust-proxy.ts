import { isIP } from "node:net";

// TRUST_PROXY names the proxies whose forwarded headers are believed. Only addresses and
// ranges are accepted: `true` and hop counts do not authenticate the connecting peer
// (GHSA-3m5p-2c4r-xxw2). This module has no project imports so the deploy preflight
// (scripts/railway-deploy.mjs) applies the same rules before an image is published.

const FASTIFY_ALIASES = new Set(["loopback", "linklocal", "uniquelocal"]);
const MAX_ENTRIES = 64;
// A range wider than this trusts a forwarded header from most of the internet:
// "0.0.0.0/1,128.0.0.0/1" is `true` written as two entries.
const MIN_PREFIX = { 4: 8, 6: 16 } as const;
const HOP_COUNT = /^(?:true|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|0x[0-9a-f]+)$/i;

function fail(rule: string): never {
  // The value itself is never echoed: the preflight reports this message from a
  // variable read out of the deployment platform.
  throw new Error(`TRUST_PROXY ${rule}; configure the IP addresses or CIDR ranges of the verified proxies`);
}

function netmaskPrefix(mask: string): number | null {
  if (isIP(mask) !== 4) return null;
  const bits = mask.split(".").map((octet) => Number(octet).toString(2).padStart(8, "0")).join("");
  const firstZero = bits.indexOf("0");
  if (!/^1*0*$/.test(bits)) return null;
  return firstZero === -1 ? 32 : firstZero;
}

function validateEntry(entry: string): void {
  if (!entry || HOP_COUNT.test(entry)) fail("no longer accepts true, hop counts or empty entries");
  if (FASTIFY_ALIASES.has(entry)) return;
  const [address, range, extra] = entry.split("/");
  const family = isIP(address ?? "") as 0 | 4 | 6;
  if (family === 0 || extra !== undefined) fail("contains an entry that is neither an IP address nor a CIDR range");
  if (range === undefined) return;
  const prefix = /^\d{1,3}$/.test(range) ? Number(range) : family === 4 ? netmaskPrefix(range) : null;
  if (prefix === null || prefix > (family === 4 ? 32 : 128)) fail("contains an invalid CIDR prefix or netmask");
  if (prefix < MIN_PREFIX[family]) fail(`contains a range too broad to identify a proxy (IPv4 /${MIN_PREFIX[4]} and IPv6 /${MIN_PREFIX[6]} at most)`);
}

export function parseTrustProxy(raw: string | undefined): string {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "false" || !normalized) return "loopback";
  const entries = normalized.split(",").map((entry) => entry.trim());
  if (entries.length > MAX_ENTRIES) fail(`accepts at most ${MAX_ENTRIES} entries`);
  for (const entry of entries) validateEntry(entry);
  return entries.join(",");
}

export type TrustProxyAssessment =
  | { ok: true; mode: "loopback-only" }
  | { ok: true; mode: "addresses"; entries: number }
  | { ok: false; reason: string };

export function assessTrustProxy(raw: string | undefined): TrustProxyAssessment {
  try {
    const parsed = parseTrustProxy(raw);
    if (parsed === "loopback" && !raw?.trim().toLowerCase().includes("loopback")) return { ok: true, mode: "loopback-only" };
    return { ok: true, mode: "addresses", entries: parsed.split(",").length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// Behind an HTTP proxy, "loopback" makes request.ip the proxy's address: every anonymous
// client then shares one rate-limit identity and one scan-job principal. That is safe
// against spoofing but not what production wants, so it is said once at startup.
export function trustProxyStartupWarning(parsed: string, isProduction: boolean): string | null {
  if (!isProduction || parsed !== "loopback") return null;
  return "TRUST_PROXY is unset: request.ip is the directly connected peer, so behind a proxy all anonymous clients share one rate-limit identity. Set it to the verified proxy addresses (see docs/cloud/TRUST_PROXY_SECURITY.md)";
}
