import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, getFactory } from "../../../packages/shared/src/factories";
import { getGmChains, getSoonChains } from "../app/gm/gm-chains";
import { getGmContractChainId } from "../hooks/useGmContracts";
import { config } from "../lib/wagmi";

// Gravity Alpha (1625) : réseau arrêté le 2026-11-01. Modèle : b3-mainnet-retired.test.ts.
// Différence voulue avec B3 : Gravity n'entre pas dans RETIRED_CHAINS (la chaîne reste
// suivie par le scan et par Sentinel), donc aucun test de refus par identifiant ici, et
// app/dev/deploy/chain-data.ts (généré depuis le registre) garde sa ligne Gravity.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const GRAVITY_FACTORY = "0x8d0cf2c602efdc3b696341cc03ec62e813771c48";

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
  assert.match(source("../lib/explorers.ts"), /gravity:\s*"https:\/\/explorer\.gravity\.xyz"/, "lien explorateur conservé pour les preuves");
});

test("wagmi ne déclare plus Gravity (1625), RACE (6805) ni Lisk (1135)", () => {
  const configured = new Set<number>(config.chains.map((chain) => chain.id));
  for (const id of [1625, 6805, 1135]) assert.equal(configured.has(id), false, `chaîne ${id} encore déclarée dans wagmi`);
  const wagmi = source("../lib/wagmi.ts");
  assert.doesNotMatch(wagmi, /id:\s*1625|rpc\.gravity\.xyz|1625\.rpc\.thirdweb|\[gravity\.id\]|\bgravity,/);
  assert.doesNotMatch(wagmi, /id:\s*6805|race\.rpc\.thirdweb|\[race\.id\]|\brace,/);
  assert.doesNotMatch(wagmi, /\[lisk\.id\]|\blisk,/);
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

test("aucun libellé /gm, aucune entrée héritée ni option de déploiement pour Gravity", () => {
  assert.doesNotMatch(source("../app/gm/gm-chains.ts"), /\bgravity:|key:\s*"gravity"/);
  assert.doesNotMatch(source("../hooks/useGmContracts.ts"), /\bgravity:\s*1625/);
  assert.doesNotMatch(source("../app/dev/deploy/DeployClient.tsx"), /"GRAVITY"|chainId: 1625/);
});

test("la page de déploiement ne propose plus les sept chaînes sans factory GM active", () => {
  const deploy = source("../app/dev/deploy/DeployClient.tsx");
  for (const key of ["LISK", "DUCKCHAIN", "DEGEN", "GRAVITY", "SUPERPOSITION", "RACE", "BOTANIX"]) {
    assert.doesNotMatch(deploy, new RegExp(`"${key}"`), `${key} encore dans la liste proposée`);
    assert.doesNotMatch(deploy, new RegExp(`\\b${key}:\\s*\\{`), `${key} encore dans la table de repli`);
  }
  // Contrôle positif : les chaînes actives voisines restent proposées, dans les deux tables.
  for (const key of ["BASE", "OPBNB", "MERLIN", "DOMA", "B2"]) {
    assert.match(deploy, new RegExp(`"${key}"`), `${key} doit rester dans la liste proposée`);
    assert.match(deploy, new RegExp(`\\b${key}:\\s*\\{`), `${key} doit rester dans la table de repli`);
  }
});
