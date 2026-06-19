// Guards outbound HTTP against SSRF. Every RPC URL — whether from env, chain
// configs, or DB — must clear assertPublicHttp before any fetch. Without this
// a malicious operator (or a compromised packages/core update) could point
// the API at the Railway metadata endpoint, internal Redis, or localhost.

import { lookup } from "node:dns";

// Covers loopback, link-local, private ranges, IPv4-mapped IPv6, and 0.0.0.0.
const PRIVATE_HOSTNAME = /^(localhost|.*\.local|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1|::ffff:|fc00:|fe80:)/i;

export class UnsafeUrlError extends Error {
  constructor(reason: string, url: string) {
    super(`unsafe url (${reason}): ${url}`);
    this.name = "UnsafeUrlError";
  }
}

export function assertPublicHttp(rawUrl: string): URL {
  let url: URL;
  try { url = new URL(rawUrl); }
  catch (_cause) { throw new UnsafeUrlError("invalid_url", rawUrl); }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError(`bad_protocol_${url.protocol}`, rawUrl);
  }
  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOSTNAME.test(host)) {
    throw new UnsafeUrlError(`private_host_${host}`, rawUrl);
  }
  return url;
}

// DNS rebinding protection: resolve the hostname and verify the IP is not private.
// Must be called before fetch() since DNS could resolve to a private IP between
// the initial hostname check and the actual connection.
export async function assertNoDnsRebind(url: URL): Promise<void> {
  const hostname = url.hostname;
  // Skip DNS check for IP literals (already checked by assertPublicHttp)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) return;
  try {
    const { address } = await new Promise<{ address: string }>((resolve, reject) =>
      lookup(hostname, { family: 4 }, (err, addr) => err ? reject(err) : resolve({ address: addr }))
    );
    if (PRIVATE_HOSTNAME.test(address)) {
      throw new UnsafeUrlError(`dns_rebind_${address}`, url.toString());
    }
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw e;
    // DNS resolution failure is non-fatal — the fetch will fail naturally
  }
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
