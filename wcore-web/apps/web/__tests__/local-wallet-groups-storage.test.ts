import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmptyState, createGroup, addSource, localGroupsStorageKey, serializeGroups } from "@wcore/shared";

async function adapter() {
  const mod = await import("../lib/local-wallet-groups-storage").catch(() => null);
  assert.ok(mod, "local groups browser adapter must exist");
  return mod;
}
function storage() {
  const values = new Map<string, string>([["other", "untouched"]]);
  return { values, getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
}
const group = () => createGroup(createEmptyState(), { id: "g", name: "Private name" });

test("restores only validated v1 state and saves only its namespace", async () => {
  const api = await adapter();
  const s = storage();
  const initial = api.readLocalGroups(s);
  assert.equal(initial.saved, false);
  const saved = api.writeLocalGroups(s, initial, group());
  assert.equal(saved.saved, true);
  assert.equal(saved.status, "saved");
  assert.deepEqual(api.readLocalGroups(s).state, group());
  assert.equal(s.values.get("other"), "untouched");
  assert.equal(s.values.size, 2);
});

test("corrupt, future and oversized blobs are preserved, not overwritten", async () => {
  const api = await adapter();
  for (const raw of ["{", '{"schemaVersion":2,"groups":[],"sources":[]}', " ".repeat(api.MAX_LOCAL_GROUPS_BYTES + 1)]) {
    const s = storage(); s.setItem(localGroupsStorageKey(), raw);
    const loaded = api.readLocalGroups(s);
    assert.equal(loaded.status, "blocked");
    assert.equal(loaded.saved, false);
    const result = api.writeLocalGroups(s, loaded, group());
    assert.equal(result.saved, false);
    assert.equal(result.status, "blocked");
    assert.equal(s.getItem(localGroupsStorageKey()), raw);
    assert.deepEqual(result.state, group()); // useful in memory without destroying evidence
  }
});

test("unavailable reads or failed writes retain usable memory state, never saved", async () => {
  const api = await adapter();
  const denied = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  const loaded = api.readLocalGroups(denied);
  const changed = api.writeLocalGroups(denied, loaded, group());
  assert.equal(changed.status, "memory"); assert.equal(changed.saved, false);
  assert.deepEqual(changed.state, group());
  const quota = { getItem: () => null, setItem() { throw new Error("quota"); } };
  assert.equal(api.writeLocalGroups(quota, api.readLocalGroups(quota), group()).status, "memory");
  assert.equal(api.readLocalGroups(null).saved, false);
});

test("compare-before-write detects a multi-tab conflict without replacing remote or local state", async () => {
  const api = await adapter(); const s = storage();
  const tabA = api.readLocalGroups(s); const tabB = api.readLocalGroups(s);
  const remote = createGroup(createEmptyState(), { id: "b", name: "Remote" });
  api.writeLocalGroups(s, tabB, remote);
  const conflict = api.writeLocalGroups(s, tabA, group());
  assert.equal(conflict.status, "conflict"); assert.equal(conflict.saved, false);
  assert.deepEqual(conflict.state, group());
  assert.equal(s.getItem(localGroupsStorageKey()), serializeGroups(remote));
  assert.equal(api.writeLocalGroups(s, conflict, group()).status, "conflict");
});

test("invalid outgoing state and oversized writes never replace stored data", async () => {
  const api = await adapter(); const s = storage(); const loaded = api.readLocalGroups(s);
  const invalid = { ...group(), schemaVersion: 7 } as unknown as ReturnType<typeof group>;
  assert.throws(() => api.writeLocalGroups(s, loaded, invalid));
  const oversized = { ...group(), ignored: "é".repeat(api.MAX_LOCAL_GROUPS_BYTES) };
  assert.throws(() => api.writeLocalGroups(s, loaded, oversized));
  assert.equal(s.getItem(localGroupsStorageKey()), null);
});

test("selection union deduplicates canonical source identities and preserves case-sensitive VM addresses", async () => {
  const api = await adapter();
  const evm = "0xAbCd000000000000000000000000000000000001";
  const svm = "So11111111111111111111111111111111111111112";
  let state = createGroup(group(), { id: "g2", name: "Other secret" });
  state = addSource(state, { groupId: "g", oid: "a", address: evm, sourceType: "WALLET" });
  state = addSource(state, { groupId: "g2", oid: "b", address: evm.toLowerCase(), sourceType: "WALLET" });
  state = addSource(state, { groupId: "g2", oid: "s", address: svm, sourceType: "WALLET" });
  const href = api.localGroupsExploreHref(state, ["g", "g2"], ["BASE", "SOLANA"]);
  assert.ok(href);
  const url = new URL(href, "http://local.test");
  assert.deepEqual(decodeURIComponent(url.pathname.slice("/wallet/".length)).split(","), [evm.toLowerCase(), svm]);
  assert.equal(url.searchParams.get("chains"), "BASE,SOLANA");
  assert.deepEqual([...url.searchParams.keys()], ["chains", "deep"]);
  assert.ok(!href.includes("Private") && !href.includes("secret"));
  assert.equal(api.localGroupsExploreHref(state, [], ["BASE"]), null);
  assert.equal(api.localGroupsExploreHref(state, ["g"], []), null);
});

test("refuses case-distinct VM targets that the legacy scanner would collapse", async () => {
  const api = await adapter();
  let state = addSource(group(), { groupId: "g", oid: "s1", address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", sourceType: "WALLET" });
  state = addSource(state, { groupId: "g", oid: "s2", address: "9wzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", sourceType: "WALLET" });
  assert.equal(api.localGroupsExploreHref(state, ["g"], ["SOLANA"]), null);
});

test("public address exploration refuses CEX sources instead of silently omitting them", async () => {
  const api = await adapter();
  const state = addSource(group(), { groupId: "g", oid: "cex", address: "0x0000000000000000000000000000000000000001", sourceType: "CEX" });
  assert.equal(api.localGroupsExploreHref(state, ["g"], ["BASE"]), null);
});
