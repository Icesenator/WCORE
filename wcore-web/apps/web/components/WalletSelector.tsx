"use client";
import { VmBadge } from "@/components/ChainCard";
import { detectChainType } from "@wcore/shared";
import { getCexProviderMeta, parseCexWalletAddress } from "@/lib/cex-display";

export function WalletSelector({
  addresses,
  linkedSet,
  enabledAddresses,
  setEnabledAddresses,
  labels,
  displayResultsAdjusted,
  refreshingWallet,
  setRefreshingWallet,
  onRefreshWallet,
  formatValue,
}: {
  addresses: string[];
  linkedSet: Set<string>;
  enabledAddresses: string[];
  setEnabledAddresses: (addrs: string[]) => void;
  labels: Record<string, string>;
  displayResultsAdjusted: Array<{ address: string; label?: string; totalEur: number; isCex?: boolean }>;
  refreshingWallet: string | null;
  setRefreshingWallet: (addr: string | null) => void;
  onRefreshWallet: (addr: string) => void;
  formatValue: (v: number) => string;
}) {
  const selectorWallets = [
    ...addresses.map((address) => ({ address, isCex: false as const })),
    ...displayResultsAdjusted
      .filter((r) => r.isCex)
      .map((r) => ({ address: r.address, isCex: true as const, label: r.label })),
  ].filter((wallet, i, arr) => arr.findIndex((w) => w.address.toLowerCase() === wallet.address.toLowerCase()) === i);
  const totalCount = selectorWallets.length;

  return (
    <div className="mb-4 rounded-xl border border-border/60 bg-card/80 backdrop-blur shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted/60">
          {totalCount} wallet{totalCount > 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() => setEnabledAddresses(enabledAddresses.length === totalCount ? [] : selectorWallets.map((w) => w.address))}
          className="rounded-full border border-border/60 px-2.5 py-0.5 text-[10px] text-muted hover:text-fg hover:border-accent/30 transition"
        >{enabledAddresses.length === totalCount ? "Deselect all" : `${enabledAddresses.length}/${totalCount} selected`}</button>
      </div>
      {(["EVM", "SVM", "COSMOS", "TON", "CEX"] as const).map(vm => {
        const vmAddresses = selectorWallets.filter((wallet) => {
          if (wallet.isCex) return vm === "CEX";
          return vm !== "CEX" && detectChainType(wallet.address) === vm;
        });
        if (vmAddresses.length === 0) return null;
        return (
          <div key={vm} className="mb-2 last:mb-0">
            <div className="flex flex-wrap justify-center gap-1.5">
            {vmAddresses.map((wallet) => {
              const addr = wallet.address;
              const cexMeta = wallet.isCex ? parseCexWalletAddress(addr) : null;
              const cexProviderMeta = cexMeta ? getCexProviderMeta(cexMeta.provider) : null;
              const isLinked = linkedSet.has(addr.toLowerCase());
              const enabled = enabledAddresses.map((a) => a.toLowerCase()).includes(addr.toLowerCase());
              const label = (wallet.isCex ? wallet.label : undefined) ?? labels[addr.toLowerCase()];
              const walletResult = displayResultsAdjusted.find((r) => r.address.toLowerCase() === addr.toLowerCase());
              const value = walletResult?.totalEur;
              return (
               <button
                 key={addr}
                 onClick={(e) => { if ((e.target as HTMLElement).closest('[data-refresh]')) return; setEnabledAddresses(enabled ? enabledAddresses.filter((a) => a.toLowerCase() !== addr.toLowerCase()) : [...enabledAddresses, addr]); }}
                 className={`group flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs shrink-0 ${enabled ? "border-accent/30 bg-accent/5 text-fg shadow-sm" : "border-transparent text-muted/40 hover:border-border/40"}`}>
                  {cexProviderMeta ? <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-white"><img src={cexProviderMeta.icon} alt="" className="h-full w-full rounded-full object-contain p-0.5" /></span> : (isLinked ? "🔗" : "📋")}
                  <span className={`font-medium max-w-[60px] truncate ${enabled ? "" : ""}`}>{label ?? addr.slice(0, 8)}</span>
                  <span className="tabular-nums">{value != null ? formatValue(value) : "—"}</span>
                  {vm === "CEX" ? <span className="rounded bg-accent/10 px-1 py-px text-[9px] font-semibold text-accent">CEX</span> : <VmBadge vm={vm} />}
                  {wallet.isCex ? null : (
                    <span
                       data-refresh
                       onClick={(e) => { e.stopPropagation(); e.preventDefault(); setRefreshingWallet(addr); setTimeout(() => setRefreshingWallet(null), 3000); onRefreshWallet(addr); }}
                      className={`ml-0.5 rounded-full p-0.5 text-[10px] transition w-4 h-4 flex items-center justify-center ${refreshingWallet === addr ? "text-accent bg-accent/20 animate-spin" : "text-accent hover:bg-accent/10"}`}
                      title="Re-scan"
                    >↻</span>
                  )}
                </button>
              );
            })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
