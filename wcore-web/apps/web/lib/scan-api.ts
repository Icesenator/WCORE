import type { ChainScan } from "@wcore/shared";
import { getApiUrl, apiFetch } from "@/lib/api";
import type { ScanVm } from "@/lib/chain-filter";

const API_URL = getApiUrl();
export const MAX_BATCH_ADDRESSES = 20;

type BatchWallet = { address: string; chains: ChainScan[]; totals: { valueEur: number; tokenCount: number } };
type BatchScanResponse = { wallets?: BatchWallet[]; error?: string };

function abortError(): DOMException {
  return new DOMException("The operation was aborted", "AbortError");
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function requestSignal(signal?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    },
  };
}

async function fetchBatchChunk(body: Record<string, unknown>, signal?: AbortSignal): Promise<BatchScanResponse> {
  const MAX_ATTEMPTS = 3;
  let lastError = "request_failed";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw abortError();
    const request = requestSignal(signal);
    try {
      const res = await apiFetch(`${API_URL}/api/scan/batch`, { method: "POST", body: JSON.stringify(body), signal: request.signal });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        lastError = d.error || `HTTP ${res.status}`;
        if (res.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
          await abortableDelay(2000 * (attempt + 1), signal);
          continue;
        }
        return { error: lastError };
      }
      return await res.json();
    } catch (e) {
      if (signal?.aborted) throw abortError();
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_ATTEMPTS - 1) {
        await abortableDelay(2000 * (attempt + 1), signal);
        continue;
      }
    } finally {
      request.dispose();
    }
  }
  return { error: lastError };
}

export async function fetchBatchScan(
  addresses: string[],
  chs: string[],
  ds: boolean,
  ct: string[] = [],
  forceRefresh = false,
  signal?: AbortSignal,
): Promise<BatchScanResponse> {
  const wallets: BatchWallet[] = [];
  let error: string | undefined;

  for (let i = 0; i < addresses.length; i += MAX_BATCH_ADDRESSES) {
    const body: Record<string, unknown> = {
      addresses: addresses.slice(i, i + MAX_BATCH_ADDRESSES),
      chains: chs,
      deepScan: ds,
    };
    if (ct.length) body.customTokens = ct;
    if (forceRefresh) body.forceRefresh = true;

    const result = await fetchBatchChunk(body, signal);
    if (result.wallets) wallets.push(...result.wallets);
    if (result.error && !error) error = result.error;
  }

  return { wallets, ...(error ? { error } : {}) };
}

export function makeErrorChainScan(chainKey: string, vm: ScanVm, message: string): ChainScan {
  return {
    chainKey,
    chainName: chainKey,
    vm,
    native: null,
    tokens: [],
    totals: { valueEur: 0, tokenCount: 0, pricedCount: 0 },
    errors: [{ stage: "scan", message }],
    degraded: true,
    fxRate: 0.92,
    scanMs: 0,
    phases: { nativeMs: 0, discoveryMs: 0, balancesMs: 0, pricingMs: 0 },
    cachedAt: null,
    scriptVersion: "web",
  };
}

export async function fetchScan(
  addr: string,
  chs: string[],
  ds: boolean,
  ct: string[] = [],
  forceRefresh = false,
  onProgress?: (chains: ChainScan[], done?: number, total?: number) => void,
): Promise<{ chains: ChainScan[]; totals: { valueEur: number; tokenCount: number }; error?: string; message?: string }> {
  const body: Record<string, unknown> = { address: addr, chains: chs, deepScan: ds };
  if (ct.length) body.customTokens = ct;
  if (forceRefresh) body.forceRefresh = true;

  // Async polling: large scans (> 50 chains) OR deep scan (sync 60s timeout too short for log discovery)
  if (chs.length > 50 || ds) {
    try {
      const createRes = await apiFetch(`${API_URL}/api/scan/async`, { method: "POST", body: JSON.stringify(body) });
      if (!createRes.ok) {
        const d = await createRes.json().catch(() => ({}));
        return { chains: [], totals: { valueEur: 0, tokenCount: 0 }, error: d.error || `HTTP ${createRes.status}`, message: d.message };
      }
      const { jobId } = await createRes.json() as { jobId: string };
      // Poll until done
      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pollRes = await apiFetch(`${API_URL}/api/scan/async/${jobId}`);
        if (!pollRes.ok) {
          const d = await pollRes.json().catch(() => ({}));
          return { chains: [], totals: { valueEur: 0, tokenCount: 0 }, error: d.error || `HTTP ${pollRes.status}`, message: d.message };
        }
        const pollData = await pollRes.json() as { status: string; chains: ChainScan[]; totalEur: number; tokenCount: number; errors?: string[]; progress?: { done: number; total: number } };
        if (pollData.chains?.length) {
          onProgress?.(pollData.chains, pollData.progress?.done, pollData.progress?.total);
        }
        if (pollData.status === "done" || pollData.status === "error") {
          if (pollData.status === "error") {
            return { chains: pollData.chains ?? [], totals: { valueEur: pollData.totalEur ?? 0, tokenCount: pollData.tokenCount ?? 0 }, error: "scan_failed", message: pollData.errors?.[0] };
          }
          return { chains: pollData.chains ?? [], totals: { valueEur: pollData.totalEur ?? 0, tokenCount: pollData.tokenCount ?? 0 } };
        }
      }
      return { chains: [], totals: { valueEur: 0, tokenCount: 0 }, error: "timeout", message: "Async scan timed out after 15 minutes" };
    } catch (e) {
      return { chains: [], totals: { valueEur: 0, tokenCount: 0 }, error: "network", message: String(e) };
    }
  }

  // Sync path for small scans
  let lastError: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await apiFetch(`${API_URL}/api/scan`, { method: "POST", body: JSON.stringify(body), signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return { chains: [], totals: { valueEur: 0, tokenCount: 0 }, error: d.error || `HTTP ${res.status}`, message: d.message };
      }
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      lastError = e instanceof Error ? (e.name + ": " + e.message) : String(e);
      console.warn("fetchScan failed for", addr.slice(0, 10), ":", lastError, "(attempt", attempt + 1, "/2)");
      if (attempt < 1) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return { chains: [], totals: { valueEur: 0, tokenCount: 0 }, error: lastError || "unknown" };
}
