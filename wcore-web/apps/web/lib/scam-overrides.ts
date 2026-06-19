// Pure helpers for the admin scam-override entries stored in localStorage.
// Each entry is either a string (symbol-only / wildcard) or an object
// { symbol, contract } (contract-aware). The chain-aware variant lets the
// admin block a specific contract address (e.g. a scam USDC clone) without
// killing every USDC across the user's portfolio.

export type ScamEntry = string | { symbol?: string; contract?: string };

export interface ScamTokenInput {
  symbol: string;
  contract?: string;
}

export interface ScamOverrides {
  blocked: ScamEntry[];
  approved: ScamEntry[];
}

function entrySymbol(entry: ScamEntry): string | undefined {
  return typeof entry === "string" ? entry : entry.symbol;
}

function entryContract(entry: ScamEntry): string | undefined {
  return typeof entry === "string" ? undefined : entry.contract;
}

export function isSymbolBlocked(entries: ScamEntry[], symbol: string): boolean {
  if (!symbol) return false;
  const target = symbol.toUpperCase();
  for (const e of entries) {
    const s = entrySymbol(e);
    if (!s) continue;
    if (s.toUpperCase() === target && !entryContract(e)) return true;
  }
  return false;
}

export function isContractBlocked(entries: ScamEntry[], symbol: string, contract: string | undefined): boolean {
  if (!symbol || !contract) return false;
  const targetSymbol = symbol.toUpperCase();
  const targetContract = contract.toLowerCase();
  for (const e of entries) {
    const s = entrySymbol(e);
    const c = entryContract(e);
    if (!s || !c) continue;
    if (s.toUpperCase() === targetSymbol && c.toLowerCase() === targetContract) return true;
  }
  return false;
}

export function isSymbolApproved(entries: ScamEntry[], symbol: string): boolean {
  return isSymbolBlocked(entries, symbol);
}

export function isContractApproved(entries: ScamEntry[], symbol: string, contract: string | undefined): boolean {
  return isContractBlocked(entries, symbol, contract);
}

export function applyScamOverrides<T extends ScamTokenInput>(
  tokens: T[],
  blockedEntries: ScamEntry[],
  _approvedEntries: ScamEntry[],
): T[] {
  return tokens.filter(t => {
    if (isContractBlocked(blockedEntries, t.symbol, t.contract)) return false;
    if (isSymbolBlocked(blockedEntries, t.symbol)) return false;
    return true;
  });
}

const BLOCKED_STORAGE_KEY = "wcore_scam_blocked";
const APPROVED_STORAGE_KEY = "wcore_scam_approved";

function readEntries(key: string): ScamEntry[] {
  if (typeof window === "undefined") return [];
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidEntry);
}

function isValidEntry(e: unknown): e is ScamEntry {
  if (typeof e === "string") return e.length > 0;
  if (e && typeof e === "object") {
    const obj = e as { symbol?: unknown; contract?: unknown };
    const symbolOk = obj.symbol === undefined || typeof obj.symbol === "string";
    const contractOk = obj.contract === undefined || typeof obj.contract === "string";
    return symbolOk && contractOk;
  }
  return false;
}

export function readScamOverrides(): ScamOverrides {
  return {
    blocked: readEntries(BLOCKED_STORAGE_KEY),
    approved: readEntries(APPROVED_STORAGE_KEY),
  };
}

export type ScamOverrideKind = "blocked" | "approved";

function storageKeyFor(kind: ScamOverrideKind): string {
  return kind === "blocked" ? BLOCKED_STORAGE_KEY : APPROVED_STORAGE_KEY;
}

function isSameEntry(a: ScamEntry, b: ScamEntry): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildScamEntry(symbol: string, contract?: string): ScamEntry {
  if (!contract || contract === "native") return symbol;
  return { symbol, contract };
}

export function writeScamOverride(kind: ScamOverrideKind, entry: ScamEntry): void {
  if (typeof window === "undefined") return;
  try {
    const list = readEntries(storageKeyFor(kind));
    const filtered = list.filter(e => !isSameEntry(e, entry));
    filtered.push(entry);
    window.localStorage.setItem(storageKeyFor(kind), JSON.stringify(filtered));
  } catch { /* quota exceeded or storage disabled */ }
}

export function removeScamOverride(kind: ScamOverrideKind, entry: ScamEntry): void {
  if (typeof window === "undefined") return;
  try {
    const list = readEntries(storageKeyFor(kind));
    const filtered = list.filter(e => !isSameEntry(e, entry));
    window.localStorage.setItem(storageKeyFor(kind), JSON.stringify(filtered));
  } catch { /* quota exceeded or storage disabled */ }
}

export const SCAM_OVERRIDE_STORAGE_KEYS = {
  blocked: BLOCKED_STORAGE_KEY,
  approved: APPROVED_STORAGE_KEY,
} as const;
