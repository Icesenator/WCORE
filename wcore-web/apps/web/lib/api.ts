const DEFAULT_API_URL = "http://127.0.0.1:4000";

export function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;
}

// Result of an auth refresh attempt.
//   "ok"        — refresh succeeded, a fresh session cookie is set.
//   "expired"   — refresh endpoint returned 401: the session is definitively dead.
//   "transient" — network/5xx/CORS hiccup: the existing access cookie may still
//                 be valid, so we MUST NOT tear down the session.
type RefreshResult = "ok" | "expired" | "transient";

let _refreshPromise: Promise<RefreshResult> | null = null;

async function doRefresh(): Promise<RefreshResult> {
  try {
    const res = await fetch(`${getApiUrl()}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (res.status === 401) return "expired";
    if (res.ok) return "ok";
    // 5xx and other non-401 statuses are transient — do not log out.
    return "transient";
  } catch {
    // Network error — transient, don't log out. The access cookie survives.
    return "transient";
  } finally {
    _refreshPromise = null;
  }
}

/**
 * De-duplicated session refresh. Concurrent 401s during navigation share one
 * in-flight refresh instead of each rotating the single-use refresh token
 * (which would make all-but-one lose the rotation race and falsely "expire").
 */
async function ensureAuth(): Promise<RefreshResult> {
  if (!_refreshPromise) _refreshPromise = doRefresh();
  return _refreshPromise;
}

export async function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const apiUrl = getApiUrl();
  const fullUrl = url.startsWith("http") ? url : `${apiUrl}${url}`;
  const hasBody = opts.body !== undefined && opts.body !== null;
  const defaultOpts: RequestInit = {
    credentials: "include",
    ...(hasBody ? { headers: { "Content-Type": "application/json" } } : {}),
    ...opts,
  };

  let res = await fetch(fullUrl, defaultOpts);

  // Auto-refresh on 401.
  if (res.status === 401 && typeof window !== "undefined") {
    const refresh = await ensureAuth();

    // Only a *definitive* refresh 401 means the session is dead. In that case
    // tear it down. A transient refresh failure (network/5xx) must never demote
    // an authenticated session: the access cookie may still be valid and a later
    // request — or a page refresh — will succeed without any wallet action.
    if (refresh === "expired") {
      window.dispatchEvent(new Event("wcore-auth-expired"));
      return res;
    }

    // Refresh ok (or transient) → retry once. A 401 on the retry is treated as
    // an endpoint-level authorization result (or a transient race), NOT as a
    // session expiry — so we do NOT dispatch wcore-auth-expired here. This is the
    // fix for "randomly bounced to Sign In while navigating, fixed by refresh".
    res = await fetch(fullUrl, defaultOpts);
  }

  return res;
}

export async function apiPost(url: string, body: unknown): Promise<Response> {
  return apiFetch(url, { method: "POST", body: JSON.stringify(body) });
}
