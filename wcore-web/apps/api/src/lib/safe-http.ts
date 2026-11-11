// Guards outbound HTTP against SSRF. Every RPC URL — whether from env, chain
// configs, or DB — must clear these checks before any fetch. Without this
// a malicious operator (or a compromised packages/core update) could point
// the API at the Railway metadata endpoint, internal Redis, or localhost.
//
// The hostname check alone is not enough: a perfectly public name can resolve to
// 169.254.169.254. Use `safeFetch`, which validates every address the name
// resolves to, rather than calling fetch directly.

import { lookup } from "node:dns/promises";

// Hostnames that never need a DNS round-trip to be rejected.
const PRIVATE_HOSTNAME = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;

/**
 * Reads an IPv6 address into its eight 16-bit groups, or null when it is malformed.
 * Accepts the compressed form (::) and a dotted IPv4 tail (::ffff:1.2.3.4).
 */
function parseIpv6Groups(ip: string): number[] | null {
  let text = ip;
  const dotted = text.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const bytes = dotted.slice(2, 6).map(Number) as [number, number, number, number];
    if (bytes.some((byte) => byte > 255)) return null;
    text = `${dotted[1]}${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const group of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      groups.push(parseInt(group, 16));
    }
    return groups;
  };
  const head = parse(halves[0]!);
  const tail = halves.length === 2 ? parse(halves[1]!) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

/**
 * True for any address that must never be reached from the API.
 *
 * Written as explicit ranges rather than a regex because the previous regex missed
 * whole families: fd00::/8 (half of the IPv6 unique-local block), CGNAT 100.64/10,
 * and the cloud metadata paths reachable through 0.0.0.0 and IPv4-mapped IPv6.
 */
export function isPrivateAddress(rawIp: string): boolean {
  const ip = rawIp.trim().replace(/^\[|\]$/g, "").toLowerCase();

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return true; // malformed → refuse
    const [a, b] = parts as [number, number, number, number];
    if (a === 0) return true;                        // 0.0.0.0/8, "this network"
    if (a === 10) return true;                       // private
    if (a === 127) return true;                      // loopback
    if (a === 169 && b === 254) return true;         // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true;         // private
    if (a === 192 && b === 0) return true;           // IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true;                       // multicast and reserved
    return false;
  }

  if (ip.includes(":")) {
    const groups = parseIpv6Groups(ip);
    if (!groups) return true;                        // malformed → refuse
    const [g0, g1, , , , g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) addresses are judged on
    // the embedded IPv4 address, whatever their spelling. The URL parser rewrites
    // [::ffff:169.254.169.254] to [::ffff:a9fe:a9fe], which a dotted-only pattern let through.
    // This also covers :: (0.0.0.0) and ::1 (0.0.0.1), both refused.
    if (groups.slice(0, 5).every((group) => group === 0) && (g5 === 0 || g5 === 0xffff)) {
      return isPrivateAddress(`${g6 >> 8}.${g6 & 255}.${g7 >> 8}.${g7 & 255}`);
    }
    if ((g0 & 0xfe00) === 0xfc00) return true;       // fc00::/7 unique-local
    if ((g0 & 0xffc0) === 0xfe80) return true;       // fe80::/10 link-local
    if ((g0 & 0xff00) === 0xff00) return true;       // multicast
    if (g0 === 0x64 && g1 === 0xff9b) return true;   // NAT64, can wrap a private v4
    return false;
  }

  return true; // not an address we can reason about → refuse
}

export class UnsafeUrlError extends Error {
  constructor(reason: string, url: string) {
    super(`unsafe url (${reason}): ${url}`);
    this.name = "UnsafeUrlError";
  }
}

/** Cheap, synchronous check: protocol, obvious private names, and IP literals. */
export function assertPublicHttp(rawUrl: string): URL {
  let url: URL;
  try { url = new URL(rawUrl); }
  catch (_cause) { throw new UnsafeUrlError("invalid_url", rawUrl); }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError(`bad_protocol_${url.protocol}`, rawUrl);
  }
  const host = url.hostname.toLowerCase();
  if (!host) throw new UnsafeUrlError("empty_host", rawUrl);
  if (PRIVATE_HOSTNAME.test(host)) {
    throw new UnsafeUrlError(`private_host_${host}`, rawUrl);
  }
  // An IP literal can be judged immediately, with no DNS involved.
  const bare = host.replace(/^\[|\]$/g, "");
  const isLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes(":");
  if (isLiteral && isPrivateAddress(bare)) {
    throw new UnsafeUrlError(`private_host_${bare}`, rawUrl);
  }
  return url;
}

/**
 * Rejects a hostname whose DNS records point anywhere private.
 *
 * Checks EVERY address, both families. The previous implementation resolved a single
 * IPv4 address, so a name publishing one public A record next to a private AAAA record
 * passed, and it was dead code besides: nothing ever called it.
 *
 * Residual risk, deliberately not papered over: the connection performs its own
 * resolution, so a record that flips between this check and the fetch is still possible.
 * Closing that needs the connection pinned to the address validated here, which the
 * global fetch cannot express without adopting a custom HTTP dispatcher.
 */
export type ResolveAddresses = (hostname: string) => Promise<Array<{ address: string }>>;

const defaultResolve: ResolveAddresses = (hostname) => lookup(hostname, { all: true, verbatim: true });

export async function assertResolvesPublic(url: URL, resolveAddresses: ResolveAddresses = defaultResolve): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return; // literal, already judged

  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolveAddresses(host);
  } catch {
    throw new UnsafeUrlError("dns_lookup_failed", url.toString());
  }
  if (addresses.length === 0) throw new UnsafeUrlError("dns_no_addresses", url.toString());
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new UnsafeUrlError(`dns_rebind_${address}`, url.toString());
    }
  }
}

/**
 * The single outbound HTTP entry point for operator- and chain-supplied URLs.
 *
 * Exists because the guards were previously left to each call site, and the DNS half
 * was never wired at all.
 */
export async function safeFetch(
  rawUrl: string,
  init?: RequestInit,
  opts?: { resolveAddresses?: ResolveAddresses; fetchImpl?: typeof fetch },
): Promise<Response> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  let url = assertPublicHttp(rawUrl);
  let requestInit = init;
  const visited = new Set([redirectKey(url)]);

  for (let redirects = 0; ; redirects++) {
    await assertResolvesPublic(url, opts?.resolveAddresses);
    const response = await fetchImpl(url, { ...requestInit, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    if (redirects >= 5) throw new UnsafeUrlError("too_many_redirects", url.toString());

    let target: URL;
    try { target = assertPublicHttp(new URL(location, url).toString()); }
    catch (cause) {
      if (cause instanceof UnsafeUrlError) throw cause;
      throw new UnsafeUrlError("invalid_redirect", location);
    }
    const key = redirectKey(target);
    if (visited.has(key)) throw new UnsafeUrlError("redirect_loop", target.toString());
    visited.add(key);

    const method = (requestInit?.method ?? "GET").toUpperCase();
    if (response.status === 303 && method !== "GET" && method !== "HEAD"
      || (response.status === 301 || response.status === 302) && method === "POST") {
      const headers = new Headers(requestInit?.headers);
      headers.delete("content-encoding");
      headers.delete("content-language");
      headers.delete("content-location");
      headers.delete("content-type");
      requestInit = { ...requestInit, method: "GET", body: null, headers };
    }
    url = target;
  }
}

function redirectKey(url: URL): string {
  const key = new URL(url);
  key.hash = "";
  return key.toString();
}

export function isPublicHttp(rawUrl: string): boolean {
  try { assertPublicHttp(rawUrl); return true; } catch (_e) { return false; }
}

// Validate a list at module-load. Throws loudly on first bad URL — better to
// fail boot than ship a server that proxies to localhost.
export function assertAllPublicHttp(urls: Iterable<string>, contextLabel: string): void {
  for (const u of urls) {
    try { assertPublicHttp(u); }
    catch (e) {
      const msg = e instanceof UnsafeUrlError ? e.message : String(e);
      throw new Error(`[${contextLabel}] ${msg}`, { cause: e });
    }
  }
}
