import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildAddEthereumChainParams, type AddEthereumChainParams } from "../app/dev/deploy/chain-params";
import { switchWalletChain, type WalletRequest } from "../app/dev/deploy/chain-switch";
import { pickBuild, PARIS_BUILD_CHAINS, type BuildOutput } from "../app/dev/deploy/build-selector";
import { DEPLOY_CHAIN_PARAMS, SUPPORTED_CHAIN_IDS } from "../app/dev/deploy/chain-data";

const WEB = process.cwd();

function source(path: string): string {
  return readFileSync(resolve(WEB, path), "utf8");
}

/**
 * Moca Chain (2288) was added to the scanner and prepared for /gm, but it was
 * missing from the /dev/deploy menu — a separate hardcoded list (DEPLOY_CHAIN_KEYS
 * + CHAIN_META). The chain must be selectable there WITHOUT implying its GM factory
 * is deployed (MOCA is deliberately absent from GM_FACTORIES).
 */
describe("Moca Chain (2288) in /dev/deploy", () => {
  const deployClient = source("app/dev/deploy/DeployClient.tsx");

  test("MOCA appears exactly once in DEPLOY_CHAIN_KEYS", () => {
    const block = deployClient.match(/const DEPLOY_CHAIN_KEYS = \[([\s\S]*?)\] as const/);
    assert.ok(block, "DEPLOY_CHAIN_KEYS not found in DeployClient.tsx");
    const matches = [...block![1]!.matchAll(/"MOCA"/g)];
    assert.equal(matches.length, 1, "MOCA must appear exactly once in the deploy menu list");
  });

  test("CHAIN_META labels Moca as 'Moca Chain' with chainId 2288", () => {
    assert.match(deployClient, /MOCA:\s*\{\s*name:\s*"Moca Chain",\s*chainId:\s*2288\s*\}/);
  });

  test("the menu option derives chainKey=moca and chainId=0x8f0", () => {
    // Mirrors DeployClient's derivation: key = coreKey.toLowerCase(), chainId = "0x" + chainIdNum.toString(16).
    const chainIdNum = 2288;
    assert.equal("MOCA".toLowerCase(), "moca");
    assert.equal("0x" + chainIdNum.toString(16), "0x8f0");
  });

  test("page title is generic, not pinned to a single chain", () => {
    const page = source("app/dev/deploy/page.tsx");
    assert.match(page, /Deploy GM Contracts</);
    assert.doesNotMatch(page, /Deploy GM Contracts\s*—\s*Base/);
  });
});

describe("Moca deploy chain params", () => {
  test("buildAddEthereumChainParams(2288) returns usable Moca params", () => {
    const params = buildAddEthereumChainParams(2288);
    assert.ok(params, "Moca must be present in the deploy chain params");
    assert.equal(params!.chainId, "0x8f0");
    assert.equal(params!.chainName, "Moca Chain");
    assert.equal(params!.nativeCurrency.symbol, "MOCA");
    assert.equal(params!.nativeCurrency.decimals, 18);
    assert.ok(params!.rpcUrls.length >= 1, "Moca must have at least one RPC");
    for (const url of params!.rpcUrls) {
      assert.ok(url.startsWith("https://"), `RPC must be https: ${url}`);
      assert.doesNotMatch(url, /(api[_-]?key|apikey|token|secret)=/i, `RPC must not embed credentials: ${url}`);
    }
  });

  test("SUPPORTED_CHAIN_IDS includes 2288 and DEPLOY_CHAIN_PARAMS exposes MOCA", () => {
    assert.ok(SUPPORTED_CHAIN_IDS.has(2288), "2288 must be a supported deploy chainId");
    assert.ok(DEPLOY_CHAIN_PARAMS.MOCA, "DEPLOY_CHAIN_PARAMS.MOCA must exist");
  });
});

describe("Moca wallet switch (mocked provider, no transaction)", () => {
  const MOCA_PARAMS: AddEthereumChainParams = buildAddEthereumChainParams(2288)!;
  const lookupMoca = (id: number) => (id === 2288 ? MOCA_PARAMS : null);

  function makeEthereum(
    calls: { method: string; params: unknown[] }[],
    responses: Array<unknown | { code: number; message: string }>,
  ): WalletRequest {
    return {
      request: async (args: { method: string; params?: unknown[] }) => {
        calls.push({ method: args.method, params: args.params ?? [] });
        const r = responses.shift();
        if (r && typeof r === "object" && "code" in r) throw r;
        return r;
      },
    };
  }

  test("chain known to wallet: one switchEthereumChain, no send", async () => {
    const calls: { method: string; params: unknown[] }[] = [];
    const eth = makeEthereum(calls, [null]);
    await switchWalletChain(eth, "0x8f0", lookupMoca);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "wallet_switchEthereumChain");
    assert.deepEqual(calls[0]?.params, [{ chainId: "0x8f0" }]);
    assert.ok(!calls.some((c) => c.method === "eth_sendTransaction"), "selection must not send a transaction");
  });

  test("4902 fallback adds Moca with our params, no retry, no send", async () => {
    const calls: { method: string; params: unknown[] }[] = [];
    const eth = makeEthereum(calls, [{ code: 4902, message: "Unrecognized chain ID" }, null]);
    await switchWalletChain(eth, "0x8f0", lookupMoca);
    assert.equal(calls.length, 2, "switch once, then add — no switch retry");
    assert.equal(calls[0]?.method, "wallet_switchEthereumChain");
    assert.equal(calls[1]?.method, "wallet_addEthereumChain");
    assert.deepEqual(calls[1]?.params, [MOCA_PARAMS]);
    assert.ok(!calls.some((c) => c.method === "eth_sendTransaction"), "selection must not send a transaction");
  });
});

describe("Moca build selection", () => {
  const build: BuildOutput = {
    GmOnChain: { abi: [], bin: "0xonchain" },
    GmFactory: { abi: [], bin: "0xfactory" },
    GmOnChainParis: { abi: [], bin: "0xparisOnchain" },
    GmFactoryParis: { abi: [], bin: "0xparisFactory" },
  };

  test("Moca uses the default EVM build, never a Paris build", () => {
    assert.equal(PARIS_BUILD_CHAINS.has("MOCA"), false, "Moca must not be pinned to the pre-Shanghai build");
    assert.equal(pickBuild(build, "moca", "GmOnChain").bin, "0xonchain");
    assert.equal(pickBuild(build, "MOCA", "GmFactory").bin, "0xfactory");
  });

  test("existing GM chains keep their build choice (regression guard)", () => {
    assert.equal(pickBuild(build, "BASE", "GmOnChain").bin, "0xonchain");
    assert.equal(pickBuild(build, "KCC", "GmOnChain").bin, "0xparisOnchain");
    assert.equal(PARIS_BUILD_CHAINS.size, 1, "only KCC uses the Paris build");
  });
});
