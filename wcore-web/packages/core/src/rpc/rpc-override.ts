// Server-side RPC endpoint override, read from WCORE_RPC_OVERRIDES:
//   {"B3": ["https://provider-one/...", "https://provider-two/..."]}
// Keyed provider URLs are secrets: they come only from the server environment, never
// from the repository, and are never echoed in errors. Any invalid entry rejects the
// whole configuration: reading it throws a redacted error, so the API refuses to start
// rather than silently scanning an overridden chain without its quorum.

import { getChain } from "../chains/index.js";

type Env = Record<string, string | undefined>;

export interface RpcOverrideParse {
  overrides: Record<string, string[]>;
  error?: string;
}

const MAX_ENDPOINTS_PER_CHAIN = 5;
const CHAIN_KEY = /^[A-Z0-9_]{1,32}$/;
// The strict quorum needs two providers: two keys at one provider would agree by construction.
const MIN_PROVIDERS = 2;

// Last two host labels. Coarse (no public-suffix list), so it errs towards refusing.
function providerDomain(endpoint: string): string {
  return new URL(endpoint).hostname.toLowerCase().split(".").slice(-2).join(".");
}

// Public, named hosts only: an IP literal, a single-label name or embedded credentials
// would be refused by the API's SSRF guard at boot, with the URL in the message.
function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && !url.username && !url.password
      && host.includes(".")
      && !/(?:\.(?:localhost|local|internal)|\.)$/.test(host)
      && !url.hash
      && !/^[\d.]+$/.test(host)
      && !host.startsWith("[");
  } catch {
    return false;
  }
}

export function parseRpcOverrides(raw: string | undefined): RpcOverrideParse {
  if (raw === undefined || raw.trim() === "") return { overrides: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { overrides: {}, error: "WCORE_RPC_OVERRIDES is not valid JSON" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { overrides: {}, error: "WCORE_RPC_OVERRIDES must map chain keys to endpoint lists" };
  }
  const overrides: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(parsed as Record<string, unknown>)) {
    const chainKey = key.trim().toUpperCase();
    // The key is operator input too: never echo it unless it looks like a chain key.
    if (!CHAIN_KEY.test(chainKey)) {
      return { overrides: {}, error: "WCORE_RPC_OVERRIDES has an entry whose key is not a chain key" };
    }
    const chain = getChain(chainKey);
    if (!chain || chain.vm !== "EVM") {
      return { overrides: {}, error: "WCORE_RPC_OVERRIDES contains an unknown or non-EVM chain" };
    }
    if (!Array.isArray(list) || list.length < MIN_PROVIDERS || list.length > MAX_ENDPOINTS_PER_CHAIN) {
      return { overrides: {}, error: `WCORE_RPC_OVERRIDES entry ${chainKey} must list ${MIN_PROVIDERS} to ${MAX_ENDPOINTS_PER_CHAIN} endpoints` };
    }
    if (!list.every(validEndpoint) || new Set(list).size !== list.length) {
      return { overrides: {}, error: `WCORE_RPC_OVERRIDES entry ${chainKey} must contain distinct https URLs on public named hosts` };
    }
    if (new Set(list.map(providerDomain)).size !== list.length) {
      return { overrides: {}, error: `WCORE_RPC_OVERRIDES entry ${chainKey} must use at least ${MIN_PROVIDERS} different provider domains` };
    }
    overrides[chainKey] = [...list];
  }
  return { overrides };
}

// Called at API startup, before listening: logs the redacted reason, then throws.
// The message never contains an URL.
export function validateRpcOverridesAtStartup(env: Env = process.env, warn: (message: string) => void = console.warn): void {
  const { error } = parseRpcOverrides(env.WCORE_RPC_OVERRIDES);
  if (error) {
    warn(error);
    throw new Error(error);
  }
}

export function getRpcOverride(chainKey: string, env: Env = process.env): string[] | undefined {
  const parsed = parseRpcOverrides(env.WCORE_RPC_OVERRIDES);
  if (parsed.error) throw new Error(parsed.error);
  return parsed.overrides[chainKey.trim().toUpperCase()];
}

export interface ConsensusConfig {
  minRpcs: number;
  maxRpcs: number;
  strictMinRpcs: boolean;
}

// With an override the endpoints are paid, independent providers chosen on purpose:
// consensus must come from at least two of them, never from whichever one is left
// after the health filter blocks the others.
export function consensusConfigFor(
  chainKey: string,
  chain: { RPC?: { CONSENSUS_MIN_RPCS?: unknown; CONSENSUS_MAX_RPCS?: unknown } } | undefined,
  env: Env = process.env,
): ConsensusConfig {
  const minRpcs = Number(chain?.RPC?.CONSENSUS_MIN_RPCS ?? 2);
  const maxRpcs = Number(chain?.RPC?.CONSENSUS_MAX_RPCS ?? 3);
  if (!getRpcOverride(chainKey, env)) return { minRpcs, maxRpcs, strictMinRpcs: false };
  const strictMin = Math.max(2, minRpcs);
  return { minRpcs: strictMin, maxRpcs: Math.max(strictMin, maxRpcs), strictMinRpcs: true };
}

// Diagnostics name an overridden endpoint by an opaque id (its host can identify the
// account), and any other endpoint by its host only.
export function redactRpcEndpoint(endpoint: string, env: Env = process.env): string {
  const { overrides } = parseRpcOverrides(env.WCORE_RPC_OVERRIDES);
  for (const [chainKey, list] of Object.entries(overrides)) {
    const index = list.indexOf(endpoint);
    if (index >= 0) return `override:${chainKey}#${index + 1}`;
  }
  try {
    new URL(endpoint);
    return "rpc-provider";
  } catch {
    return "invalid-endpoint";
  }
}
