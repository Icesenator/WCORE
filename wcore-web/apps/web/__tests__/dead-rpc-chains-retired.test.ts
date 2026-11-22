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

// Douze chaînes sans RPC (constat WCORE du 2026-11-22) : modèle zero-retired.test.ts, en boucle.
// Aucune factory GM n'a jamais existé pour ces chaînes et explorers.ts n'a pas d'entrée.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RETIRED = ([
  ["nexus", 3946, "Nexus Mainnet"], ["airdao", 16718, "AirDAO"], ["crossbell", 3737, "Crossbell"],
  ["edgeless", 2026, "Edgeless"], ["lumio", 8866, "Lumio"], ["dogechain", 2000, "Dogechain"],
  ["hychain", 2911, "Hychain"], ["proof_of_play_apex", 70700, "Proof of Play Apex"],
  ["step_network", 1234, "Step Network"], ["shimmer_evm", 148, "Shimmer EVM"],
  ["lorenzo", 8329, "Lorenzo"], ["dos_chain", 7979, "DOS Chain"],
] as const).map(([key, id, name]) => ({
  key, id, name, hex: "0x" + id.toString(16),
  label: new RegExp(`${escape(name)} \\(${id}\\) has been removed`),
}));

test("aucune de ces chaînes n'est une factory GM active ni une carte de /gm", () => {
  for (const c of RETIRED) {
    assert.equal(getFactory(c.key), undefined, c.key);
    assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === c.id), String(c.id));
  }
  const visible = [...getGmChains(), ...getSoonChains()].map((c) => c.key);
  for (const c of RETIRED) assert.equal(visible.includes(c.key), false, `${c.key} ne doit apparaître ni en « Say GM » ni en « bientôt »`);
  assert.ok(visible.includes("base"), "Base reste disponible");
  assert.equal(getFactory("base")?.chainId, 8453);
});

test("aucune factory (active ou historique) ni contrat GM, sans action wallet", () => {
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
  for (const key of ["base", "BASE", "8453", "ethereum", "1", "core", "CORE", "1116", "iota_evm", "8822", "dogecoin"]) {
    assert.equal(isRetiredChain(key), false, key);
    assert.equal(getGmRpcUnavailableMessage(key), null, key);
  }
  for (const id of [8453, 1, 1116, "0x2105", "0x45c"]) assert.equal(isRetiredChainId(id), false, String(id));
  assert.deepEqual(
    filterActiveChainKeys(["BASE", ...RETIRED.map((c) => c.key.toUpperCase()), "CORE", "ETHEREUM"]),
    ["BASE", "CORE", "ETHEREUM"],
  );
});

test("aucune requête wallet n'est émise vers ces chaînes (GM, retrait, raw provider ou wagmi)", async () => {
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

test("le parcours de déploiement refuse ces chaînes avant toute requête wallet", async () => {
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
  await switchChainAny({ wagmiConnected: false, wagmiSwitch: async () => {}, rawProvider: raw }, 1116);
  assert.deepEqual(calls, ["wallet_switchEthereumChain", "wallet_switchEthereumChain"]);
});

test("aucune définition de chaîne, RPC ni métadonnée de déploiement active", () => {
  const files = ["../lib/wagmi.ts", "../app/gm/gm-chains.ts", "../hooks/useGmContracts.ts", "../app/dev/deploy/DeployClient.tsx", "../app/dev/deploy/chain-data.ts", "../lib/defaults.ts"];
  for (const file of files) {
    const text = source(file);
    for (const c of RETIRED) {
      assert.doesNotMatch(text, new RegExp(`\\b${c.key}\\b`, "i"), `${file} : ${c.key}`);
      assert.doesNotMatch(text, new RegExp(`(id|chainId):\\s*${c.id}\\b|"${c.hex}"`), `${file} : ${c.id}`);
      assert.doesNotMatch(text, new RegExp(escape(c.name)), `${file} : ${c.name}`);
    }
  }
});
