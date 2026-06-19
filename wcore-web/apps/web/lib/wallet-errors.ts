export function classifyWalletSignError(error: unknown): string {
  const err = error as { name?: string; shortMessage?: string; message?: string; code?: number | string };
  const name = String(err?.name ?? "").toLowerCase();
  const message = String(err?.shortMessage ?? err?.message ?? error ?? "").toLowerCase();
  const code = String(err?.code ?? "");

  if (code === "4001" || name.includes("userrejected") || message.includes("user rejected") || message.includes("user denied") || message.includes("rejected the request")) {
    return "signature_refused";
  }
  if (message.includes("connector not connected") || message.includes("not connected") || name.includes("connectornotconnected")) {
    return "wallet_not_connected";
  }
  if (message.includes("resource unavailable") || message.includes("already pending") || code === "-32002") {
    return "wallet_request_pending";
  }
  if (message.includes("no provider") || message.includes("provider not found") || message.includes("window.ethereum")) {
    return "wallet_provider_missing";
  }
  return "signature_failed";
}

export function walletErrorLabel(error: string): string {
  if (error === "signature_refused") return "Signature rejected.";
  if (error === "signature_failed") return "Could not open the wallet signature request. Try again or reconnect your wallet.";
  if (error === "wallet_not_connected") return "Wallet is not connected. Reconnect your wallet.";
  if (error === "wallet_request_pending") return "A wallet request is already pending. Open your wallet extension.";
  if (error === "wallet_provider_missing") return "Wallet provider not found. Unlock or reinstall your wallet extension.";
  if (error === "login_failed") return "Login failed.";
  if (error === "nonce_failed") return "Session expired. Please try again.";
  if (error === "network_error") return "Network error. Check your connection.";
  if (error === "chain_id_mismatch") return "Wrong network selected.";
  return `Error: ${error}`;
}
