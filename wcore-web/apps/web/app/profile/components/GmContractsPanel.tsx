import { ChainIcon } from "@/components/ChainIcon";
import { GmWithdrawButton } from "@/components/GmWithdrawButton";
import { type GmContractWithBalance, hasWithdrawableBalance } from "@/hooks/useGmContracts";
import { getExplorerUrl } from "@/lib/explorers";

const PLATFORM_OWNER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";

interface GmContractsPanelProps {
  gmContracts: GmContractWithBalance[];
  address: string | undefined;
  withdrawingId: string | null;
  onWithdrawCreator: (contract: GmContractWithBalance) => Promise<void>;
  onWithdrawPlatform: (contract: GmContractWithBalance) => Promise<void>;
}

export function GmContractsPanel({
  gmContracts,
  address,
  withdrawingId,
  onWithdrawCreator,
  onWithdrawPlatform,
}: GmContractsPanelProps) {
  if (gmContracts.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
          My GM Contracts
        </p>
        <p className="text-sm text-muted">
          You have not deployed a GM contract yet. Go to a wallet scan and click "Deploy GM Contract" on any supported chain to start earning tips.
        </p>
      </div>
    );
  }

  const isPlatformOwner = address?.toLowerCase() === PLATFORM_OWNER;
  const withdrawable = gmContracts.filter((c) => hasWithdrawableBalance(c.creatorBalance) || (isPlatformOwner && hasWithdrawableBalance(c.platformBalance)));
  const others = gmContracts.filter((c) => !hasWithdrawableBalance(c.creatorBalance) && !(isPlatformOwner && hasWithdrawableBalance(c.platformBalance)));
  const sorted = [...withdrawable, ...others];

  return (
    <div className="space-y-4">
      {withdrawable.length > 0 ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 flex items-center justify-between">
          <span className="text-sm text-accent font-semibold">
            {withdrawable.length} {withdrawable.length === 1 ? "contract" : "contracts"} with withdrawable tips
          </span>
          <span className="text-[10px] text-muted">50% of each GM tip goes to you</span>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {sorted.map((c) => {
          const isCreator = c.role !== "platform";
          const chainLabel = c.chainKey.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
          const explorerUrl = getExplorerUrl(c.chainKey, c.contractAddress);

          return (
            <div
              key={c.id}
              className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <ChainIcon chainKey={c.chainKey.toUpperCase()} size="sm" />
                <span className="text-xs font-semibold truncate">{chainLabel}</span>
                {c.role === "platform" ? (
                  <span className="shrink-0 rounded bg-yellow-400/10 px-1 py-0.5 text-[9px] text-yellow-400">PLATFORM</span>
                ) : null}
              </div>

              <div className="font-mono text-[9px] text-muted truncate">
                {explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-accent transition"
                    title={`View on ${chainLabel} explorer`}
                  >
                    {c.contractAddress} ↗
                  </a>
                ) : (
                  <span>{c.contractAddress}</span>
                )}
              </div>

              {isCreator ? (
                <GmWithdrawButton
                  contract={c}
                  withdrawingId={withdrawingId}
                  onWithdraw={onWithdrawCreator}
                  compact
                />
              ) : null}

              {isPlatformOwner ? (
                <GmWithdrawButton
                  contract={c}
                  withdrawingId={withdrawingId}
                  onWithdraw={onWithdrawPlatform}
                  balanceKind="platform"
                  compact
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
