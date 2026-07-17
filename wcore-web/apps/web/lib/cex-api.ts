import { apiFetch } from "@/lib/api";

export type CexFetcher = (path: string, init?: RequestInit) => Promise<Response>;

export const CEX_REQUEST_TIMEOUT_MS = 30_000;

export async function boundedApiFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = CEX_REQUEST_TIMEOUT_MS,
  fetcher: CexFetcher = apiFetch,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`CEX request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetcher(path, { ...init, signal: controller.signal }),
      timeout,
    ]);
    const body = await Promise.race([response.arrayBuffer(), timeout]);
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function cexFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = CEX_REQUEST_TIMEOUT_MS,
  fetcher: CexFetcher = apiFetch,
): Promise<Response> {
  return boundedApiFetch(path, init, timeoutMs, fetcher);
}
