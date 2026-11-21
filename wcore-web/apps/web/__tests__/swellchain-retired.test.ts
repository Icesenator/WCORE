import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, getFactory } from "../../../packages/shared/src/factories";
import { isRetiredChain, isRetiredChainId, filterActiveChainKeys } from "../../../packages/shared/src/chain-lifecycle";
import { getGmRpcUnavailableMessage, assertGmRpcAvailable } from "../lib/gm-rpc-error";
import { switchChainAny } from "../lib/onchain-tx";
import { switchWalletChain } from "../app/dev/deploy/chain-switch";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getGmContractChainId } from "../hooks/useGmContracts";

// Swellchain (1923) : retirée le 2026-11-21. Modèle : moonbeam-moonriver-retired.test.ts.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const RETIRED = [
  { key: "swellchain", id: 1923, hex: "0x783", label: /Swellchain \(1923\) has been removed/, factory: "0x3177892304a1b928f34b054e280cd77a0e83872a", explorer: "https://explorer.swellnetwork.io" },
] as const;

test("Swellchain n'est plus une factory GM active ni une carte de /gm", () => {
  for (const c of RETIRED) {
    assert.equal(getFactory(c.key), undefined, c.key);
    assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === c.id), String(c.id));
  }
  const visible = [...getGmChains(), ...getSoonChains()].map((c) => c.key);
  for (const c of RETIRED) assert.equal(visible.includes(c.key), false, `${c.key} ne doit apparaître ni en « Say GM » ni en « bientôt »`);
  assert.ok(visible.includes("base"), "Base reste disponible");
  assert.equal(getFactory("base")?.chainId, 8453);
});

test("les factories restent identifiables comme historiques, sans action wallet", () => {
  for (const c of RETIRED) {
    assert.deepEqual(GM_HISTORICAL_FACTORIES[c.key], { address: c.factory, chainId: c.id }, c.key);
    assert.equal(getGmContractChainId(c.key), undefined, c.key);
    assert.equal(getGmContractChainId(c.key.toUpperCase()), undefined, c.key);
    assert.ok(source("../lib/explorers.ts").includes(`${c.key}: "${c.explorer}"`), `lien explorateur ${c.key} conservé pour les preuves`);
  }
});

test("clé, identifiant décimal et hexadécimal sont retirés ; les chaînes voisines ne le sont pas", () => {
  for (const c of RETIRED) {
    for (const key of [c.key, ` ${c.key.toUpperCase()} `, String(c.id), c.hex, c.hex.toUpperCase().replace("0X", "0x")]) {
      assert.equal(isRetiredChain(key), true, key);
      assert.match(getGmRpcUnavailableMessage(key) ?? "", c.label);
      assert.throws(() => assertGmRpcAvailable(key), (e: any) => e.code === "CHAIN_REMOVED");
    }
    for (const id of [c.id, String(c.id), c.hex]) assert.equal(isRetiredChainId(id), true, String(id));
  }
  for (const key of ["swan", "astar", "592", "base", "BASE", "8453", "ethereum"]) {
    assert.equal(isRetiredChain(key), false, key);
    assert.equal(getGmRpcUnavailableMessage(key), null, key);
  }
  for (const id of [592, 8453, 1, "0x2105"]) assert.equal(isRetiredChainId(id), false, String(id));
  assert.deepEqual(filterActiveChainKeys(["BASE", "SWELLCHAIN", "ASTAR", "ETHEREUM"]), ["BASE", "ASTAR", "ETHEREUM"]);
});

test("aucune requête wallet n'est émise vers 1923 (GM, retrait, raw provider ou wagmi)", async () => {
  const calls: string[] = [];
  const raw = { request: async (a: { method: string }) => { calls.push(a.method); } };
  for (const c of RETIRED) {
    const lookupAddChain = () => ({ chainId: c.hex, chainName: c.key, nativeCurrency: { name: "Token", symbol: "TKN", decimals: 18 }, rpcUrls: ["https://rpc.example.invalid"] });
    for (const rawProvider of [raw, undefined]) {
      await assert.rejects(
        switchChainAny({ wagmiConnected: true, wagmiSwitch: async () => { calls.push("wagmiSwitch"); }, rawProvider, lookupAddChain }, c.id),
        c.label,
      );
    }
  }
  assert.deepEqual(calls, [], "ni wallet_switchEthereumChain, ni wallet_addEthereumChain, ni wagmi");
});

test("le parcours de déploiement refuse 1923 avant toute requête wallet", async () => {
  const calls: string[] = [];
  const ethereum = { request: async (a: { method: string }) => { calls.push(a.method); return null; } };
  for (const c of RETIRED) {
    await assert.rejects(switchWalletChain(ethereum, c.hex, () => ({ chainId: c.hex, chainName: c.key, nativeCurrency: { name: "Token", symbol: "TKN", decimals: 18 }, rpcUrls: ["https://rpc.example.invalid"] })), (e: any) => e.code === "CHAIN_REMOVED");
  }
  assert.deepEqual(calls, []);
  // Contrôle positif : un réseau actif passe toujours par le wallet.
  await switchWalletChain(ethereum, "0x2105", () => null);
  assert.deepEqual(calls, ["wallet_switchEthereumChain"]);
});

test("les réseaux actifs restent joignables par le wallet", async () => {
  const calls: string[] = [];
  const raw = { request: async (a: { method: string }) => { calls.push(a.method); } };
  await switchChainAny({ wagmiConnected: false, wagmiSwitch: async () => {}, rawProvider: raw }, 8453);
  await switchChainAny({ wagmiConnected: false, wagmiSwitch: async () => {}, rawProvider: raw }, 592);
  assert.deepEqual(calls, ["wallet_switchEthereumChain", "wallet_switchEthereumChain"]);
});

test("aucune définition de chaîne, RPC ni métadonnée de déploiement active", () => {
  const wagmi = source("../lib/wagmi.ts");
  assert.doesNotMatch(wagmi, /id:\s*1923\b|\[swellchain\.id\]|\bswellchain,/);
  assert.doesNotMatch(source("../app/gm/gm-chains.ts"), /swellchain/i);
  assert.doesNotMatch(source("../hooks/useGmContracts.ts"), /swellchain|\b1923\b/i);
  assert.doesNotMatch(source("../app/dev/deploy/DeployClient.tsx"), /swellchain|\b1923\b/i);
  assert.doesNotMatch(source("../app/dev/deploy/chain-data.ts"), /swellchain|\b1923\b|0x783/i);
});
