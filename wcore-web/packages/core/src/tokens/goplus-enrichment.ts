// GoPlus Security API client — batched, timeout-guarded, fail-graceful.
// Design: docs/superpowers/specs/2026-08-23-scam-detector-auto-blocking-design.md §3.1
// Verdicts are cached upstream (scam_verdicts table); this client never caches.

export interface GoPlusVerdict {
  available: boolean;
  isHoneypot?: boolean;
  canTakeBackOwnership?: boolean;
  isBlacklisted?: boolean;
  slippageModifiable?: boolean;
  ownerPercent?: number;
  isOpenSource?: boolean;
  isInDex?: boolean;
}

const UNAVAILABLE = (): GoPlusVerdict => ({ available: false });
const BATCH_SIZE = 30;

function bool(v: unknown): boolean {
  return v === "1" || v === 1 || v === true;
}
function pct(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

type RawEntry = Record<string, unknown>;

export function parseGoPlusResponse(payload: unknown): Map<string, GoPlusVerdict> {
  const out = new Map<string, GoPlusVerdict>();
  const result = (payload as { result?: Record<string, RawEntry> } | null)?.result ?? {};
  for (const [addr, raw] of Object.entries(result)) {
    out.set(addr.toLowerCase(), {
      available: true,
      isHoneypot: bool(raw.is_honeypot),
      canTakeBackOwnership: bool(raw.can_take_back_ownership),
      isBlacklisted: bool(raw.is_blacklisted),
      slippageModifiable: bool(raw.slippage_modifiable),
      ownerPercent: pct(raw.owner_percent),
      isOpenSource: bool(raw.is_open_source),
      isInDex: bool(raw.is_in_dex),
    });
  }
  return out;
}

export interface FetchOpts { timeoutMs?: number; }

export async function fetchGoPlusVerdicts(
  chainId: number,
  contracts: string[],
  opts: FetchOpts = {},
): Promise<Map<string, GoPlusVerdict>> {
  const merged = new Map<string, GoPlusVerdict>();
  for (let i = 0; i < contracts.length; i += BATCH_SIZE) {
    const batch = contracts.slice(i, i + BATCH_SIZE).map((a) => a.toLowerCase());
    const url = `https://api.gopluslabs.com/api/v1/token_security/${chainId}?contract_addresses=${batch.join(",")}`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5_000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`goplus http ${res.status}`);
        for (const [k, v] of parseGoPlusResponse(await res.json())) merged.set(k, v);
        for (const a of batch) if (!merged.has(a)) merged.set(a, UNAVAILABLE());
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Fail-graceful: no signal added, scan continues unchanged (design §2.5).
      for (const a of batch) merged.set(a, UNAVAILABLE());
    }
  }
  return merged;
}
