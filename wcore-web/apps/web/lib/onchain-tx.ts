/**
 * On-chain transaction helpers that work whether or not wagmi has an active
 * connector.
 *
 * Why this exists: the wallet picker connects MetaMask/Rabby/etc. via the raw
 * EIP-6963 path (ConnectButton.connectWith), which never registers a wagmi
 * connector. The login signature works because it talks to the provider
 * directly, but wagmi's `useSendTransaction` / `useSwitchChain` throw
 * "connector not connected" (`@wagmi/core`) because `isConnected` is false.
 *
 * These helpers route through wagmi when a connector is connected, and fall
 * back to the injected provider (`window.ethereum`) otherwise — mirroring the
 * raw `personal_sign` fallback already used for login. The decision logic is
 * pure and unit-tested; the React hook supplies the wagmi senders.
 */

export interface RawProvider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
}

export interface SendTxParams {
  to: string;
  value: bigint;
  data: string;
}

export interface OnChainSenders {
  /** True when wagmi reports a connected connector. */
  wagmiConnected: boolean;
  /** Wagmi `sendTransactionAsync`. Used only when `wagmiConnected`. */
  wagmiSend: (params: SendTxParams) => Promise<string>;
  /** Wagmi `switchChainAsync`-backed helper. Used only when `wagmiConnected`. */
  wagmiSwitch: (chainId: number) => Promise<unknown>;
  /** Raw injected provider, used when wagmi has no connector. */
  rawProvider: RawProvider | undefined;
  /** The wallet address (hex), required for raw `eth_sendTransaction.from`. */
  from: string | null;
}

/** Ask the wallet to switch chains, via wagmi or the raw provider. */
export async function switchChainAny(
  senders: Pick<OnChainSenders, "wagmiConnected" | "wagmiSwitch" | "rawProvider">,
  chainId: number,
): Promise<void> {
  if (senders.wagmiConnected) {
    await senders.wagmiSwitch(chainId);
    return;
  }
  if (!senders.rawProvider) throw new Error("No wallet provider available");
  const chainIdHex = "0x" + chainId.toString(16);
  await senders.rawProvider.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: chainIdHex }],
  });
}

/** Send a transaction, via wagmi or the raw provider. Returns the tx hash. */
export async function sendTransactionAny(
  senders: Pick<OnChainSenders, "wagmiConnected" | "wagmiSend" | "rawProvider" | "from">,
  params: SendTxParams,
): Promise<string> {
  if (senders.wagmiConnected) {
    return senders.wagmiSend(params);
  }
  if (!senders.rawProvider) throw new Error("No wallet provider available");
  if (!senders.from) throw new Error("Wallet address unavailable for transaction");
  const txHash = await senders.rawProvider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: senders.from,
        to: params.to,
        value: "0x" + params.value.toString(16),
        data: params.data,
      },
    ],
  });
  if (typeof txHash !== "string" || !txHash.startsWith("0x")) {
    throw new Error("Wallet did not return a transaction hash");
  }
  return txHash;
}
