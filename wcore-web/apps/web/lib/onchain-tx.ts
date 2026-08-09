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
 * These helpers keep an explicitly selected raw provider authoritative and
 * otherwise route through wagmi. The decision logic is pure and unit-tested;
 * the React hook supplies the provider and wagmi senders.
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
  /** Wagmi `sendTransactionAsync`. Used when no raw provider is selected. */
  wagmiSend: (params: SendTxParams) => Promise<string>;
  /** Wagmi `switchChainAsync`-backed helper. Used when no raw provider is selected. */
  wagmiSwitch: (chainId: number) => Promise<unknown>;
  /** Explicitly selected EIP-6963 provider, authoritative when present. */
  rawProvider: RawProvider | undefined;
  /** The wallet address (hex), required for raw `eth_sendTransaction.from`. */
  from: string | null;
}

export interface TransactionReceipt {
  status: "0x1" | "0x0";
  logs: Array<{ address: string; topics: readonly string[] }>;
}

export type PublicReceiptWaiter = (txHash: string, timeoutMs: number) => Promise<{
  status: "success" | "reverted";
  logs: Array<{ address: string; topics: readonly string[] }>;
}>;

/** Ask the wallet to switch chains, via wagmi or the raw provider. */
export async function switchChainAny(
  senders: Pick<OnChainSenders, "wagmiConnected" | "wagmiSwitch" | "rawProvider">,
  chainId: number,
): Promise<void> {
  if (senders.rawProvider) {
    const chainIdHex = "0x" + chainId.toString(16);
    await senders.rawProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
    return;
  }
  if (!senders.wagmiConnected) throw new Error("No wallet provider available");
  await senders.wagmiSwitch(chainId);
}

/** Send a transaction, via wagmi or the raw provider. Returns the tx hash. */
export async function sendTransactionAny(
  senders: Pick<OnChainSenders, "wagmiConnected" | "wagmiSend" | "rawProvider" | "from">,
  params: SendTxParams,
): Promise<string> {
  if (senders.rawProvider) {
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
  if (!senders.wagmiConnected) throw new Error("No wallet provider available");
  return senders.wagmiSend(params);
}

/** Poll the selected raw wallet, or a wagmi public client for WalletConnect. */
export async function waitForTransactionReceiptAny(
  rawProvider: RawProvider | undefined,
  publicWait: PublicReceiptWaiter | undefined,
  txHash: string,
  timeoutMs: number,
): Promise<TransactionReceipt> {
  if (!rawProvider) {
    if (!publicWait) throw new Error("No receipt provider available");
    const receipt = await publicWait(txHash, timeoutMs);
    return { status: receipt.status === "success" ? "0x1" : "0x0", logs: receipt.logs };
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const receipt = await rawProvider.request({
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }) as TransactionReceipt | null;
      if (receipt?.status === "0x1" || receipt?.status === "0x0") return receipt;
    } catch {
      // Keep polling through a transient wallet RPC failure.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Transaction validation timeout (${Math.round(timeoutMs / 1000)}s).`);
}
