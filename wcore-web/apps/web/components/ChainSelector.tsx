"use client";
import { getApiUrl } from "@/lib/api";
import { useState, useEffect, useMemo, type ChangeEvent } from "react";

const API_URL = getApiUrl();

import { DEFAULT_CHAINS } from "@/lib/defaults";

interface ChainInfo {
  key: string;
  name: string;
  vm: string;
}

export interface ChainSelectorProps {
  selected: string[];
  onChange: (chains: string[]) => void;
}

export function ChainSelector({ selected, onChange }: ChainSelectorProps) {
  const [allChains, setAllChains] = useState<ChainInfo[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(API_URL + "/api/chains")
      .then((res) => res.json())
      .then((data: { chains: { key: string; vm: string; name: string }[] }) => {
        const all = data.chains
          .map((c) => ({ key: c.key, name: c.name, vm: c.vm }));
        setAllChains(all);
      })
      .catch(() => {});
  }, []);

  const visible = useMemo(() => {
    let list = allChains;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = allChains.filter(
        (c) => c.key.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allChains, search]);

  function toggle(key: string) {
    if (selected.includes(key)) {
      onChange(selected.filter((k) => k !== key));
    } else {
      onChange([...selected, key]);
    }
  }

  function toggleDefault() {
    const keys = DEFAULT_CHAINS.filter((k) => allChains.some((c) => c.key === k));
    const allSelected = keys.every((k) => selected.includes(k));
    if (allSelected) onChange(selected.filter((k) => !keys.includes(k as typeof keys[number])));
    else {
      const added = keys.filter((k) => !selected.includes(k));
      onChange([...selected, ...added]);
    }
  }

  function toggleAll() {
    const allKeys = allChains.map((c) => c.key);
    const allSelected = allKeys.every((k) => selected.includes(k));
    if (allSelected) onChange(selected.filter((k) => !allKeys.includes(k)));
    else {
      const added = allKeys.filter((k) => !selected.includes(k));
      onChange([...selected, ...added]);
    }
  }

  const defaultKeys = DEFAULT_CHAINS.filter((k) => allChains.some((c) => c.key === k));
  const topAllSelected = defaultKeys.every((k) => selected.includes(k));
  const allSelected = allChains.length > 0 && allChains.every((c) => selected.includes(c.key));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs text-muted">Chains ({selected.length}/{allChains.length || 0})</label>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={toggleDefault} className="rounded-md border border-border bg-bg px-2 py-0.5 text-[10px] font-medium text-muted hover:text-fg hover:border-accent/30 transition">
            {topAllSelected ? "Deselect default" : "Default"}
          </button>
          <button type="button" onClick={toggleAll} className="rounded-md border border-border bg-bg px-2 py-0.5 text-[10px] font-medium text-muted hover:text-fg hover:border-accent/30 transition">
            {allSelected ? "Deselect all" : "All"}
          </button>
        </div>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        placeholder="Search chains..."
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        autoComplete="off"
      />

      <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {visible.map((chain) => (
          <label
            key={chain.key}
            className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-xs transition ${
              selected.includes(chain.key)
                ? "bg-accent/10 text-fg"
                : "text-muted hover:text-fg hover:bg-bg/50"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(chain.key)}
              onChange={() => toggle(chain.key)}
              className="accent-accent shrink-0"
            />
            <span className="truncate">{chain.name}</span>
            <ChainBadge vm={chain.vm} />
          </label>
        ))}
        {visible.length === 0 && search ? (
          <p className="col-span-full py-4 text-center text-xs text-muted">No chains match &ldquo;{search}&rdquo;</p>
        ) : null}
      </div>
    </div>
  );
}

function ChainBadge({ vm }: { vm: string }) {
  if (vm === "SVM") return <span className="rounded bg-purple-900/30 px-1 py-0 text-[9px] font-semibold uppercase text-purple-300 shrink-0">SVM</span>;
  if (vm === "COSMOS") return <span className="rounded bg-blue-900/30 px-1 py-0 text-[9px] font-semibold uppercase text-blue-300 shrink-0">COSMOS</span>;
  return <span className="rounded bg-accent/10 px-1 py-0 text-[9px] font-semibold uppercase text-accent shrink-0">EVM</span>;
}
