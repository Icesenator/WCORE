export interface AddEthereumChainParams {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
}

import { DEPLOY_CHAIN_PARAMS, SUPPORTED_CHAIN_IDS } from "./chain-data";

/**
 * Build the `wallet_addEthereumChain` params for a given numeric chainId.
 * Returns null if the chain is not in our inline deploy list (custom chainIds
 * entered by the user must be added to MetaMask manually first, or the chain
 * can be added to apps/web/app/dev/deploy/chain-data.ts via the generator
 * script: `npx tsx scripts/extract-deploy-chain-data.mjs`).
 *
 * Per AGENTS.md gotcha, we duplicate @wcore/core chain data inline rather than
 * importing it at runtime, because Turbopack does not resolve `.js` → `.ts` in
 * workspace packages.
 */
export function buildAddEthereumChainParams(chainIdNum: number): AddEthereumChainParams | null {
  if (!SUPPORTED_CHAIN_IDS.has(chainIdNum)) return null;
  for (const params of Object.values(DEPLOY_CHAIN_PARAMS)) {
    if (parseInt(params.chainId, 16) === chainIdNum) return params;
  }
  return null;
}
