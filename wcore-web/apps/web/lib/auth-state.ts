export type AuthStep = "idle" | "ready" | "connecting" | "signing" | "verifying" | "authenticated" | "expired";

export interface RehydratedAuthState {
  address: string | null;
  authStep: AuthStep;
  clearStoredAddress: boolean;
}

export function resolveRehydratedAuth(
  storedAddress: string | null,
  responseStatus: number,
  responseOk: boolean,
  verifiedAddress?: string | null,
): RehydratedAuthState {
  if (!storedAddress) return { address: null, authStep: "idle", clearStoredAddress: false };

  if (responseOk) {
    return {
      address: (verifiedAddress || storedAddress).toLowerCase(),
      authStep: "authenticated",
      clearStoredAddress: false,
    };
  }

  // A 401 means the API session is unavailable, not that the wallet address is
  // forgotten. Keep the address so the user sees "Sign In" instead of losing
  // context and falling back to "Connect Wallet" after a page refresh.
  if (responseStatus === 401) {
    return { address: storedAddress.toLowerCase(), authStep: "ready", clearStoredAddress: false };
  }

  // Network/5xx/CORS hiccups are transient. Preserve the local wallet context.
  return { address: storedAddress.toLowerCase(), authStep: "ready", clearStoredAddress: false };
}

/**
 * Whether a `wcore-auth-expired` event (or any transient session-expiry signal)
 * is allowed to demote the current auth step.
 *
 * A stale `/api/auth/me` issued at page load can resolve with 401 right after a
 * fresh login completes — the resulting refresh→401 chain fires `wcore-auth-expired`
 * a few milliseconds *after* we set "authenticated". If that demotes the session,
 * the user is bounced back to "Sign In" and must click twice.
 *
 * In-flight login steps and an already-authenticated session must be protected.
 */
export function shouldHandleAuthExpired(currentStep: AuthStep): boolean {
  const protectedSteps: AuthStep[] = ["authenticated", "connecting", "signing", "verifying"];
  return !protectedSteps.includes(currentStep);
}
