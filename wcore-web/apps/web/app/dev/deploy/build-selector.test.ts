import test from "node:test";
import assert from "node:assert/strict";
import { pickBuild, PARIS_BUILD_CHAINS, type BuildOutput } from "./build-selector";

const defaultBuild: BuildOutput = {
  GmOnChain: { abi: ["defaultOnChainAbi"], bin: "0xdefaultOnChain" },
  GmFactory: { abi: ["defaultFactoryAbi"], bin: "0xdefaultFactory" },
  GmOnChainParis: { abi: ["parisOnChainAbi"], bin: "0xparisOnChain" },
  GmFactoryParis: { abi: ["parisFactoryAbi"], bin: "0xparisFactory" },
};

test("pickBuild returns the default Shanghai build for chains that support PUSH0", () => {
  const result = pickBuild(defaultBuild, "BASE", "GmOnChain");
  assert.equal(result.bin, "0xdefaultOnChain");
  assert.deepEqual(result.abi, ["defaultOnChainAbi"]);
});

test("pickBuild returns the default Shanghai build for Moonbeam (case-insensitive)", () => {
  assert.equal(pickBuild(defaultBuild, "moonbeam", "GmFactory").bin, "0xdefaultFactory");
  assert.equal(pickBuild(defaultBuild, "MOONBEAM", "GmFactory").bin, "0xdefaultFactory");
});

test("pickBuild returns the Paris build for KCC (pre-Shanghai chain)", () => {
  const result = pickBuild(defaultBuild, "KCC", "GmOnChain");
  assert.equal(result.bin, "0xparisOnChain");
});

test("pickBuild returns the Paris build for KCC regardless of case", () => {
  assert.equal(pickBuild(defaultBuild, "kcc", "GmOnChain").bin, "0xparisOnChain");
  assert.equal(pickBuild(defaultBuild, "Kcc", "GmFactory").bin, "0xparisFactory");
});

test("pickBuild returns the Paris build for GmFactory on KCC", () => {
  const result = pickBuild(defaultBuild, "KCC", "GmFactory");
  assert.equal(result.bin, "0xparisFactory");
});

test("pickBuild throws when the Paris build is missing for a pre-Shanghai chain", () => {
  const buildMissingParis: BuildOutput = {
    GmOnChain: defaultBuild.GmOnChain,
    GmFactory: defaultBuild.GmFactory,
  };
  assert.throws(() => pickBuild(buildMissingParis, "KCC", "GmOnChain"), /No Paris build/);
});

test("PARIS_BUILD_CHAINS includes KCC", () => {
  assert.equal(PARIS_BUILD_CHAINS.has("KCC"), true);
});
