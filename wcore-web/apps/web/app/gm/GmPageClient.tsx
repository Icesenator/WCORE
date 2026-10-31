"use client";
import { apiFetch } from "@/lib/api";

import { useState, useEffect } from "react";
import { useWallet } from "@/components/ConnectButton";
import { useGmChain } from "@/hooks/useGmChain";
import { ChainIcon } from "@/components/ChainIcon";
import { Logo } from "@/components/Logo";
import { GmWithdrawButton } from "@/components/GmWithdrawButton";
import { useGmContracts, type GmContractWithBalance, useHistoricalGmContracts } from "@/hooks/useGmContracts";
import { getExplorerUrl } from "@/lib/explorers";
import { getFactoryAddress, GM_PLATFORM_OWNER } from "@wcore/shared";
import { lsGmDone } from "@/lib/gm-storage";
import { getGmRpcUnavailableMessage } from "@/lib/gm-rpc-error";
import { getGmChains, getSoonChains, type GmChain } from "./gm-chains";
import { filterGmChains } from "./filter-gm-chains";
import { buildChainStatusesFromApi, type ApiGmStatus } from "@/lib/gm-status-reconcile";

const GM_CHAINS = getGmChains();
const SOON_CHAINS = getSoonChains();

const GM_ACTION_CLASS = "flex h-9 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold";

export function GmPageClient() {
  const { address, authStep } = useWallet();
  const isAuthenticated = authStep === "authenticated";
  const [chainStatuses, setChainStatuses] = useState<Record<string, { deployed: boolean | null; gmDone: boolean }>>({});
  const [search, setSearch] = useState("");
  const availableChains = filterGmChains(GM_CHAINS.filter(c => getFactoryAddress(c.key)), search);
  const soonChains = filterGmChains(SOON_CHAINS, search);
  const { contractsByChain, withdrawingId, withdrawCreator, withdrawPlatform } = useGmContracts(isAuthenticated ? address : null);
  const { contracts: historicalContracts, loading: historicalLoading } = useHistoricalGmContracts(isAuthenticated ? address : null);

  useEffect(() => {
    if (!isAuthenticated) {
      setChainStatuses({});
      return;
    }
    apiFetch("/api/gm/status")
      .then(r => r.ok ? r.json() : null)
      .then((data: ApiGmStatus | null) => {
        setChainStatuses(buildChainStatusesFromApi(data, GM_CHAINS.map(c => c.key), lsGmDone));
      })
      .catch(() => {});
  }, [address, isAuthenticated]);

  const searchField = (
    <input
      type="search"
      aria-label="Search chains"
      placeholder="Search chains..."
      value={search}
      onChange={e => setSearch(e.target.value)}
      className="mb-4 w-full max-w-sm rounded-lg border border-border bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
    />
  );

  if (!isAuthenticated) {
    return (
      <div>
        {searchField}
        {availableChains.length === 0 && soonChains.length === 0 && <p className="text-sm text-muted">No chains found</p>}
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-8">
          {availableChains.map((chain) => (
            <div key={chain.key} className="rounded-xl border border-border bg-card p-5 opacity-50">
              <div className="flex h-9 items-center gap-3 mb-4">
                <ChainIcon chainKey={chain.key.toUpperCase()} />
                <div>
                  <p className="font-semibold text-fg text-sm">{chain.name}</p>
                  <p className="text-[10px] text-muted uppercase">{chain.key.replace(/_/g, " ")}</p>
                </div>
              </div>
              <div className={`${GM_ACTION_CLASS} bg-accent/10 text-center text-muted`}>
                Connect to Deploy
              </div>
            </div>
          ))}
          {soonChains.map((chain) => (
            <div key={chain.key} className="rounded-xl border border-border bg-card p-5 opacity-40">
              <div className="flex h-9 items-center gap-3 mb-4">
                <ChainIcon chainKey={chain.key.toUpperCase()} />
                <div>
                  <p className="font-semibold text-fg text-sm">{chain.name}</p>
                  <p className="text-[10px] text-muted uppercase">{chain.key.replace(/_/g, " ")}</p>
                </div>
              </div>
              <div className={`${GM_ACTION_CLASS} border border-yellow-400/10 bg-yellow-400/5 text-center text-yellow-400/50`}>
                Coming Soon
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {searchField}
      {availableChains.length === 0 && soonChains.length === 0 && <p className="text-sm text-muted">No chains found</p>}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-8">
      {availableChains.map((chain) => (
        <GmChainCard
          key={chain.key}
          chain={chain}
          initialStatus={chainStatuses[chain.key] ?? { deployed: null, gmDone: lsGmDone(chain.key) }}
          walletAddress={address ?? ""}
          gmContracts={contractsByChain.get(chain.key) ?? []}
          withdrawingId={withdrawingId}
          onWithdrawCreator={withdrawCreator}
          onWithdrawPlatform={withdrawPlatform}
          connectedAddress={address ?? ""}
        />
      ))}
      {soonChains.map((chain) => (
        <div key={chain.key} className="rounded-xl border border-border bg-card p-5 opacity-50">
          <div className="flex h-9 items-center gap-3 mb-4">
            <ChainIcon chainKey={chain.key.toUpperCase()} />
            <div>
              <p className="font-semibold text-fg text-sm">{chain.name}</p>
              <p className="text-[10px] text-muted uppercase">{chain.key.replace(/_/g, " ")}</p>
            </div>
          </div>
          <div className={`${GM_ACTION_CLASS} border border-yellow-400/10 bg-yellow-400/5 text-center text-yellow-400/50`}>
            Coming Soon
          </div>
        </div>
      ))}
      </div>

      {/* Historical contracts for retired chains: a section of its own, not a cell of the active grid */}
      {(historicalContracts.length > 0 || historicalLoading) && (
        <section className="mt-8 w-full min-w-0">
          <h3 className="mb-4 text-sm font-semibold text-muted uppercase tracking-wider">Historical Chains (Retired)</h3>
          {historicalLoading ? (
            <div className="rounded-xl border border-border bg-card p-5 text-center text-muted">
              Loading historical contracts…
            </div>
          ) : historicalContracts.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {historicalContracts.map((contract) => (
                <div key={contract.id} className="min-w-0 rounded-xl border border-border bg-card p-5 opacity-70">
                  <div className="flex h-9 items-center gap-3 mb-4">
                    <ChainIcon chainKey={contract.chainKey.toUpperCase()} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-fg text-sm">
                        {contract.chainKey.charAt(0).toUpperCase() + contract.chainKey.slice(1).replace(/_/g, " ")}
                      </p>
                      <p className="truncate text-[10px] text-muted uppercase">
                        Contract: {contract.contractAddress.slice(0, 6)}…{contract.contractAddress.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {(() => {
                      const explorerUrl = getExplorerUrl(contract.chainKey, contract.contractAddress);
                      return explorerUrl ? (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${GM_ACTION_CLASS} border border-border bg-transparent text-muted hover:text-fg flex-1`}
                        >
                          View on Explorer
                        </a>
                      ) : (
                        <div className={`${GM_ACTION_CLASS} border border-border bg-transparent text-muted/50 flex-1 cursor-not-allowed`}>
                          Explorer unavailable
                        </div>
                      );
                    })()}
                  </div>
                  <p className="mt-2 text-center text-[10px] text-muted">
                    Retired chain — read-only
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5 text-center text-muted">
              No historical contracts found.
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function GmChainCard({ chain, initialStatus, walletAddress, gmContracts, withdrawingId, onWithdrawCreator, onWithdrawPlatform, connectedAddress }: {
  chain: GmChain;
  initialStatus: { deployed: boolean | null; gmDone: boolean };
  walletAddress: string;
  gmContracts: GmContractWithBalance[];
  withdrawingId: string | null;
  onWithdrawCreator: (contract: GmContractWithBalance) => Promise<void>;
  onWithdrawPlatform: (contract: GmContractWithBalance) => Promise<void>;
  connectedAddress: string;
}) {
  const isPlatformOwner = connectedAddress?.toLowerCase() === GM_PLATFORM_OWNER;
  const rpcUnavailable = getGmRpcUnavailableMessage(chain.key);
  const creatorContracts = gmContracts.filter((contract) => contract.role !== "platform");
  const platformContracts = isPlatformOwner ? gmContracts : [];
  const { hasDeployed, alreadyGmToday, initDone, sending, deploying, handleSendGm, handleDeploy } = useGmChain(
    chain.key,
    walletAddress,
    initialStatus,
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5 hover:border-accent/20 transition flex flex-col">
      <div className="flex h-9 items-center gap-3 mb-4">
        <ChainIcon chainKey={chain.key.toUpperCase()} />
        <div>
          <p className="font-semibold text-fg text-sm">{chain.name}</p>
          <p className="text-[10px] text-muted uppercase">{chain.key.replace(/_/g, " ")}</p>
        </div>
      </div>

      {rpcUnavailable ? (
        <div className="flex flex-col gap-2">
          <button type="button" disabled title={rpcUnavailable} className={`${GM_ACTION_CLASS} bg-accent/10 text-muted cursor-not-allowed`}>
            GM unavailable
          </button>
          <p role="status" className="text-xs text-muted">{rpcUnavailable}</p>
        </div>
      ) : !initDone || hasDeployed === null ? (
        <div className="h-8 flex items-center justify-center">
          <Logo className="h-4 w-4 text-accent animate-spin" />
        </div>
      ) : hasDeployed ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleSendGm}
            disabled={sending || alreadyGmToday}
            title={sending ? "Waiting for on-chain confirmation…" : alreadyGmToday ? "GM already done today" : "On-chain GM (~$0.05 tip)"}
            aria-label={sending ? "Waiting for on-chain confirmation" : alreadyGmToday ? "GM already done today" : "Send on-chain GM with ~$0.05 tip"}
            className={`${GM_ACTION_CLASS} transition ${
              alreadyGmToday
                ? "bg-accent/10 text-accent/60 cursor-default"
                : "bg-accent/20 text-accent hover:bg-accent/30"
            }`}
          >
            {sending ? <Logo className="h-4 w-4 text-accent animate-spin inline-block" /> : alreadyGmToday ? "✅ GM Done" : "⛽ Say GM"}
          </button>
          {creatorContracts.map((contract) => (
            <GmWithdrawButton
              key={`creator-${contract.id}`}
              contract={contract}
              withdrawingId={withdrawingId}
              onWithdraw={onWithdrawCreator}
              compact
            />
          ))}
          {platformContracts.map((contract) => (
            <GmWithdrawButton
              key={`platform-${contract.id}`}
              contract={contract}
              withdrawingId={withdrawingId}
              onWithdraw={onWithdrawPlatform}
              balanceKind="platform"
              compact
            />
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleDeploy}
          disabled={deploying}
          className={`${GM_ACTION_CLASS} border border-yellow-400/20 bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 transition disabled:opacity-50`}
        >
          {deploying ? <Logo className="h-4 w-4 text-yellow-400 animate-spin inline-block" /> : "🚀 Deploy GM Contract"}
        </button>
      )}
    </div>
  );
}
