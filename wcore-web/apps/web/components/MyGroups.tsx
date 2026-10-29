"use client";

import React, { useEffect, useState, type FormEvent } from "react";
import {
  addSource, createEmptyState, createGroup, deleteGroup, localGroupsStorageKey,
  MAX_GROUP_NAME_LENGTH, removeMember, renameGroup, type LocalGroupsState,
  type LocalWalletGroup,
} from "@wcore/shared";
import {
  localGroupsExploreHref, readLocalGroups, writeLocalGroups,
  type GroupsStorage, type LocalGroupsSnapshot,
} from "../lib/local-wallet-groups-storage";

function browserStorage(): GroupsStorage | null {
  try { return window.localStorage; } catch { return null; }
}
const inputClass = "min-w-0 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus-visible:outline-accent";
const buttonClass = "rounded-lg border border-border px-3 py-2 text-xs hover:border-accent focus-visible:outline-accent disabled:opacity-50";
const statusText: Record<LocalGroupsSnapshot["status"], string> = {
  empty: "No saved groups yet. Changes stay local to this browser.",
  saved: "Saved in this browser only. No account sync or ownership verification.",
  memory: "Memory only — browser storage is unavailable or full. Changes are not saved and will be lost on reload.",
  blocked: "Stored data is invalid, too large or from a newer version. It has not been overwritten. Edits are memory only and not saved.",
  conflict: "Storage conflict — another tab changed these groups. Your edits are memory only, not saved. Writes are paused to avoid replacing that tab’s data.",
};

function GroupEditor({ group, state, selected, onSelect, onChange }: {
  group: LocalWalletGroup; state: LocalGroupsState; selected: boolean;
  onSelect: () => void; onChange: (change: (state: LocalGroupsState) => LocalGroupsState) => boolean;
}) {
  const [name, setName] = useState(group.name);
  const [address, setAddress] = useState("");
  useEffect(() => setName(group.name), [group.name]);
  function add(event: FormEvent) {
    event.preventDefault();
    if (onChange((current) => addSource(current, { groupId: group.id, oid: crypto.randomUUID(), address, sourceType: "WALLET" }))) setAddress("");
  }
  return <li className="space-y-3 rounded-xl border border-border p-3">
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" checked={selected} onChange={onSelect} />
      <span className="break-all">{group.name}</span>
      <span className="text-xs text-muted">{group.memberIds.length} addresses</span>
    </label>
    <form className="flex flex-wrap gap-2" onSubmit={(event) => {
      event.preventDefault(); onChange((current) => renameGroup(current, group.id, name));
    }}>
      <input aria-label={`Name for ${group.name}`} value={name} maxLength={MAX_GROUP_NAME_LENGTH} onChange={(event) => setName(event.target.value)} className={inputClass} required />
      <button type="submit" className={buttonClass}>Rename</button>
      <button type="button" className={buttonClass} onClick={() => onChange((current) => deleteGroup(current, group.id))}>Delete group</button>
    </form>
    <ul className="space-y-2">
      {group.memberIds.map((id) => {
        const source = state.sources.find((item) => item.id === id);
        if (!source) return null;
        return <li key={id} className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 break-all font-mono">{source.displayAddress} <span className="text-muted">{source.vm} · {source.sourceType}</span></span>
          <button type="button" className={buttonClass} aria-label={`Remove ${source.displayAddress} from ${group.name}`} onClick={() => onChange((current) => removeMember(current, group.id, id))}>Remove</button>
        </li>;
      })}
    </ul>
    <form className="flex flex-wrap gap-2" onSubmit={add}>
      <input aria-label={`Public address for ${group.name}`} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Public wallet address" className={`${inputClass} flex-1`} autoComplete="off" spellCheck={false} required />
      <button type="submit" className={buttonClass}>Add address</button>
    </form>
  </li>;
}

export function MyGroups({ chains, onExplore }: { chains: readonly string[]; onExplore: (href: string) => void }) {
  const [snapshot, setSnapshot] = useState<LocalGroupsSnapshot>({ state: createEmptyState(), raw: null, status: "empty", saved: false });
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSnapshot(readLocalGroups(browserStorage())); setReady(true);
    const changed = (event: StorageEvent) => {
      if (event.key !== localGroupsStorageKey() && event.key !== null) return;
      setSnapshot((previous) => ({ ...previous, saved: false, status: previous.status === "blocked" ? "blocked" : "conflict" }));
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  function change(update: (state: LocalGroupsState) => LocalGroupsState): boolean {
    try {
      const next = writeLocalGroups(browserStorage(), snapshot, update(snapshot.state));
      setSnapshot(next);
      setSelected((previous) => previous.filter((id) => next.state.groups.some((group) => group.id === id)));
      setError(null);
      return true;
    } catch {
      setError("Change refused. Check the name or public address and group limits (50 groups, 100 addresses per group, 500 sources total). Nothing was saved.");
      return false;
    }
  }
  const href = localGroupsExploreHref(snapshot.state, selected, chains);
  return <section aria-label="My Groups" className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-6">
    <div><h2 className="text-base font-semibold">My Groups</h2>
      <p className="mt-1 text-xs text-muted">Local to this browser. Group names never enter the scan URL. Public addresses only; no signatures. Selecting groups does not scan.</p></div>
    <p role="status" aria-live="polite" className="text-xs text-muted">{ready ? statusText[snapshot.status] : "Loading local groups…"}</p>
    {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
    <form className="flex flex-wrap gap-2" onSubmit={(event) => {
      event.preventDefault();
      if (change((current) => createGroup(current, { id: crypto.randomUUID(), name }))) setName("");
    }}>
      <input aria-label="New group name" value={name} onChange={(event) => setName(event.target.value)} maxLength={MAX_GROUP_NAME_LENGTH} required className={inputClass} placeholder="Group name" />
      <button type="submit" disabled={!ready} className={buttonClass}>Create group</button>
    </form>
    <ul className="space-y-3">{snapshot.state.groups.map((group) => <GroupEditor key={group.id} group={group} state={snapshot.state} selected={selected.includes(group.id)} onSelect={() => setSelected((previous) => previous.includes(group.id) ? previous.filter((id) => id !== group.id) : [...previous, group.id])} onChange={change} />)}</ul>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={`${buttonClass} text-accent`} disabled={!ready || !href} onClick={() => { if (href) onExplore(href); }}>Explore group</button>
      {snapshot.status === "conflict" ? <button type="button" className={buttonClass} onClick={() => {
        setSnapshot(readLocalGroups(browserStorage())); setSelected([]); setError(null);
      }}>Discard memory edits and reload saved groups</button> : null}
    </div>
    {selected.length > 0 && !href ? <p role="status" className="text-xs text-muted">Select a chain and a non-empty public-wallet group. CEX sources and case-distinct addresses that the existing scanner could merge cannot be explored together.</p> : null}
    <p className="text-xs text-muted">Explore opens the existing scanner using only selected group addresses and current chains. Names stay local. Removing an address only removes its group membership; deleting a group does not delete sources or scan results.</p>
  </section>;
}
