export function lsGmDone(chainKey: string): boolean {
  if (typeof window === "undefined") return false;
  const key = chainKey.toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  const stored = JSON.parse(window.localStorage.getItem("wc_gm_onchain_chains") || "{}") as Record<string, string>;
  if (stored[key] === today) return true;
  if (Object.entries(stored).some(([storedKey, date]) => storedKey.toLowerCase() === key && date === today)) return true;
  const legacyDate = window.localStorage.getItem("wc_gm_onchain_date");
  const legacyChain = window.localStorage.getItem("wc_gm_onchain_chain");
  if (legacyDate === today && legacyChain?.toLowerCase() === key) return true;
  return false;
}

export function lsAnyGmDoneToday(): boolean {
  if (typeof window === "undefined") return false;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const stored = JSON.parse(window.localStorage.getItem("wc_gm_onchain_chains") || "{}") as Record<string, string>;
    if (Object.values(stored).some((date) => date === today)) return true;
  } catch { /* ignore corrupt storage */ }
  return window.localStorage.getItem("wc_gm_onchain_date") === today;
}

export function lsDeployed(chainKey: string): boolean | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(`wc_gm_deployed_${chainKey}`);
  if (v === "1") return true;
  if (v === "0") return false;
  return null;
}

export function lsContractDeployed(chainKey: string): boolean {
  if (typeof window === "undefined") return false;
  return !!window.localStorage.getItem(`wc_gm_contract_${chainKey.toLowerCase()}`);
}

export function lsSetContractDeployed(chainKey: string, contractAddress: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`wc_gm_contract_${chainKey.toLowerCase()}`, contractAddress);
  } catch { /* quota exceeded */ }
}

export function lsSetGmDone(chainKey: string): void {
  if (typeof window === "undefined") return;
  const today = new Date().toISOString().slice(0, 10);
  const stored = JSON.parse(window.localStorage.getItem("wc_gm_onchain_chains") || "{}") as Record<string, string>;
  stored[chainKey.toLowerCase()] = today;
  window.localStorage.setItem("wc_gm_onchain_chains", JSON.stringify(stored));
}

export function lsGetBalance(chainKey: string, contractAddress: string, kind: "creator" | "platform"): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(`gm_bal_${chainKey.toLowerCase()}_${contractAddress}_${kind}`);
}

export function lsSetBalance(chainKey: string, contractAddress: string, kind: "creator" | "platform", balance: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`gm_bal_${chainKey.toLowerCase()}_${contractAddress}_${kind}`, balance);
  } catch { /* quota exceeded */ }
}
