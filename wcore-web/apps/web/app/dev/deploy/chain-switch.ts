import { GM_HISTORICAL_FACTORIES, getRetiredChainLabel, isRetiredChainId } from "@wcore/shared";
import type { AddEthereumChainParams } from "./chain-params";

export interface WalletRequest {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

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

/**
 * Deployment guard for stopped networks. A chain whose factory only sits in
 * GM_HISTORICAL_FACTORIES (Gravity 1625, Degen, Superposition, B3) has no active
 * GM factory any more: a new deployment there can only fail or strand funds.
 * Returns the refusal message, or null when the chain id is not historical.
 *
 * Scope: this module is only used by /dev/deploy. Withdrawals from contracts that
 * already exist go through lib/onchain-tx.ts and are not affected.
 *
 * A bare digit string is checked both as hex (how the page reads its custom
 * chain id field) and as decimal, so "0x659", "659" and "1625" are all refused.
 */
export function getStoppedDeployChainMessage(chainId: number | string): string | null {
  const candidates: number[] = [];
  if (typeof chainId === "number") {
    if (Number.isInteger(chainId)) candidates.push(chainId);
  } else {
    const raw = String(chainId ?? "").trim().toLowerCase();
    if (/^0x[0-9a-f]+$/.test(raw)) candidates.push(parseInt(raw, 16));
    else if (/^[0-9a-f]+$/.test(raw)) {
      candidates.push(parseInt(raw, 16));
      if (/^\d+$/.test(raw)) candidates.push(Number(raw));
    }
  }
  for (const [key, factory] of Object.entries(GM_HISTORICAL_FACTORIES)) {
    if (!candidates.includes(factory.chainId)) continue;
    const name = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
    return `${name} (${factory.chainId}) is a stopped network. GM contract deployment is not supported.`;
  }
  return null;
}

/**
 * Ask the wallet to switch to `chainIdHex`. If the wallet doesn't know the
 * chain yet (error 4902), look up the chain's RPC URLs + native currency
 * and call `wallet_addEthereumChain` (EIP-3085) before continuing.
 *
 * We do NOT retry `wallet_switchEthereumChain` after `wallet_addEthereumChain`
 * succeeds: MetaMask's `wallet_addEthereumChain` already selects the new
 * chain as part of its confirmation flow. Retrying the switch can throw
 * 4902 again (race condition while the chain registers) and surfaces a
 * confusing "Unrecognized chain ID" error to the user, even though the
 * add succeeded. This was a real bug we hit on KCC (chainId 321) deploy.
 *
 * Defensive against wallet-specific quirks:
 * - Error code may be nested at `data.originalError.code` (wagmi pattern)
 * - Error code may be a string ("4902") instead of a number
 * - Some wallets throw 4902 even for chains that exist with different params
 *
 * If the chain is not in our inline deploy list, throws a clear error
 * asking the user to regenerate `chain-data.ts`.
 */
export async function switchWalletChain(
  ethereum: WalletRequest | undefined,
  chainIdHex: string,
  lookupAddParams: (chainIdNum: number) => AddEthereumChainParams | null,
): Promise<void> {
  // Retired networks (B3 8333, Superseed 5330): refuse before any wallet request.
  if (isRetiredChainId(chainIdHex)) {
    const label = getRetiredChainLabel(String(parseInt(chainIdHex, 16))) ?? chainIdHex;
    throw Object.assign(new Error(`${label} has been removed from WCORE. Wallet and RPC actions are not supported.`), { code: "CHAIN_REMOVED" });
  }
  // Stopped networks kept for history only (Gravity 1625, ...): refused at the same point.
  const stopped = getStoppedDeployChainMessage(chainIdHex);
  if (stopped) throw Object.assign(new Error(stopped), { code: "CHAIN_STOPPED" });
  if (!ethereum) return;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
    return;
  } catch (e) {
    const code = getErrorCode(e);
    if (code === 4001) {
      // User rejected the switch — propagate so we don't continue a deploy
      // on the wrong chain. Show the wallet's own error message verbatim.
      throw e;
    }
    if (code !== 4902) {
      // Some wallets (e.g. older Rabby, OKX) throw an unrecognised code or
      // wrap 4902 deeper in the error. Re-throw with chain context so the
      // user knows which chain failed and how to add it manually.
      const addParams = lookupAddParams(parseInt(chainIdHex, 16));
      if (!addParams) throw e;
      try {
        await ethereum.request({ method: "wallet_addEthereumChain", params: [addParams] });
        return;
      } catch {
        throw e;
      }
    }
  }
  // 4902: chain not in wallet. Look up params from the inline chain data.
  const targetId = parseInt(chainIdHex, 16);
  const addParams = lookupAddParams(targetId);
  if (!addParams) {
    throw new Error(
      `Chain ${chainIdHex} is not in the WCORE deploy chain list. Add it to apps/web/app/dev/deploy/chain-data.ts (regenerate via scripts/extract-deploy-chain-data.mjs).`
    );
  }
  await ethereum.request({ method: "wallet_addEthereumChain", params: [addParams] });
  // NO RETRY of wallet_switchEthereumChain — see comment above.
}
