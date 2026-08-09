"use client";
import { apiFetch } from "@/lib/api";

import { useState, useEffect } from "react";
import { useWallet } from "@/components/ConnectButton";
import { useGmChain } from "@/hooks/useGmChain";
import { ChainIcon } from "@/components/ChainIcon";
import { Logo } from "@/components/Logo";
import { GmWithdrawButton } from "@/components/GmWithdrawButton";
import { useGmContracts, type GmContractWithBalance } from "@/hooks/useGmContracts";
import { getFactoryAddress, GM_PLATFORM_OWNER } from "@wcore/shared";
import { lsGmDone } from "@/lib/gm-storage";
import { getGmChains, getSoonChains, type GmChain } from "./gm-chains";
import { buildChainStatusesFromApi, type ApiGmStatus } from "@/lib/gm-status-reconcile";

const GM_CHAINS = getGmChains();
const SOON_CHAINS = getSoonChains();

const GM_ACTION_CLASS = "flex h-9 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold";

export function GmPageClient() {
  const { address, authStep } = useWallet();
  const isAuthenticated = authStep === "authenticated";
  const [chainStatuses, setChainStatuses] = useState<Record<string, { deployed: boolean | null; gmDone: boolean }>>({});
  const { contractsByChain, withdrawingId, withdrawCreator, withdrawPlatform } = useGmContracts(isAuthenticated ? address : null);

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

  if (!isAuthenticated) {
    return (
      <div>
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-8">
          {GM_CHAINS.filter(c => getFactoryAddress(c.key)).map((chain) => (
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
          {SOON_CHAINS.map((chain) => (
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
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-8">
      {GM_CHAINS.filter(c => getFactoryAddress(c.key)).map((chain) => (
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
      {SOON_CHAINS.map((chain) => (
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

      {!initDone || hasDeployed === null ? (
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
