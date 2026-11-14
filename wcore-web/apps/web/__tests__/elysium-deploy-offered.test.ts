import { test } from "node:test";
import assert from "node:assert/strict";
import { getDeployChains } from "../app/dev/deploy/DeployClient";
import { buildAddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { PARIS_BUILD_CHAINS } from "../app/dev/deploy/build-selector";
import { GM_FACTORIES } from "../../../packages/shared/src/factories";

// Elysium de Kinetiq (99901) est proposee dans /dev/deploy pour que la fabrique GM puisse y etre deployee
// depuis le portefeuille du proprietaire. Jamais l'Elysium de Vulcan Forged (1339, LAVA).

test("/dev/deploy offers Elysium on Kinetiq 99901, never 1339", () => {
  const chains = getDeployChains();
  const elysium = chains.find((c) => c.key === "elysium");
  assert.ok(elysium, "Elysium must be in the deploy dropdown");
  assert.equal(elysium.chainIdNum, 99901);
  assert.equal(elysium.chainId, "0x1863d");
  assert.equal(elysium.name, "Elysium");
  assert.ok(!chains.some((c) => c.chainIdNum === 1339), "Vulcan Forged Elysium (1339) is never offered");
});

test("Elysium wallet_addEthereumChain params carry HYPE and the Kinetiq RPC", () => {
  const params = buildAddEthereumChainParams(99901);
  assert.ok(params, "Elysium must be in the deploy chain params");
  assert.equal(params.chainId, "0x1863d");
  assert.equal(params.nativeCurrency.symbol, "HYPE");
  assert.deepEqual(params.rpcUrls, ["https://rpc.elysium.kinetiq.xyz"]);
  assert.equal(buildAddEthereumChainParams(1339), null);
});

test("Elysium uses the default (Shanghai) build: PUSH0 is supported, probed 2026-11-14", () => {
  assert.ok(!PARIS_BUILD_CHAINS.has("ELYSIUM"));
});

test("Elysium is offered in /dev/deploy and, since the factory is registered, in GM_FACTORIES at 99901", () => {
  assert.equal(GM_FACTORIES.elysium?.chainId, 99901);
});
