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

// ZERO Network (543210) : retirée le 2026-11-21. Modèle : swellchain-retired.test.ts.
// Aucune factory GM n'a jamais existé pour cette chaîne et explorers.ts n'a pas d'entrée : ces deux gardes ne s'appliquent pas.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const RETIRED = [
  { key: "zero", id: 543210, hex: "0x849ea", label: /ZERO Network \(543210\) has been removed/ },
] as const;

test("ZERO Network n'est plus une factory GM active ni une carte de /gm", () => {
  for (const c of RETIRED) {
    assert.equal(getFactory(c.key), undefined, c.key);
    assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === c.id), String(c.id));
  }
  const visible = [...getGmChains(), ...getSoonChains()].map((c) => c.key);
  for (const c of RETIRED) assert.equal(visible.includes(c.key), false, `${c.key} ne doit apparaître ni en « Say GM » ni en « bientôt »`);
  assert.ok(visible.includes("base"), "Base reste disponible");
  assert.equal(getFactory("base")?.chainId, 8453);
});

test("aucune factory (active ou historique) ni contrat GM pour ZERO Network, sans action wallet", () => {
  for (const c of RETIRED) {
    assert.equal(GM_HISTORICAL_FACTORIES[c.key], undefined, c.key);
    assert.equal(getGmContractChainId(c.key), undefined, c.key);
    assert.equal(getGmContractChainId(c.key.toUpperCase()), undefined, c.key);
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
  for (const key of ["swan", "zetachain", "7000", "base", "BASE", "8453", "ethereum"]) {
    assert.equal(isRetiredChain(key), false, key);
    assert.equal(getGmRpcUnavailableMessage(key), null, key);
  }
  for (const id of [7000, 8453, 1, "0x2105"]) assert.equal(isRetiredChainId(id), false, String(id));
  assert.deepEqual(filterActiveChainKeys(["BASE", "ZERO", "ZETACHAIN", "ETHEREUM"]), ["BASE", "ZETACHAIN", "ETHEREUM"]);
});

test("aucune requête wallet n'est émise vers 543210 (GM, retrait, raw provider ou wagmi)", async () => {
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

test("le parcours de déploiement refuse 543210 avant toute requête wallet", async () => {
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
  await switchChainAny({ wagmiConnected: false, wagmiSwitch: async () => {}, rawProvider: raw }, 7000);
  assert.deepEqual(calls, ["wallet_switchEthereumChain", "wallet_switchEthereumChain"]);
});

test("aucune définition de chaîne, RPC ni métadonnée de déploiement active", () => {
  const wagmi = source("../lib/wagmi.ts");
  assert.doesNotMatch(wagmi, /id:\s*543210\b|\[zero\.id\]|\bzero,/);
  assert.doesNotMatch(source("../app/gm/gm-chains.ts"), /key: "zero"|ZERO Network/);
  assert.doesNotMatch(source("../hooks/useGmContracts.ts"), /\bzero\b|\b543210\b/i);
  assert.doesNotMatch(source("../app/dev/deploy/DeployClient.tsx"), /"ZERO"|ZERO Network|\b543210\b/);
  assert.doesNotMatch(source("../app/dev/deploy/chain-data.ts"), /\bZERO\b|\b543210\b|0x849ea/i);
  assert.doesNotMatch(source("../lib/defaults.ts"), /"ZERO"/);
});
