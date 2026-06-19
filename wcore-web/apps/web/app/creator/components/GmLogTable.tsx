"use client";

interface GmLogEntry {
  date: string;
  from: string;
  amount: number;
  chain: string;
  txHash: string;
  contractAddress: string;
}

interface GmLogTableProps {
  gmLog: GmLogEntry[];
}

function getExplorerUrl(chain: string, txHash: string): string {
  const explorers: Record<string, string> = {
    base: "https://basescan.org/tx/",
    ethereum: "https://etherscan.io/tx/",
    arbitrum_one: "https://arbiscan.io/tx/",
    optimism: "https://optimistic.etherscan.io/tx/",
    polygon: "https://polygonscan.com/tx/",
  };
  const base = explorers[chain] ?? "https://etherscan.io/tx/";
  return base + txHash;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function GmLogTable({ gmLog }: GmLogTableProps) {
  const recent = gmLog.slice(0, 50);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">GM Log</p>
      {recent.length === 0 ? (
        <p className="text-sm text-muted text-center py-4">No GMs yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="pb-2 pr-3 font-medium">Date</th>
                <th className="pb-2 pr-3 font-medium">From</th>
                <th className="pb-2 pr-3 font-medium">Amount</th>
                <th className="pb-2 pr-3 font-medium">Chain</th>
                <th className="pb-2 font-medium">Tx Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {recent.map((entry, i) => (
                <tr key={i} className="text-fg">
                  <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted">
                    {new Date(entry.date).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{truncateAddress(entry.from)}</td>
                  <td className="py-2 pr-3 text-xs">{entry.amount} GM</td>
                  <td className="py-2 pr-3 text-xs capitalize">{entry.chain.replace(/_/g, " ")}</td>
                  <td className="py-2">
                    <a
                      href={getExplorerUrl(entry.chain, entry.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent hover:underline font-mono"
                    >
                      {truncateAddress(entry.txHash)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
