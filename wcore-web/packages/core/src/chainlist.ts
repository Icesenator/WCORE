type ChainlistEntry = {
  chainId: number;
  name: string;
  rpc: string[];
  explorers?: { name: string; url: string; standard: string }[];
  icon?: string;
};

let _cache: ChainlistEntry[] | null = null;
let _byChainId: Map<number, ChainlistEntry> | null = null;
let _loading: Promise<void> | null = null;
let _lastAttempt = 0;
const RETRY_MS = 300_000; // Retry every 5 min on failure

const CHAINLIST_URL = "https://chainid.network/chains.json";
const ICON_BASE = "https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains";

export async function loadChainlist(): Promise<void> {
  if (_cache) return;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      const res = await fetch(CHAINLIST_URL, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _cache = await res.json() as ChainlistEntry[];
      _byChainId = new Map(_cache.map((c) => [c.chainId, c]));
      _lastAttempt = Date.now();
    } catch (err) {
      console.warn("chainlist: failed to load, will retry in 5 min:", (err as Error).message);
      _lastAttempt = Date.now();
      _loading = null; // Allow retry on next call
    }
  })();

  return _loading;
}

export function isChainlistReady(): boolean {
  return _cache !== null;
}

export function getChainlistEntry(chainId: number): ChainlistEntry | undefined {
  // Trigger retry if cache is empty and enough time has passed
  if (!_byChainId && Date.now() - _lastAttempt > RETRY_MS) {
    loadChainlist().catch(() => {});
  }
  return _byChainId?.get(chainId);
}

export function getChainIconUrl(chainId: number): string | null {
  const entry = getChainlistEntry(chainId);
  if (!entry?.icon) return null;
  return `${ICON_BASE}/eip155-${chainId}.json`;
}

export function getRpcUrls(chainId: number, limit = 3): string[] {
  const entry = getChainlistEntry(chainId);
  if (!entry?.rpc) return [];
  return entry.rpc.filter((url) => url.startsWith("https://")).slice(0, limit);
}

export function getExplorerUrl(chainId: number): string | null {
  const entry = getChainlistEntry(chainId);
  if (!entry?.explorers?.length) return null;
  const main = entry.explorers.find((e) => e.standard === "EIP3091") ?? entry.explorers[0];
  return main?.url ?? null;
}

export function getChainlist(): ChainlistEntry[] | null {
  return _cache;
}
