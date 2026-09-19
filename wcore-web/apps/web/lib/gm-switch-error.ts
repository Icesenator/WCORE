/**
 * Pure message builder for an on-chain GM chain-switch failure.
 *
 * `useOnChainGm` used to collapse every `switchChainAny` error into the same
 * "Could not switch to <chain>. Check your wallet and try again." string. That
 * hid the real cause and gave the user nothing to act on: a lost EIP-6963
 * provider ("No wallet provider available"), a user rejection (4001), a pending
 * wallet request (-32002) and an unrecognized chain (4902) all looked identical.
 * The message now names the actual failure.
 */

export interface WalletErrorLike {
  code?: unknown;
  message?: unknown;
  data?: { originalError?: { code?: unknown; message?: unknown } };
}

const NO_PROVIDER = /no wallet provider available/i;

/** Normalize the wallet error codes that arrive as number, numeric string or nested. */
export function getWalletErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as WalletErrorLike;
  for (const candidate of [e.code, e.data?.originalError?.code]) {
    if (typeof candidate === "number" && !Number.isNaN(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim() !== "" && !Number.isNaN(Number(candidate))) {
      return Number(candidate);
    }
  }
  return undefined;
}

/** Best-effort human message from an Error or a wallet error object. */
export function getWalletErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const e = error as WalletErrorLike;
    if (typeof e.message === "string" && e.message) return e.message;
    const inner = e.data?.originalError?.message;
    if (typeof inner === "string" && inner) return inner;
  }
  return "";
}

export function describeGmSwitchError(chainLabel: string, error: unknown): string {
  const code = getWalletErrorCode(error);
  const message = getWalletErrorMessage(error);

  // The session lost its EIP-6963 provider (typical after a reload). This is not
  // a chain problem, so do not tell the user to "check your wallet".
  if (NO_PROVIDER.test(message)) {
    return "Your wallet is no longer connected to WCORE. Reconnect your wallet, then try again.";
  }
  if (code === 4001) return `You rejected the switch to ${chainLabel} in your wallet.`;
  if (code === -32002) {
    return "Your wallet already has a pending request. Open your wallet, approve or dismiss it, then try again.";
  }
  if (code === 4902) {
    return `Your wallet does not know ${chainLabel} and could not add it automatically. Add the network in your wallet, then retry.`;
  }
  if (code !== undefined) {
    return `Could not switch to ${chainLabel} (wallet error ${code}). Check your wallet and try again.`;
  }
  if (message) return `Could not switch to ${chainLabel}: ${message}`;
  return `Could not switch to ${chainLabel}. Check your wallet and try again.`;
}
