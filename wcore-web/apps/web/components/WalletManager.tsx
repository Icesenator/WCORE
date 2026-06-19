"use client";

import { useState } from "react";

interface LinkedWallet {
  address: string;
  label: string;
  chainType: string;
  isCex?: boolean;
  icon?: string;
  totalEur?: number;
}

export interface WalletManagerProps {
  wallets: LinkedWallet[];
  onAdd: (address: string, label: string) => void;
  onRemove: (address: string) => void;
  connectedAddress?: string | null;
}

export function WalletManager({ wallets, onAdd, onRemove, connectedAddress }: WalletManagerProps) {
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");

  function handleAdd() {
    const trimmed = address.trim();
    if (!trimmed) return;
    onAdd(trimmed, label.trim() || trimmed.slice(0, 10));
    setAddress("");
    setLabel("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x... / cosmos1... / Solana..."
          className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          autoComplete="off"
          spellCheck={false}
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="w-36 rounded-lg border border-border bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!address.trim()}
          className="rounded-lg bg-accent/20 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/30 disabled:opacity-40"
        >
          + Add
        </button>
      </div>

      {wallets.length > 0 ? (
        <div className="space-y-1">
          {wallets.map((w) => {
            const isConnected = connectedAddress ? w.address.toLowerCase() === connectedAddress.toLowerCase() : false;
            return (
              <div key={w.address} className="flex items-center justify-between rounded-md border border-border bg-card/50 px-3 py-1.5 text-sm">
                <div className="min-w-0 flex-1">
                    <span className={`${w.isCex ? "font-semibold text-fg" : "font-mono"} text-xs truncate block`}>
                      {w.isCex ? w.label : w.address}
                    </span>
                    {w.label || isConnected || w.isCex ? (
                      <span className="text-xs text-muted inline-flex items-center gap-1">
                        {w.isCex ? "Exchange account" : w.label}
                        {isConnected ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" title="Connected" />
                        ) : null}
                      </span>
                    ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(w.address)}
                  className="ml-2 shrink-0 text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
