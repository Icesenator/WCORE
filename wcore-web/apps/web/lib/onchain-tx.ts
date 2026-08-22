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
  /**
   * EIP-3085 params for chains the wallet may not know yet. When present and
   * the raw switch fails (4902 "Unrecognized chain ID" or a wallet-specific
   * quirk code), `switchChainAny` falls back to `wallet_addEthereumChain`.
   * NO retry of `wallet_switchEthereumChain` after add: the add flow already
   * selects the chain, and a retry can race into 4902 again (KCC lesson,
   * see app/dev/deploy/chain-switch.ts).
   */
  lookupAddChain?: (chainId: number) => AddEthereumChainParams | null;
  /** The wallet address (hex), required for raw `eth_sendTransaction.from`. */
  from: string | null;
}

export interface TransactionReceipt {
  status: "0x1" | "0x0";
  logs: Array<{ address: string; topics: readonly string[] }>;
}

/** EIP-3085 params for `wallet_addEthereumChain`. */
export interface AddEthereumChainParams {
  chainId: string; // hex
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
}

/**
 * Wallet error codes arrive as number, numeric string ("4902"), or nested at
 * `data.originalError.code` (wagmi pattern). Normalize all three.
 */
function getErrorCode(e: unknown): number | undefined {
  if (!e || typeof e !== "object") return undefined;
  const err = e as { code?: unknown; data?: { originalError?: { code?: unknown } } };
  if (typeof err.code === "number") return err.code;
  if (typeof err.code === "string") {
    const n = Number(err.code);
    if (!Number.isNaN(n)) return n;
  }
  const inner = err.data?.originalError?.code;
  if (typeof inner === "number") return inner;
  if (typeof inner === "string") {
    const n = Number(inner);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

export type PublicReceiptWaiter = (txHash: string, timeoutMs: number) => Promise<{
  status: "success" | "reverted";
  logs: Array<{ address: string; topics: readonly string[] }>;
}>;

/** Ask the wallet to switch chains, via wagmi or the raw provider. */
export async function switchChainAny(
  senders: Pick<
    OnChainSenders,
    "wagmiConnected" | "wagmiSwitch" | "rawProvider" | "lookupAddChain"
  >,
  chainId: number,
): Promise<void> {
  if (senders.rawProvider) {
    const chainIdHex = "0x" + chainId.toString(16);
    try {
      await senders.rawProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
      return;
    } catch (e) {
      // User rejected the switch — propagate so we never continue a GM/deploy
      // on the wrong chain.
      if (getErrorCode(e) === 4001) throw e;
      // Chains not pre-configured in the user's wallet (e.g. REYA, chainId
      // 1729) fail with "Unrecognized chain ID". Fall back to
      // `wallet_addEthereumChain` (EIP-3085); some quirky wallets throw an
      // unrecognised code instead of 4902, hence no code filter here.
      const addParams = senders.lookupAddChain?.(chainId);
      if (!addParams) throw e;
      try {
        await senders.rawProvider.request({
          method: "wallet_addEthereumChain",
          params: [addParams],
        });
        return;
      } catch {
        throw e;
      }
    }
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
