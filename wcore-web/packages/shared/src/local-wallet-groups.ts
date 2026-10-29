/**
 * WCORE — groupes locaux d'adresses publiques (modèle PUR, sans DOM ni réseau).
 *
 * Objectif : permettre de regrouper des sources suivies sans imposer de
 * signature ni de synchronisation serveur. Ce module ne réalise AUCUN scan,
 * ne calcule aucune valorisation et ne prouve aucune propriété de wallet.
 *
 * Invariants :
 * - une identité EVM est insensible à la casse, mais l'affichage d'origine est
 *   conservé ; les VM sensibles à la casse ne sont jamais lowercase ;
 * - une adresse invalide ou ambiguë est refusée, jamais fusionnée par défaut ;
 * - une même source peut appartenir à plusieurs groupes, mais n'est comptée
 *   qu'une fois dans l'union ;
 * - supprimer un groupe ne supprime ni source, ni résultat, ni donnée serveur ;
 * - un stockage corrompu est refusé sans effacement d'autres données.
 *
 * Limite explicite : la déduplication porte sur l'IDENTITÉ DE SOURCE. La
 * consolidation par actif et l'anti-double-comptage DeFi restent hors de cette
 * tranche.
 */
import { AnyAddress, EvmAddress, SvmAddress, CosmosAddress, TonAddress } from "./address";
import type { VmType } from "./vm";

export const GROUPS_SCHEMA_VERSION = 1 as const;
export const MAX_GROUPS = 50;
export const MAX_SOURCES_PER_GROUP = 100;
export const MAX_SOURCES_TOTAL = 500;
export const MAX_GROUP_NAME_LENGTH = 64;
export const MAX_IDENTIFIER_LENGTH = 64;

export type LocalSourceType = "WALLET" | "CEX";

export interface SourceIdentity {
  readonly vm: VmType;
  /** Identité de source : type de source + VM + adresse normalisée. */
  readonly key: string;
  /** Identité du porteur d'adresse, indépendante du type de source. */
  readonly party: string;
  /** Forme brute à afficher, jamais utilisée comme clé. */
  readonly displayAddress: string;
}

export interface LocalSourceRecord extends SourceIdentity {
  readonly id: string;
  readonly sourceType: LocalSourceType;
}

export interface LocalWalletGroup {
  readonly id: string;
  readonly name: string;
  readonly memberIds: readonly string[];
}

export interface LocalGroupsState {
  readonly schemaVersion: typeof GROUPS_SCHEMA_VERSION;
  readonly groups: readonly LocalWalletGroup[];
  readonly sources: readonly LocalSourceRecord[];
}

export type ParseGroupsResult =
  | { ok: true; state: LocalGroupsState }
  | { ok: false; state: null; reason: string };

function fail(message: string): never {
  throw new TypeError(message);
}

function requireIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string") fail(`${label}_NOT_STRING`);
  const trimmed = value.trim();
  if (!trimmed) fail(`${label}_EMPTY`);
  if (trimmed.length > MAX_IDENTIFIER_LENGTH) fail(`${label}_TOO_LONG`);
  return trimmed;
}

function requireName(value: unknown): string {
  if (typeof value !== "string") fail("GROUP_NAME_NOT_STRING");
  const trimmed = value.trim();
  if (!trimmed) fail("GROUP_NAME_EMPTY");
  if (trimmed.length > MAX_GROUP_NAME_LENGTH) fail("GROUP_NAME_TOO_LONG");
  return trimmed;
}

/**
 * Détecte la famille VM. Une adresse ambiguë (plusieurs familles valides) est
 * refusée : mieux vaut aucune identité qu'une fusion inventée.
 */
export function detectAddressFamily(address: string): VmType {
  const families: VmType[] = [];
  if (EvmAddress.safeParse(address).success) families.push("EVM");
  if (SvmAddress.safeParse(address).success) families.push("SVM");
  if (CosmosAddress.safeParse(address).success) families.push("COSMOS");
  if (TonAddress.safeParse(address).success) families.push("TON");
  if (families.length === 0) fail("INVALID_OR_UNSUPPORTED_ADDRESS");
  if (families.length > 1) fail("AMBIGUOUS_ADDRESS");
  const [only] = families;
  if (!only) fail("INVALID_OR_UNSUPPORTED_ADDRESS");
  return only;
}

function normalizeForVm(vm: VmType, address: string): string {
  switch (vm) {
    case "EVM": {
      const parsed = EvmAddress.safeParse(address);
      if (!parsed.success) fail("INVALID_EVM_ADDRESS");
      return parsed.data; // déjà lowercase
    }
    case "SVM": {
      const parsed = SvmAddress.safeParse(address);
      if (!parsed.success) fail("INVALID_SVM_ADDRESS");
      return parsed.data; // base58 : casse significative
    }
    case "COSMOS": {
      const parsed = CosmosAddress.safeParse(address);
      if (!parsed.success) fail("INVALID_COSMOS_ADDRESS");
      return parsed.data;
    }
    case "TON": {
      const parsed = TonAddress.safeParse(address);
      if (!parsed.success) fail("INVALID_TON_ADDRESS");
      return parsed.data;
    }
    default:
      return fail("UNSUPPORTED_VM");
  }
}

export function sourceIdentity(input: { address: string; sourceType: LocalSourceType }): SourceIdentity {
  if (typeof input.address !== "string") fail("ADDRESS_NOT_STRING");
  const displayAddress = input.address.trim();
  if (!displayAddress) fail("ADDRESS_EMPTY");
  if (input.sourceType !== "WALLET" && input.sourceType !== "CEX") fail("INVALID_SOURCE_TYPE");

  // AnyAddress garantit qu'aucun format non supporté n'entre silencieusement.
  if (!AnyAddress.safeParse(displayAddress).success) fail("INVALID_OR_UNSUPPORTED_ADDRESS");

  const vm = detectAddressFamily(displayAddress);
  const normalized = normalizeForVm(vm, displayAddress);
  return {
    vm,
    key: `${input.sourceType}|${vm}|${normalized}`,
    party: `${vm}|${normalized}`,
    displayAddress,
  };
}

export function partyOf(address: string): string {
  return sourceIdentity({ address, sourceType: "WALLET" }).party;
}

export function createEmptyState(): LocalGroupsState {
  return { schemaVersion: GROUPS_SCHEMA_VERSION, groups: [], sources: [] };
}

export function createGroup(state: LocalGroupsState, input: { id: string; name: string }): LocalGroupsState {
  const id = requireIdentifier(input.id, "GROUP_ID");
  const name = requireName(input.name);
  if (state.groups.length >= MAX_GROUPS) fail("TOO_MANY_GROUPS");
  if (state.groups.some((g) => g.id === id)) fail("DUPLICATE_GROUP_ID");
  return { ...state, groups: [...state.groups, { id, name, memberIds: [] }] };
}

export function renameGroup(state: LocalGroupsState, groupId: string, name: string): LocalGroupsState {
  const id = requireIdentifier(groupId, "GROUP_ID");
  const nextName = requireName(name);
  if (!state.groups.some((g) => g.id === id)) fail("UNKNOWN_GROUP");
  return { ...state, groups: state.groups.map((g) => (g.id === id ? { ...g, name: nextName } : g)) };
}

/** Supprime le groupe seul. Les sources restent enregistrées. */
export function deleteGroup(state: LocalGroupsState, groupId: string): LocalGroupsState {
  const id = requireIdentifier(groupId, "GROUP_ID");
  if (!state.groups.some((g) => g.id === id)) fail("UNKNOWN_GROUP");
  return { ...state, groups: state.groups.filter((g) => g.id !== id) };
}

function requireGroup(state: LocalGroupsState, groupId: string): LocalWalletGroup {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) fail("UNKNOWN_GROUP");
  return group;
}

function addMembership(state: LocalGroupsState, groupId: string, sourceId: string): LocalGroupsState {
  const group = requireGroup(state, groupId);
  if (group.memberIds.includes(sourceId)) return state;
  if (group.memberIds.length >= MAX_SOURCES_PER_GROUP) fail("GROUP_MEMBERSHIP_FULL");
  return {
    ...state,
    groups: state.groups.map((g) => (g.id === groupId ? { ...g, memberIds: [...g.memberIds, sourceId] } : g)),
  };
}

/**
 * Ajoute une source et son appartenance. Une identité déjà connue réutilise
 * l'enregistrement existant : aucun doublon d'adresse normalisée.
 */
export function addSource(
  state: LocalGroupsState,
  input: { groupId: string; oid: string; address: string; sourceType: LocalSourceType },
): LocalGroupsState {
  requireGroup(state, input.groupId);
  const identity = sourceIdentity({ address: input.address, sourceType: input.sourceType });

  const existing = state.sources.find((s) => s.key === identity.key);
  if (existing) return addMembership(state, input.groupId, existing.id);

  const id = requireIdentifier(input.oid, "SOURCE_ID");
  if (state.sources.some((s) => s.id === id)) fail("DUPLICATE_SOURCE_ID");
  if (state.sources.length >= MAX_SOURCES_TOTAL) fail("TOO_MANY_SOURCES");

  const record: LocalSourceRecord = { id, sourceType: input.sourceType, ...identity };
  return addMembership({ ...state, sources: [...state.sources, record] }, input.groupId, id);
}

export function addMember(state: LocalGroupsState, groupId: string, sourceId: string): LocalGroupsState {
  const id = requireIdentifier(sourceId, "SOURCE_ID");
  if (!state.sources.some((s) => s.id === id)) fail("UNKNOWN_SOURCE");
  return addMembership(state, groupId, id);
}

export function removeMember(state: LocalGroupsState, groupId: string, sourceId: string): LocalGroupsState {
  const id = requireIdentifier(sourceId, "SOURCE_ID");
  requireGroup(state, groupId);
  return {
    ...state,
    groups: state.groups.map((g) =>
      g.id === groupId ? { ...g, memberIds: g.memberIds.filter((m) => m !== id) } : g,
    ),
  };
}

/** Supprime l'enregistrement de source et ses appartenances connues. */
export function removeSource(state: LocalGroupsState, sourceId: string): LocalGroupsState {
  const id = requireIdentifier(sourceId, "SOURCE_ID");
  if (!state.sources.some((s) => s.id === id)) fail("UNKNOWN_SOURCE");
  return {
    ...state,
    sources: state.sources.filter((s) => s.id !== id),
    groups: state.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => m !== id) })),
  };
}

/** Union dédupliquée des membres de plusieurs groupes, en conservant l'ordre. */
export function unionGroupSources(state: LocalGroupsState, groupIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const groupId of groupIds) {
    const group = state.groups.find((g) => g.id === groupId);
    if (!group) continue;
    for (const memberId of group.memberIds) {
      if (seen.has(memberId)) continue;
      seen.add(memberId);
      out.push(memberId);
    }
  }
  return out;
}

/** Clé de stockage namespacée : aucune adresse, aucun alias dans la clé. */
export function localGroupsStorageKey(): string {
  return `wcore.local-wallet-groups.v${GROUPS_SCHEMA_VERSION}`;
}

export function serializeGroups(state: LocalGroupsState): string {
  return JSON.stringify(state);
}

/**
 * Lit un état potentiellement corrompu sans jamais lever ni effacer quoi que
 * ce soit. `ok:false` laisse l'appelant décider (ignorer ce blob uniquement).
 */
export function parseGroups(raw: unknown): ParseGroupsResult {
  try {
    if (typeof raw !== "string") return { ok: false, state: null, reason: "NOT_A_STRING" };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, state: null, reason: "NOT_AN_OBJECT" };
    }
    const candidate = parsed as Record<string, unknown>;
    if (candidate.schemaVersion !== GROUPS_SCHEMA_VERSION) return { ok: false, state: null, reason: "UNSUPPORTED_VERSION" };
    if (!Array.isArray(candidate.groups) || !Array.isArray(candidate.sources)) {
      return { ok: false, state: null, reason: "INVALID_SHAPE" };
    }
    if (candidate.groups.length > MAX_GROUPS || candidate.sources.length > MAX_SOURCES_TOTAL) {
      return { ok: false, state: null, reason: "BOUNDS_EXCEEDED" };
    }

    const sources: LocalSourceRecord[] = [];
    for (const entry of candidate.sources) {
      if (typeof entry !== "object" || entry === null) return { ok: false, state: null, reason: "INVALID_SOURCE" };
      const s = entry as Record<string, unknown>;
      const id = requireIdentifier(s.id, "SOURCE_ID");
      if (sources.some((x) => x.id === id)) return { ok: false, state: null, reason: "DUPLICATE_SOURCE_ID" };
      if (s.sourceType !== "WALLET" && s.sourceType !== "CEX") return { ok: false, state: null, reason: "INVALID_SOURCE_TYPE" };
      let identity: SourceIdentity;
      try {
        identity = sourceIdentity({ address: String(s.displayAddress ?? ""), sourceType: s.sourceType });
      } catch {
        return { ok: false, state: null, reason: "INVALID_SOURCE_ADDRESS" };
      }
      if (identity.key !== s.key || identity.party !== s.party) {
        return { ok: false, state: null, reason: "SOURCE_IDENTITY_MISMATCH" };
      }
      if (sources.some((source) => source.key === identity.key)) {
        return { ok: false, state: null, reason: "DUPLICATE_SOURCE_IDENTITY" };
      }
      sources.push({ id, sourceType: s.sourceType, ...identity });
    }

    const groups: LocalWalletGroup[] = [];
    for (const entry of candidate.groups) {
      if (typeof entry !== "object" || entry === null) return { ok: false, state: null, reason: "INVALID_GROUP" };
      const g = entry as Record<string, unknown>;
      const id = requireIdentifier(g.id, "GROUP_ID");
      const name = requireName(g.name);
      if (groups.some((x) => x.id === id)) return { ok: false, state: null, reason: "DUPLICATE_GROUP_ID" };
      if (!Array.isArray(g.memberIds)) return { ok: false, state: null, reason: "INVALID_MEMBERS" };
      if (g.memberIds.length > MAX_SOURCES_PER_GROUP) return { ok: false, state: null, reason: "BOUNDS_EXCEEDED" };
      const memberIds: string[] = [];
      for (const memberId of g.memberIds) {
        const mid = requireIdentifier(memberId, "SOURCE_ID");
        if (!sources.some((s) => s.id === mid)) return { ok: false, state: null, reason: "UNKNOWN_MEMBER" };
        if (!memberIds.includes(mid)) memberIds.push(mid);
      }
      groups.push({ id, name, memberIds });
    }

    return { ok: true, state: { schemaVersion: GROUPS_SCHEMA_VERSION, groups, sources } };
  } catch {
    return { ok: false, state: null, reason: "MALFORMED_STATE" };
  }
}
