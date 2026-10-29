import {
  createEmptyState, localGroupsStorageKey, parseGroups, serializeGroups,
  sourceIdentity, unionGroupSources, type LocalGroupsState,
} from "@wcore/shared";

// Bound bytes before JSON parsing as well as before writes (UTF-8, not code units).
export const MAX_LOCAL_GROUPS_BYTES = 1024 * 1024;
export type GroupsStorage = Pick<Storage, "getItem" | "setItem">;
export interface LocalGroupsSnapshot {
  state: LocalGroupsState;
  raw: string | null;
  saved: boolean;
  status: "empty" | "saved" | "memory" | "blocked" | "conflict";
}
const withinBounds = (raw: string) => raw.length <= MAX_LOCAL_GROUPS_BYTES && new TextEncoder().encode(raw).byteLength <= MAX_LOCAL_GROUPS_BYTES;

export function readLocalGroups(storage: GroupsStorage | null): LocalGroupsSnapshot {
  const empty: LocalGroupsSnapshot = { state: createEmptyState(), raw: null, saved: false, status: "empty" };
  try {
    if (!storage) return { ...empty, status: "memory" };
    const raw = storage.getItem(localGroupsStorageKey());
    if (raw === null) return empty;
    if (!withinBounds(raw)) return { ...empty, raw, status: "blocked" };
    const parsed = parseGroups(raw);
    return parsed.ok
      ? { state: parsed.state, raw, saved: true, status: "saved" }
      : { ...empty, raw, status: "blocked" };
  } catch {
    return { ...empty, status: "memory" };
  }
}

/** Optimistic comparison only: localStorage has no atomic compare-and-swap. */
export function writeLocalGroups(storage: GroupsStorage | null, previous: LocalGroupsSnapshot, state: LocalGroupsState): LocalGroupsSnapshot {
  const raw = serializeGroups(state);
  if (!withinBounds(raw)) throw new TypeError("LOCAL_GROUPS_STORAGE_TOO_LARGE");
  const parsed = parseGroups(raw);
  if (!parsed.ok) throw new TypeError("INVALID_LOCAL_GROUPS_STATE");
  const next: LocalGroupsSnapshot = { ...previous, state: parsed.state, saved: false };
  if (previous.status === "blocked" || previous.status === "conflict") return next;
  try {
    if (!storage) return { ...next, status: "memory" };
    if (storage.getItem(localGroupsStorageKey()) !== previous.raw) return { ...next, status: "conflict" };
    storage.setItem(localGroupsStorageKey(), raw);
    if (storage.getItem(localGroupsStorageKey()) !== raw) return { ...next, status: "conflict" };
    return { state: parsed.state, raw, saved: true, status: "saved" };
  } catch {
    return { ...next, status: "memory" };
  }
}

/** Public targets only; no group metadata, connected wallet, linked wallet or analytics. */
export function localGroupsExploreHref(state: LocalGroupsState, ids: readonly string[], chains: readonly string[]): string | null {
  if (!chains.length) return null;
  const members = unionGroupSources(state, ids);
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const id of members) {
    const source = state.sources.find((item) => item.id === id);
    if (!source || source.sourceType !== "WALLET") return null;
    const identity = sourceIdentity({ address: source.displayAddress, sourceType: source.sourceType });
    if (seen.has(identity.key)) continue;
    seen.add(identity.key);
    targets.push(identity.vm === "EVM" ? identity.displayAddress.toLowerCase() : identity.displayAddress);
  }
  // Legacy scanner compares all addresses lowercase. Refuse a distinct pair it
  // would collapse; do not pretend this adapter fixes the downstream scanner.
  if (!targets.length || new Set(targets.map((target) => target.toLowerCase())).size !== targets.length) return null;
  const params = new URLSearchParams({ chains: chains.join(","), deep: "0" });
  return `/wallet/${encodeURIComponent(targets.join(","))}?${params}`;
}
