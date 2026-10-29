import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { GM_FACTORIES, getFactory } from "../../../packages/shared/src/factories";
import { getGmRpcUnavailableMessage, assertGmRpcAvailable } from "../lib/gm-rpc-error";
import { switchChainAny } from "../lib/onchain-tx";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("retired Superseed is not an active factory; Ethereum remains active", () => {
  assert.equal(getFactory(" SUPERSEED "), undefined);
  assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 5330));
  assert.equal(getFactory("ethereum")?.chainId, 1);
});

test("legacy keys and numeric IDs are definitively rejected, not held for retry", () => {
  for (const key of ["superseed", " SUPERSEED ", "sseed", "5330", "0x14d2"]) {
    assert.match(getGmRpcUnavailableMessage(key) ?? "", /removed/i);
    assert.throws(() => assertGmRpcAvailable(key), (e: any) => e.code === "CHAIN_REMOVED");
  }
  for (const key of ["ethereum", "SUPR", "superposition"]) assert.equal(getGmRpcUnavailableMessage(key), null);
});

test("numeric retired chain switch cannot touch either wallet provider", async () => {
  let calls = 0;
  for (const raw of [true, false]) {
    await assert.rejects(switchChainAny({ wagmiConnected: true, wagmiSwitch: async () => { calls++; }, rawProvider: raw ? { request: async () => { calls++; } } : undefined }, 5330), /removed/i);
  }
  assert.equal(calls, 0);
});

test("generated distributions cannot retain an executable retired chain or factory", () => {
  for (const suffix of ["js", "js.map", "d.ts", "d.ts.map"]) {
    assert.equal(existsSync(new URL(`../../../packages/core/dist/chains/SUPERSEED.${suffix}`, import.meta.url)), false);
  }
  assert.doesNotMatch(source("../../../packages/shared/dist/factories.js"), /superseed|sseed|\b5330\b|0x14d2/i);
});

test("browser acceptance enforces removal, not an unavailable active card", () => {
  const browser = source("../e2e/gm-superseed-browser.cjs");
  assert.doesNotMatch(browser, /Superseed GM is temporarily unavailable|GM unavailable|forceEnable/);
  assert.match(browser, /option\[value="superseed"\]/);
  assert.match(browser, /Superseed.*removed/);
});

test("no active wallet transport, explorer, currency, icon or deployment metadata", () => {
  for (const path of ["../lib/wagmi.ts", "../lib/explorers.ts", "../lib/chain-native-symbols.json", "../lib/chain-icon-manifest.json", "../app/dev/deploy/chain-data.ts", "../app/gm/gm-chains.ts"]) {
    assert.doesNotMatch(source(path), /superseed|sseed|\b5330\b/i, path);
  }
  const deploy = source("../app/dev/deploy/DeployClient.tsx");
  assert.doesNotMatch(deploy, /"SUPERSEED"|SUPERSEED:\s*\{/);
  assert.match(deploy, /getGmRpcUnavailableMessage\(String\(id\)\)/);
});
