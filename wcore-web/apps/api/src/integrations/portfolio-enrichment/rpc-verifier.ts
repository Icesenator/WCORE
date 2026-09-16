// WC-11 — real RPC contract verification for enrichment candidates.
//
// Enrichment only ever PROPOSES. A proposed contract cannot become a candidate unless
// this verifier independently confirms a non-zero on-chain balance for the wallet.
// Design rules:
//   * read-only (eth_call via Multicall3) — no writes, no signing, no wallet,
//   * WCORE chain registry is the only chain authority (unknown/non-EVM ⇒ fail-closed),
//   * the provider-reported balance is never used here or by callers,
//   * every failure (throw, timeout, no endpoint, malformed input) returns null = UNVERIFIED.

import { EvmRpc, RpcDispatcher, getChain, getRpcEndpoints, multicall, type MulticallCall, type MulticallResult } from "@wcore/core";

import type { EnrichmentMergeDeps } from "./merge.js";

const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)
const DECIMALS_SELECTOR = "0x313ce567"; // decimals()
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const MAX_DECIMALS = 36;

function encodeAddressCall(selector: string, address: string): string {
  return selector + address.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
}

function toBigInt(hex: string | undefined): bigint | null {
  if (!hex || hex === "0x") return null;
  try {
    return BigInt(hex);
  } catch {
    return null;
  }
}

export interface RpcContractVerifierDeps {
  rpc?: EvmRpc;
  dispatcher?: RpcDispatcher;
  endpointsFor?: (chain: string) => string[];
  /** Injectable for tests; defaults to the real Multicall3 read. */
  multicallFn?: (endpoints: string[], calls: MulticallCall[]) => Promise<MulticallResult[]>;
}

export function createRpcContractVerifier(deps: RpcContractVerifierDeps = {}): EnrichmentMergeDeps["verifyContract"] {
  const rpc = deps.rpc ?? new EvmRpc();
  const dispatcher = deps.dispatcher ?? new RpcDispatcher();
  const endpointsFor = deps.endpointsFor ?? ((chain: string) => getRpcEndpoints(chain));
  const read = deps.multicallFn ?? ((endpoints: string[], calls: MulticallCall[]) => multicall(rpc, dispatcher, endpoints, calls));

  return async ({ chain, address, contract }) => {
    try {
      const config = getChain(chain.toUpperCase());
      if (!config || config.vm !== "EVM") return null; // unknown / non-EVM ⇒ UNVERIFIED
      const target = contract.toLowerCase();
      const holder = address.toLowerCase();
      if (!EVM_ADDRESS.test(target) || !EVM_ADDRESS.test(holder)) return null;

      const endpoints = endpointsFor(chain);
      if (endpoints.length === 0) return null;

      const results = await read(endpoints, [
        { target, callData: encodeAddressCall(BALANCE_OF_SELECTOR, holder) },
        { target, callData: DECIMALS_SELECTOR },
      ]);

      const balanceResult = results[0];
      if (!balanceResult?.success) return null;
      const raw = toBigInt(balanceResult.returnData);
      if (raw === null || raw < 0n) return null;

      const decimalsResult = results[1];
      const decimalsRaw = decimalsResult?.success ? toBigInt(decimalsResult.returnData) : null;
      const decimals = decimalsRaw === null ? 18 : Number(decimalsRaw);
      if (!Number.isFinite(decimals) || decimals < 0 || decimals > MAX_DECIMALS) return null;

      return { contract: target, balance: Number(raw) / 10 ** decimals };
    } catch {
      return null; // fail-closed: any error is UNVERIFIED, never propagated
    }
  };
}
