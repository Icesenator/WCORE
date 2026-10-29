import { isRetiredChain } from "@wcore/shared";

/** RPC diagnostics only: never infer gas, contract failure or broadcast from a transport error. */
export function isGmRpcUnauthorized(error: unknown, seen = new Set<object>()): boolean {
  if (typeof error === "string") return /unauthori[sz]ed.*rpc|rpc.*unauthori[sz]ed|invalid.*rpc.*key|rpc.*key.*invalid/i.test(error);
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const e = error as Record<string, unknown>;
  // -32403 is returned by the observed Conduit endpoint. 4100 alone instead
  // means wallet account authorization; it is not evidence of an RPC key issue.
  if (e.code === -32403 || e.code === "-32403" || e.code === "RPC_UNAUTHORIZED") return true;
  return [e.message, e.shortMessage, e.details, e.cause, e.data, e.originalError, e.error]
    .some((inner) => isGmRpcUnauthorized(inner, seen));
}

export function normalizeGmRpcError(error: unknown): unknown {
  if (!isGmRpcUnauthorized(error)) return error;
  // Do not echo arbitrary provider payloads (which may contain keyed URLs).
  return Object.assign(new Error("RPC authorization failed. Check the network RPC configuration and retry explicitly once access is restored.", { cause: error }), {
    code: "RPC_UNAUTHORIZED",
  });
}

/** Permanent local retirement guard, including legacy keys and numeric IDs. */
export function getGmRpcUnavailableMessage(chainKey: string): string | null {
  return isRetiredChain(chainKey)
    ? "Superseed L2 has been removed from WCORE. Wallet and RPC actions are not supported."
    : null;
}

export function assertGmRpcAvailable(chainKey: string): void {
  const message = getGmRpcUnavailableMessage(chainKey);
  if (!message) return;
  throw Object.assign(new Error(message), {
    code: "CHAIN_REMOVED",
  });
}
