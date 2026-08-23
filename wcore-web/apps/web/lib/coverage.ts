import { CEX_PROVIDERS, GM_FACTORIES } from "@wcore/shared";
import { chainList } from "@wcore/core";

export function getCoverageStats() {
  const chainConfigCount = chainList.length;
  const disabledChainCount = chainList.filter((chain) => chain.FLAGS?.DISABLE_CHAIN === true).length;
  return {
    chainConfigCount,
    disabledChainCount,
    enabledChainCount: chainConfigCount - disabledChainCount,
    cexProviderCount: CEX_PROVIDERS.length,
    gmEnabledChainCount: Object.keys(GM_FACTORIES).length,
  };
}
