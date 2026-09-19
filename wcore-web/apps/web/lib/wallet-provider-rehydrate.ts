/**
 * Re-adopt the EIP-6963 provider that owns a rehydrated session.
 *
 * The wallet picker connects directly to the announced provider
 * (ConnectButton.connectWith) and never registers a wagmi connector, so on a
 * page reload neither wagmi (`isConnected` is false) nor React state
 * (`rawProvider` is null) can restore it. The JWT session survives, though, so
 * the UI keeps showing an authenticated user while every on-chain action throws
 * "No wallet provider available" — which the GM flow used to disguise as
 * "Could not switch to <chain>".
 *
 * `eth_accounts` is read-only and silent (no prompt), so probing the announced
 * providers with it is safe to run on mount. The provider that owns the
 * rehydrated address becomes the session's raw provider again.
 */

export interface RehydratableProvider {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
}

export interface DiscoveredWallet {
  provider: RehydratableProvider;
}

/** Find the announced provider whose exposed accounts include `address`. */
export async function findProviderForAddress(
  wallets: readonly DiscoveredWallet[],
  address: string | null | undefined,
): Promise<DiscoveredWallet | undefined> {
  const target = (address ?? "").trim().toLowerCase();
  if (!target) return undefined;
  for (const wallet of wallets) {
    try {
      const accounts = await wallet.provider.request({ method: "eth_accounts" });
      if (!Array.isArray(accounts)) continue;
      if (accounts.some((account) => typeof account === "string" && account.toLowerCase() === target)) {
        return wallet;
      }
    } catch {
      // A provider that throws on eth_accounts does not own the address — next.
    }
  }
  return undefined;
}
