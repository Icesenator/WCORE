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
 * Ignore only expiry events issued by requests from an older auth generation.
 * A definitive access+refresh 401 in the current generation must transition
 * the session out even when the UI is currently authenticated.
 */
export function shouldHandleAuthExpired(eventGeneration: number, currentGeneration: number): boolean {
  return eventGeneration === currentGeneration;
}
