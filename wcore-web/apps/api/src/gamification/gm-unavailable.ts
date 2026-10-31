// A GM chain whose RPCs are overridden for the portfolio quorum: the GM readers
// trust the first provider that answers, so they must not run there at all.
export class GmChainUnavailableError extends Error {
  readonly code = "RPC_OVERRIDE_GM_UNATTESTED";
  readonly chainKey: string;
  constructor(chainKey: string) {
    super("RPC_OVERRIDE_GM_UNATTESTED");
    this.name = "GmChainUnavailableError";
    this.chainKey = chainKey.trim().toUpperCase();
  }
}

export const GM_UNAVAILABLE_STATUS = 503;

export function gmUnavailableBody(error: GmChainUnavailableError) {
  return { error: "gm_chain_unavailable", reason: "rpc_override_unattested", chainKey: error.chainKey };
}

export function isGmChainUnavailable(error: unknown): error is GmChainUnavailableError {
  return error instanceof GmChainUnavailableError;
}
