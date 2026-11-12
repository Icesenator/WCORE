import { test } from "node:test";
import assert from "node:assert/strict";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, getFactory } from "../../../packages/shared/src/factories";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getGmContractChainId } from "../hooks/useGmContracts";
import { getExplorerUrl } from "../lib/explorers";
import { switchChainAny } from "../lib/onchain-tx";
import { config } from "../lib/wagmi";
import { getStoppedDeployChainMessage, switchWalletChain } from "../app/dev/deploy/chain-switch";
import { getDeployChains, gmRpcUnavailableForSelection } from "../app/dev/deploy/DeployClient";

// Gravity Alpha (1625) : réseau arrêté le 2026-11-01. Modèle : b3-mainnet-retired.test.ts.
// Différence voulue avec B3 : Gravity n'entre pas dans RETIRED_CHAINS (la chaîne reste
// suivie par le scan et par Sentinel). Le refus de déploiement vient donc de
// GM_HISTORICAL_FACTORIES, et app/dev/deploy/chain-data.ts (généré depuis le registre)
// garde sa ligne Gravity.
// Chaque test exécute le code réel (listes, gardes, configuration wagmi) ; aucun ne
// relit le texte d'un fichier source.
const GRAVITY_FACTORY = "0x8d0cf2c602efdc3b696341cc03ec62e813771c48";
const SAMPLE_CONTRACT = "0x0000000000000000000000000000000000000001";
const STOPPED = /Gravity \(1625\) is a stopped network/;

test("Gravity Alpha n'est plus une factory GM active, ni une carte de /gm, ni une chaîne « soon »", () => {
  assert.equal(getFactory("gravity"), undefined);
  assert.equal(getFactory("GRAVITY"), undefined);
  assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 1625));
  const active = getGmChains().map((c) => c.key);
  assert.equal(active.includes("gravity"), false, "aucune carte active « Say GM » pour Gravity");
  // Sans factory active, une entrée « soon » ferait réapparaître Gravity comme chaîne à venir.
  assert.equal(getSoonChains().some((c) => c.key === "gravity"), false, "Gravity ne revient pas en « soon »");
  for (const key of ["base", "opbnb", "merlin", "ethereum"]) assert.ok(active.includes(key), `${key} reste disponible`);
  assert.equal(getFactory("opbnb")?.chainId, 204);
  assert.equal(getFactory("merlin")?.chainId, 4200);
});

test("la factory Gravity reste identifiable comme historique, sans action wallet", () => {
  assert.deepEqual(GM_HISTORICAL_FACTORIES.gravity, { address: GRAVITY_FACTORY, chainId: 1625 });
  // Aucun identifiant de chaîne exploitable pour un switch ou une transaction.
  assert.equal(getGmContractChainId("gravity"), undefined);
  assert.equal(getGmContractChainId("GRAVITY"), undefined);
  // Lien explorateur conservé pour les preuves.
  assert.equal(getExplorerUrl("gravity", SAMPLE_CONTRACT)?.startsWith("https://explorer.gravity.xyz/"), true);
});

test("wagmi ne déclare plus Gravity (1625), RACE (6805) ni Lisk (1135)", () => {
  const configured = new Set<number>(config.chains.map((chain) => chain.id));
  for (const id of [1625, 6805, 1135]) assert.equal(configured.has(id), false, `chaîne ${id} encore déclarée dans wagmi`);
  // Aucun RPC de ces trois réseaux parmi ceux que wagmi peut appeler ou proposer d'ajouter au wallet.
  const rpcUrls = config.chains.flatMap((chain) => [...chain.rpcUrls.default.http]);
  assert.ok(rpcUrls.length > 0);
  for (const url of rpcUrls) assert.doesNotMatch(url, /rpc\.gravity\.xyz|\/\/1625\.rpc\.|\/\/race\.rpc\.|\/\/6805\.rpc\.|lisk\.com|\/\/1135\.rpc\./, url);
});

test("wagmi garde les chaînes nécessaires au retrait des contrats GM hérités", () => {
  const configured = new Set<number>(config.chains.map((chain) => chain.id));
  const legacy: Array<[string, number]> = [["duckchain", 5545], ["degen", 666666666], ["superposition", 55244]];
  for (const [key, id] of legacy) {
    assert.equal(getGmContractChainId(key), id, `${key} reste résolu pour un retrait`);
    assert.ok(configured.has(id), `${key} (${id}) reste déclaré dans wagmi`);
  }
  // Voisins de Gravity dans la liste : inchangés.
  for (const id of [204, 4200, 8453]) assert.ok(configured.has(id), `chaîne active ${id} toujours déclarée`);
});

test("la page de déploiement ne propose plus les sept chaînes sans factory GM active", () => {
  const offered = getDeployChains();
  const keys = new Set(offered.map((c) => c.key));
  const ids = new Set(offered.map((c) => c.chainIdNum));
  const removed: Array<[string, number]> = [
    ["lisk", 1135], ["duckchain", 5545], ["degen", 666666666], ["gravity", 1625],
    ["superposition", 55244], ["race", 6805], ["botanix", 3637],
  ];
  for (const [key, id] of removed) {
    assert.equal(keys.has(key), false, `${key} encore proposé au déploiement`);
    assert.equal(ids.has(id), false, `chaîne ${id} encore proposée au déploiement`);
  }
  // Contrôle positif : les chaînes actives voisines restent proposées, avec leur identifiant.
  const active: Array<[string, number]> = [["base", 8453], ["opbnb", 204], ["merlin", 4200], ["doma", 97477], ["b2", 223]];
  for (const [key, id] of active) {
    assert.equal(offered.find((c) => c.key === key)?.chainIdNum, id, `${key} doit rester proposé`);
  }
});

test("la garde de /dev/deploy refuse 1625 saisi dans le champ « Custom chainId »", () => {
  const offered = getDeployChains();
  // La page lit le champ en hexadécimal ; les trois écritures plausibles sont refusées.
  for (const custom of ["0x659", "0X659", "659", "1625"]) {
    assert.match(gmRpcUnavailableForSelection("base", custom, offered) ?? "", STOPPED, custom);
    assert.match(getStoppedDeployChainMessage(custom) ?? "", STOPPED, custom);
  }
  assert.match(getStoppedDeployChainMessage(1625) ?? "", STOPPED);
  // Les autres factories historiques sont refusées au déploiement de la même façon.
  for (const factory of Object.values(GM_HISTORICAL_FACTORIES)) {
    assert.notEqual(gmRpcUnavailableForSelection("base", "0x" + factory.chainId.toString(16), offered), null, String(factory.chainId));
  }
  // Contrôle positif : une chaîne active passe, par le menu comme par le champ libre.
  for (const chain of offered.filter((c) => ["base", "opbnb", "merlin", "ethereum"].includes(c.key))) {
    assert.equal(gmRpcUnavailableForSelection(chain.key, chain.chainId, offered), null, chain.key);
    assert.equal(getStoppedDeployChainMessage(chain.chainId), null, chain.key);
  }
  assert.equal(gmRpcUnavailableForSelection("base", "0x2105", offered), null);
  assert.equal(getStoppedDeployChainMessage(""), null);
  assert.equal(getStoppedDeployChainMessage("not-a-chain"), null);
});

test("le parcours de déploiement refuse 1625 avant toute requête wallet", async () => {
  const calls: string[] = [];
  const ethereum = { request: async (a: { method: string }) => { calls.push(a.method); return null; } };
  const gravityParams = () => ({ chainId: "0x659", chainName: "Gravity", nativeCurrency: { name: "Gravity", symbol: "G", decimals: 18 }, rpcUrls: ["https://rpc.gravity.xyz"] });
  for (const custom of ["0x659", "659", "1625"]) {
    await assert.rejects(switchWalletChain(ethereum, custom, gravityParams), (e: any) => e.code === "CHAIN_STOPPED" && STOPPED.test(e.message), custom);
  }
  assert.deepEqual(calls, [], "ni wallet_switchEthereumChain, ni wallet_addEthereumChain");
  // Contrôle positif : un réseau actif passe toujours par le wallet.
  await switchWalletChain(ethereum, "0x2105", () => null);
  assert.deepEqual(calls, ["wallet_switchEthereumChain"]);
});

test("le refus de déploiement ne bloque pas le retrait des fonds des contrats hérités", async () => {
  // Degen et Superposition sont dans GM_HISTORICAL_FACTORIES : leur déploiement est refusé,
  // mais le retrait (lib/onchain-tx.ts, hors de la garde de /dev/deploy) atteint toujours le wallet.
  const calls: string[] = [];
  const raw = { request: async (a: { method: string }) => { calls.push(a.method); } };
  for (const key of ["duckchain", "degen", "superposition"]) {
    const chainId = getGmContractChainId(key);
    assert.ok(chainId, `${key} doit rester résolu`);
    await switchChainAny({ wagmiConnected: false, wagmiSwitch: async () => {}, rawProvider: raw }, chainId!);
  }
  assert.deepEqual(calls, ["wallet_switchEthereumChain", "wallet_switchEthereumChain", "wallet_switchEthereumChain"]);
});
