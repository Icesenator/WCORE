import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, getFactory } from "../../../packages/shared/src/factories";
import { isRetiredChain, isRetiredChainId, filterActiveChainKeys } from "../../../packages/shared/src/chain-lifecycle";
import { getGmRpcUnavailableMessage, assertGmRpcAvailable } from "../lib/gm-rpc-error";
import { switchChainAny } from "../lib/onchain-tx";
import { switchWalletChain } from "../app/dev/deploy/chain-switch";
import { getGmChains } from "../app/gm/gm-chains";
import { getGmContractChainId } from "../hooks/useGmContracts";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const B3_FACTORY = "0x14bfaa1302ab5ea8041d3dfec9abb668efbf2f34";

test("B3 Mainnet n'est plus une factory GM active ni une carte de /gm", () => {
  assert.equal(getFactory("b3"), undefined);
  assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 8333));
  const active = getGmChains().map((c) => c.key);
  assert.equal(active.includes("b3"), false, "aucune carte active « Say GM » pour B3");
  for (const key of ["base", "b2", "ethereum"]) assert.ok(active.includes(key), `${key} reste disponible`);
  assert.equal(getFactory("base")?.chainId, 8453);
  assert.equal(getFactory("b2")?.chainId, 223);
});

test("la factory B3 reste identifiable comme historique, sans action wallet", () => {
  assert.deepEqual(GM_HISTORICAL_FACTORIES.b3, { address: B3_FACTORY, chainId: 8333 });
  // Aucun identifiant de chaîne exploitable pour un switch ou une transaction.
  assert.equal(getGmContractChainId("b3"), undefined);
  assert.equal(getGmContractChainId("B3"), undefined);
  assert.match(source("../lib/explorers.ts"), /b3:\s*"https:\/\/explorer\.b3\.fun"/, "lien explorateur conservé pour les preuves");
});

test("clé, identifiant décimal et hexadécimal B3 sont retirés ; B2 et Base ne le sont pas", () => {
  for (const key of ["b3", " B3 ", "8333", "0x208d", "0x208D"]) {
    assert.equal(isRetiredChain(key), true, key);
    assert.match(getGmRpcUnavailableMessage(key) ?? "", /B3 Mainnet \(8333\) has been removed/);
    assert.throws(() => assertGmRpcAvailable(key), (e: any) => e.code === "CHAIN_REMOVED");
  }
  for (const id of [8333, "8333", "0x208d"]) assert.equal(isRetiredChainId(id), true, String(id));
  for (const key of ["b2", "B2", "223", "base", "BASE", "8453", "ethereum"]) {
    assert.equal(isRetiredChain(key), false, key);
    assert.equal(getGmRpcUnavailableMessage(key), null, key);
  }
  for (const id of [223, 8453, 1, "0x2105"]) assert.equal(isRetiredChainId(id), false, String(id));
  assert.deepEqual(filterActiveChainKeys(["BASE", "B3", "B2", "ETHEREUM"]), ["BASE", "B2", "ETHEREUM"]);
});

test("aucune requête wallet n'est émise vers 8333 (GM, retrait, raw provider ou wagmi)", async () => {
  const calls: string[] = [];
  const raw = { request: async (a: { method: string }) => { calls.push(a.method); } };
  const lookupAddChain = () => ({ chainId: "0x208d", chainName: "B3", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet-rpc.b3.fun"] });
  for (const rawProvider of [raw, undefined]) {
    await assert.rejects(
      switchChainAny({ wagmiConnected: true, wagmiSwitch: async () => { calls.push("wagmiSwitch"); }, rawProvider, lookupAddChain }, 8333),
      /B3 Mainnet \(8333\) has been removed/,
    );
  }
  assert.deepEqual(calls, [], "ni wallet_switchEthereumChain, ni wallet_addEthereumChain, ni wagmi");
});

test("le parcours de déploiement refuse 8333 avant toute requête wallet", async () => {
  const calls: string[] = [];
  const ethereum = { request: async (a: { method: string }) => { calls.push(a.method); return null; } };
  await assert.rejects(switchWalletChain(ethereum, "0x208d", () => ({ chainId: "0x208d", chainName: "B3", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet-rpc.b3.fun"] })), (e: any) => e.code === "CHAIN_REMOVED");
  assert.deepEqual(calls, []);
  // Contrôle positif : un réseau actif passe toujours par le wallet.
  await switchWalletChain(ethereum, "0x2105", () => null);
  assert.deepEqual(calls, ["wallet_switchEthereumChain"]);
});

test("les réseaux actifs restent joignables par le wallet", async () => {
  const calls: string[] = [];
  const raw = { request: async (a: { method: string }) => { calls.push(a.method); } };
  await switchChainAny({ wagmiConnected: false, wagmiSwitch: async () => {}, rawProvider: raw }, 8453);
  await switchChainAny({ wagmiConnected: false, wagmiSwitch: async () => {}, rawProvider: raw }, 223);
  assert.deepEqual(calls, ["wallet_switchEthereumChain", "wallet_switchEthereumChain"]);
});

test("aucune définition de chaîne, RPC B3 ni métadonnée de déploiement active", () => {
  const wagmi = source("../lib/wagmi.ts");
  assert.doesNotMatch(wagmi, /id:\s*8333|mainnet-rpc\.b3\.fun|8333\.rpc\.thirdweb|\[b3\.id\]|\bb3,/);
  assert.doesNotMatch(source("../app/gm/gm-chains.ts"), /\bb3:/);
  assert.doesNotMatch(source("../hooks/useGmContracts.ts"), /\bb3:\s*8333/);
  assert.doesNotMatch(source("../app/dev/deploy/DeployClient.tsx"), /"B3"|chainId: 8333/);
  assert.doesNotMatch(source("../app/dev/deploy/chain-data.ts"), /\bB3\b|8333|0x208d|b3-[12]/);
});
