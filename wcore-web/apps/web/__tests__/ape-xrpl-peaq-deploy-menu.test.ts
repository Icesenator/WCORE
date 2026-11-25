import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { PARIS_BUILD_CHAINS } from "../app/dev/deploy/build-selector";
import { DEPLOY_CHAIN_PARAMS, SUPPORTED_CHAIN_IDS } from "../app/dev/deploy/chain-data";
import { getFactoryAddress } from "@wcore/shared";

/**
 * ApeChain (33139), XRPL EVM (1440000) et Peaq (3338) sont ajoutees au menu
 * /dev/deploy pour que le proprietaire puisse y deployer la fabrique GM. Elles
 * ne sont PAS encore actives sur /gm : aucune fabrique n'est inscrite ici.
 * Le build standard (Shanghai, PUSH0) convient : eth_estimateGas du bin
 * GmOnChain passe sur les trois chaines (mesure du 25/11/2026).
 */
const CHAINS = [
  { key: "APECHAIN", name: "ApeChain", chainId: 33139, hex: "0x8173", symbol: "APE" },
  { key: "XRPLEVM", name: "XRPL EVM", chainId: 1440000, hex: "0x15f900", symbol: "XRP" },
  { key: "PEAQ", name: "Peaq", chainId: 3338, hex: "0xd0a", symbol: "PEAQ" },
] as const;

const deployClient = readFileSync(resolve(process.cwd(), "app/dev/deploy/DeployClient.tsx"), "utf8");
const keysBlock = deployClient.match(/const DEPLOY_CHAIN_KEYS = \[([\s\S]*?)\] as const/);

for (const c of CHAINS) {
  describe(`${c.name} (${c.chainId}) dans /dev/deploy`, () => {
    test("apparait une seule fois dans DEPLOY_CHAIN_KEYS", () => {
      assert.ok(keysBlock, "DEPLOY_CHAIN_KEYS introuvable");
      assert.equal([...keysBlock![1]!.matchAll(new RegExp(`"${c.key}"`, "g"))].length, 1);
    });

    test("CHAIN_META porte le nom et le chainId", () => {
      assert.match(deployClient, new RegExp(`${c.key}:\\s*\\{\\s*name:\\s*"${c.name}",\\s*chainId:\\s*${c.chainId}\\s*\\}`));
    });

    test("parametres wallet_addEthereumChain utilisables, RPC https sans identifiant", () => {
      const p = buildAddEthereumChainParams(c.chainId);
      assert.ok(p, "parametres absents");
      assert.equal(p!.chainId, c.hex);
      assert.equal(p!.chainName, c.name);
      assert.equal(p!.nativeCurrency.symbol, c.symbol);
      assert.equal(p!.nativeCurrency.decimals, 18);
      assert.ok(p!.rpcUrls.length >= 1);
      for (const url of p!.rpcUrls) {
        assert.ok(url.startsWith("https://"), url);
        assert.doesNotMatch(url, /(api[_-]?key|apikey|token|secret)=/i, url);
      }
      assert.ok(DEPLOY_CHAIN_PARAMS[c.key]);
      assert.ok(SUPPORTED_CHAIN_IDS.has(c.chainId));
    });

    test("build standard (pas de repli Paris) et aucune fabrique GM inscrite", () => {
      assert.equal(PARIS_BUILD_CHAINS.has(c.key), false);
      assert.equal(getFactoryAddress(c.key.toLowerCase()), undefined);
    });
  });
}
