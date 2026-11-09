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

// True when the entries trust nothing beyond this host: the same effect as leaving
// TRUST_PROXY unset, however it is spelled.
function loopbackOnly(parsed: string): boolean {
  return parsed.split(",").every((entry) => {
    if (entry === "loopback") return true;
    const [address = "", range] = entry.split("/");
    if (isIP(address) === 6) return address === "::1" && (range === undefined || range === "128");
    return isIP(address) === 4 && address.startsWith("127.") && (range === undefined || Number(range) >= 8);
  });
}

export type TrustProxyAssessment =
  | { ok: true; mode: "loopback-only" }
  | { ok: true; mode: "addresses"; entries: number }
  | { ok: false; reason: string };

export function assessTrustProxy(raw: string | undefined): TrustProxyAssessment {
  try {
    const parsed = parseTrustProxy(raw);
    if (loopbackOnly(parsed)) return { ok: true, mode: "loopback-only" };
    return { ok: true, mode: "addresses", entries: parsed.split(",").length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// 2026-11-08 — A trusted proxy must never be an Internet-routable address. parseTrustProxy accepts
// ranges up to /8 (IPv4) and /16 (IPv6), which can spill into public space (100.0.0.0/8 holds the
// public 100.0.0.0/10). A real client from that space, relayed by the platform proxy, would then be
// "trusted" and its own X-Forwarded-For entries adopted as request.ip. Each entry is therefore
// reduced to the non-routable blocks it covers, never widened; fully public entries are removed.
const NON_PUBLIC_V4: ReadonlyArray<[string, number]> = [["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16]];
const NON_PUBLIC_V6: ReadonlyArray<[string, number]> = [["::1", 128], ["fc00::", 7], ["fe80::", 10]];

function v4ToBig(address: string): bigint {
  return address.split(".").reduce((acc, octet) => (acc << 8n) | BigInt(Number(octet)), 0n);
}
function v6ToBig(address: string): bigint {
  let text = address.toLowerCase();
  const v4Tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4Tail) { const n = v4ToBig(v4Tail[1]!); text = text.slice(0, -v4Tail[1]!.length) + ((n >> 16n).toString(16)) + ":" + ((n & 0xffffn).toString(16)); }
  const [head = "", tail] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return groups.reduce((acc, group) => (acc << 16n) | BigInt(parseInt(group || "0", 16)), 0n);
}
function bigToV4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 255n)).join(".");
}
function bigToV6(value: bigint): string {
  const groups = Array.from({ length: 8 }, (_, i) => ((value >> BigInt((7 - i) * 16)) & 0xffffn).toString(16));
  const text = groups.join(":").replace(/(^|:)0(:0)+(:|$)/, "::");
  return text.replace(/^:::?/, "::").replace(/:::$/, "::");
}

interface Cidr { family: 4 | 6; base: bigint; prefix: number }
function toCidr(entry: string): Cidr {
  const [address = "", range] = entry.split("/");
  const family = isIP(address) as 4 | 6;
  const bits = family === 4 ? 32 : 128;
  const prefix = range === undefined ? bits : /^\d{1,3}$/.test(range) ? Number(range) : (netmaskPrefix(range) ?? bits);
  const raw = family === 4 ? v4ToBig(address) : v6ToBig(address);
  const mask = prefix === 0 ? 0n : ((1n << BigInt(bits)) - 1n) ^ ((1n << BigInt(bits - prefix)) - 1n);
  return { family, base: raw & mask, prefix };
}
function contains(outer: Cidr, inner: Cidr): boolean {
  if (outer.family !== inner.family || outer.prefix > inner.prefix) return false;
  const bits = outer.family === 4 ? 32 : 128;
  const shift = BigInt(bits - outer.prefix);
  return (inner.base >> shift) === (outer.base >> shift);
}
function formatCidr(c: Cidr): string {
  return `${c.family === 4 ? bigToV4(c.base) : bigToV6(c.base)}/${c.prefix}`;
}

export interface TrustProxyScope { value: string; entries: number; clipped: number; dropped: number; aliases: string[]; v4: number; v6: number }

/** Reduces a parsed TRUST_PROXY value to non-routable address space. Never widens trust. */
export function restrictTrustProxyToNonPublic(parsed: string): TrustProxyScope {
  const kept: string[] = [];
  const aliases: string[] = [];
  let clipped = 0, dropped = 0, v4 = 0, v6 = 0;
  for (const entry of parsed.split(",").map((e) => e.trim()).filter(Boolean)) {
    if (FASTIFY_ALIASES.has(entry) || entry === "loopback") {
      // Fastify aliases only name non-routable ranges (loopback, link-local, private/ULA).
      kept.push(entry); aliases.push(entry); continue;
    }
    const cidr = toCidr(entry);
    const blocks = (cidr.family === 4 ? NON_PUBLIC_V4 : NON_PUBLIC_V6).map(([a, p]) => toCidr(`${a}/${p}`));
    if (blocks.some((block) => contains(block, cidr))) { kept.push(entry); if (cidr.family === 4) v4++; else v6++; continue; }
    const inside = blocks.filter((block) => contains(cidr, block));
    if (inside.length === 0) { dropped++; continue; }
    clipped++;
    for (const block of inside) { kept.push(formatCidr(block)); if (block.family === 4) v4++; else v6++; }
  }
  const value = kept.length ? kept.join(",") : "loopback";
  return { value, entries: kept.length, clipped, dropped, aliases, v4, v6 };
}

/** One startup line describing the effective trust scope. It never contains an address. */
export function describeTrustProxyScope(scope: TrustProxyScope): string {
  const mode = loopbackOnly(scope.value) ? "loopback-only" : "addresses";
  return `TRUST_PROXY scope: mode=${mode} entries=${scope.entries} v4=${scope.v4} v6=${scope.v6} aliases=${scope.aliases.join("+") || "none"} clipped=${scope.clipped} dropped=${scope.dropped} publicSpace=excluded`;
}

// 2026-11-09 — Position-bound trust (P0-SEC-TRUST-PROXY-PUBLIC-RANGES). Measured on production:
// client -> Railway public edge (POP) -> internal proxy (100.64.0.0/10) -> container. The public
// entries of TRUST_PROXY are the edges' addresses: dropping them makes the edge request.ip for every
// visitor (one shared identity); trusting them at any position lets a client whose real address is in
// such a range have its own forged X-Forwarded-For entry adopted. Trust is therefore bound to the hop:
//   hop 0 (directly connected peer)          -> a NON-public entry only (internal proxy);
//   hop 1 (appended by that internal proxy)  -> a PUBLIC entry only (edge);
//   hop 2 and beyond                         -> never. request.ip is what the edge appended: the client.
// An entry that mixes public and non-public space keeps only its non-public blocks (public part dropped).
const ALIAS_BLOCKS: Readonly<Record<string, ReadonlyArray<string>>> = {
  loopback: ["127.0.0.0/8", "::1/128"],
  linklocal: ["169.254.0.0/16", "fe80::/10"],
  uniquelocal: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7"],
};

export interface PositionalTrust {
  trust: (address: string, hop: number) => boolean;
  internal: number;
  edges: number;
  dropped: number;
  aliases: string[];
}

function addressCidr(address: string): Cidr | null {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address.trim());
  const value = mapped ? mapped[1]! : address.trim();
  return isIP(value) ? toCidr(value) : null;
}

/** Builds the Fastify trustProxy function from a parsed TRUST_PROXY value. Never trusts beyond hop 1. */
export function positionalTrustProxy(parsed: string): PositionalTrust {
  const internal: Cidr[] = [];
  const edges: Cidr[] = [];
  const aliases: string[] = [];
  let internalEntries = 0, edgeEntries = 0, dropped = 0;
  for (const entry of parsed.split(",").map((e) => e.trim()).filter(Boolean)) {
    const alias = ALIAS_BLOCKS[entry];
    if (alias) { aliases.push(entry); internalEntries++; for (const block of alias) internal.push(toCidr(block)); continue; }
    const cidr = toCidr(entry);
    const blocks = (cidr.family === 4 ? NON_PUBLIC_V4 : NON_PUBLIC_V6).map(([a, p]) => toCidr(`${a}/${p}`));
    if (blocks.some((block) => contains(block, cidr))) { internal.push(cidr); internalEntries++; continue; }
    const inside = blocks.filter((block) => contains(cidr, block));
    if (inside.length === 0) { edges.push(cidr); edgeEntries++; continue; }
    internal.push(...inside); internalEntries++; dropped++;
  }
  const within = (list: Cidr[], address: string) => {
    const c = addressCidr(address);
    return c !== null && list.some((net) => contains(net, c));
  };
  const trust = (address: string, hop: number) => (hop === 0 ? within(internal, address) : hop === 1 ? within(edges, address) : false);
  return { trust, internal: internalEntries, edges: edgeEntries, dropped, aliases };
}

/** One startup line describing the positional trust. It never contains an address. */
export function describePositionalTrust(scope: PositionalTrust): string {
  return `TRUST_PROXY scope: mode=positional internal=${scope.internal} edges=${scope.edges} aliases=${scope.aliases.join("+") || "none"} dropped=${scope.dropped} maxHops=2 publicSpace=edge-hop-only`;
}

// Behind an HTTP proxy, "loopback" makes request.ip the proxy's address: every anonymous
// client then shares one rate-limit identity and one scan-job principal. That is safe
// against spoofing but not what production wants, so it is said once at startup.
export function trustProxyStartupWarning(parsed: string, isProduction: boolean): string | null {
  if (!isProduction || !loopbackOnly(parsed)) return null;
  return "TRUST_PROXY is unset: request.ip is the directly connected peer, so behind a proxy all anonymous clients share one rate-limit identity. Set it to the verified proxy addresses (see docs/cloud/TRUST_PROXY_SECURITY.md)";
}
