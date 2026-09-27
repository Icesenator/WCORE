import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterGmChains } from "../app/gm/filter-gm-chains";

const chains = [
  { key: "ethereum", name: "Ethereum" },
  { key: "nova_chain", name: "Nova Network" },
  { key: "arc", name: "Arc" },
];

test("GM search matches names and keys without case or surrounding spaces", () => {
  assert.deepEqual(filterGmChains(chains, "  ARC  ").map(c => c.key), ["arc"]);
  assert.deepEqual(filterGmChains(chains, "NOVA_CHAIN").map(c => c.key), ["nova_chain"]);
});

test("GM search preserves the initial order and shows no cards for unmatched queries", () => {
  assert.deepEqual(filterGmChains(chains, "  "), chains);
  assert.deepEqual(filterGmChains(chains, "not a chain"), []);
});

test("GM page exposes one search for both connected and disconnected grids", () => {
  const source = readFileSync(new URL("../app/gm/GmPageClient.tsx", import.meta.url), "utf8");
  assert.match(source, /aria-label="Search chains"/);
  assert.match(source, /GM_CHAINS\.filter\(c => getFactoryAddress\(c\.key\)\)/);
  assert.match(source, /filterGmChains\(SOON_CHAINS, search\)/);
  assert.equal((source.match(/availableChains\.map\(/g) ?? []).length, 2);
  assert.equal((source.match(/soonChains\.map\(/g) ?? []).length, 2);
  assert.equal((source.match(/No chains found/g) ?? []).length, 2);
});
