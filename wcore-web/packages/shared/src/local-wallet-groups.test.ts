import { describe, it, expect } from "vitest";
import {
  GROUPS_SCHEMA_VERSION,
  MAX_GROUPS,
  MAX_SOURCES_PER_GROUP,
  localGroupsStorageKey,
  createEmptyState,
  createGroup,
  renameGroup,
  deleteGroup,
  addSource,
  addMember,
  removeMember,
  removeSource,
  unionGroupSources,
  sourceIdentity,
  partyOf,
  serializeGroups,
  parseGroups,
} from "./local-wallet-groups";

const EVM_MIXED = "0x17d518736Ee9341dcDc0A2498e013D33cFcDD080";
const EVM_LOWER = EVM_MIXED.toLowerCase();
const SVM_A = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const TON_RAW = "-1:8a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef";

function oneGroup(name = "A") {
  return createGroup(createEmptyState(), { id: "g1", name });
}

describe("group lifecycle", () => {
  it("creates a group with a stable id and leaves prior states untouched", () => {
    const s0 = createEmptyState();
    const s1 = createGroup(s0, { id: "g1", name: "Long term" });
    const s2 = createGroup(s1, { id: "g2", name: "Trading" });
    expect(s2.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(s2.groups[0]!.name).toBe("Long term");
    expect(s1.groups).toHaveLength(1);
    expect(s0.groups).toHaveLength(0);
  });

  it("rejects duplicate ids, empty names and oversized names", () => {
    const s = oneGroup();
    expect(() => createGroup(s, { id: "g1", name: "B" })).toThrow();
    expect(() => createGroup(s, { id: "g2", name: "   " })).toThrow();
    expect(() => createGroup(s, { id: "g3", name: "x".repeat(65) })).toThrow();
  });

  it("renames and deletes a group without touching source records", () => {
    let s = oneGroup();
    s = addSource(s, { groupId: "g1", oid: "s1", address: EVM_MIXED, sourceType: "WALLET" });
    s = renameGroup(s, "g1", "Renamed");
    expect(s.groups[0]!.name).toBe("Renamed");
    expect(s.sources).toHaveLength(1);

    s = deleteGroup(s, "g1");
    expect(s.groups).toHaveLength(0);
    expect(s.sources).toHaveLength(1);
  });
});

describe("source identity", () => {
  it("normalizes EVM identity while preserving the display form", () => {
    const id = sourceIdentity({ address: EVM_MIXED, sourceType: "WALLET" });
    expect(id.vm).toBe("EVM");
    expect(id.key).toBe(`WALLET|EVM|${EVM_LOWER}`);
    expect(id.displayAddress).toBe(EVM_MIXED);
    expect(id.party).toBe(`EVM|${EVM_LOWER}`);
  });

  it("treats EVM case variants as one source in a group", () => {
    let s = oneGroup();
    s = addSource(s, { groupId: "g1", oid: "s1", address: EVM_MIXED, sourceType: "WALLET" });
    s = addSource(s, { groupId: "g1", oid: "s2", address: EVM_LOWER, sourceType: "WALLET" });
    expect(s.groups[0]!.memberIds).toEqual(["s1"]);
    expect(s.sources).toHaveLength(1);
  });

  it("never lowercases case-sensitive VM formats", () => {
    const id = sourceIdentity({ address: SVM_A, sourceType: "WALLET" });
    expect(id.vm).toBe("SVM");
    expect(id.party).toBe(`SVM|${SVM_A}`);
  });

  it("refuses invalid or unsupported addresses instead of inventing a merge", () => {
    expect(() => sourceIdentity({ address: "not-an-address", sourceType: "WALLET" })).toThrow();
    expect(() => sourceIdentity({ address: TON_RAW, sourceType: "WALLET" })).toThrow();
    expect(() => sourceIdentity({ address: "", sourceType: "WALLET" })).toThrow();
  });

  it("separates source type from address identity", () => {
    const wallet = sourceIdentity({ address: EVM_MIXED, sourceType: "WALLET" });
    const cex = sourceIdentity({ address: EVM_MIXED, sourceType: "CEX" });
    expect(wallet.key).not.toBe(cex.key);
    expect(wallet.party).toBe(cex.party);
  });

  it("keeps distinct wallets distinct even with the same asset", () => {
    expect(partyOf(EVM_MIXED)).not.toBe(partyOf("0x0000000000000000000000000000000000000001"));
  });
});

describe("membership and deduplication", () => {
  it("supports one source in several groups and a deduplicated union", () => {
    let s = oneGroup();
    s = createGroup(s, { id: "g2", name: "B" });
    s = addSource(s, { groupId: "g1", oid: "s1", address: EVM_MIXED, sourceType: "WALLET" });
    s = addSource(s, { groupId: "g1", oid: "s2", address: SVM_A, sourceType: "WALLET" });
    s = addMember(s, "g2", "s1");

    expect(s.groups[0]!.memberIds).toEqual(["s1", "s2"]);
    expect(s.groups[1]!.memberIds).toEqual(["s1"]);
    expect(unionGroupSources(s, ["g1", "g2"])).toEqual(["s1", "s2"]);
    expect(unionGroupSources(s, ["g2", "g2"])).toEqual(["s1"]);
  });

  it("does not duplicate a member added twice", () => {
    let s = oneGroup();
    s = addSource(s, { groupId: "g1", oid: "s1", address: EVM_MIXED, sourceType: "WALLET" });
    s = addMember(s, "g1", "s1");
    expect(s.groups[0]!.memberIds).toEqual(["s1"]);
  });

  it("removes a member without deleting its source record", () => {
    let s = oneGroup();
    s = addSource(s, { groupId: "g1", oid: "s1", address: EVM_MIXED, sourceType: "WALLET" });
    s = removeMember(s, "g1", "s1");
    expect(s.groups[0]!.memberIds).toEqual([]);
    expect(s.sources).toHaveLength(1);

    s = removeSource(s, "s1");
    expect(s.sources).toHaveLength(0);
  });

  it("refuses an unknown source id instead of creating a dangling member", () => {
    expect(() => addMember(oneGroup(), "g1", "ghost")).toThrow();
  });

  it("bounds group count and membership size", () => {
    let s = createEmptyState();
    for (let i = 0; i < MAX_GROUPS; i++) s = createGroup(s, { id: `g${i}`, name: `G${i}` });
    expect(() => createGroup(s, { id: "overflow", name: "X" })).toThrow();
    expect(s.groups).toHaveLength(MAX_GROUPS);
    expect(MAX_SOURCES_PER_GROUP).toBeGreaterThan(0);
  });
});

describe("persistence", () => {
  it("round-trips a versioned state and namespaces the storage key", () => {
    let s = oneGroup();
    s = addSource(s, { groupId: "g1", oid: "s1", address: EVM_MIXED, sourceType: "WALLET" });
    const raw = serializeGroups(s);
    const parsed = parseGroups(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state).toEqual(s);
    expect(parsed.state.schemaVersion).toBe(GROUPS_SCHEMA_VERSION);
    expect(localGroupsStorageKey()).toBe("wcore.local-wallet-groups.v1");
    expect(localGroupsStorageKey()).not.toMatch(/addr/i);
  });

  it("never throws and never wipes unrelated data on corrupt input", () => {
    for (const raw of ["{", "null", "[]", '{"schemaVersion":99}', '{"schemaVersion":1,"groups":"x"}']) {
      const parsed = parseGroups(raw);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.reason).toBeTruthy();
      expect(parsed.state).toBeNull();
    }
  });

  it("rejects two source ids with the same canonical identity on reload", () => {
    let s = oneGroup();
    s = addSource(s, { groupId: "g1", oid: "s1", address: "0x0000000000000000000000000000000000000001", sourceType: "WALLET" });
    const tampered = JSON.parse(serializeGroups(s));
    tampered.sources.push({ ...tampered.sources[0], id: "same-wallet-other-id" });
    tampered.groups[0].memberIds.push("same-wallet-other-id");
    const parsed = parseGroups(JSON.stringify(tampered));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("DUPLICATE_SOURCE_IDENTITY");
  });

  it("rejects unknown member references instead of silently dropping them", () => {
    const tampered = JSON.parse(serializeGroups(oneGroup()));
    tampered.groups[0].memberIds = ["ghost"];
    const parsed = parseGroups(JSON.stringify(tampered));
    expect(parsed.ok).toBe(false);
  });
});
