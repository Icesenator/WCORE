import test from "node:test";
import assert from "node:assert/strict";
import { buildAddEthereumChainParams } from "./chain-params";

test("buildAddEthereumChainParams for KCC produces the right wallet payload", () => {
  const params = buildAddEthereumChainParams(321);
  assert.ok(params, "KCC should be in deploy chain params");
  assert.equal(params?.chainId, "0x141");
  assert.equal(params?.chainName, "KCC");
  assert.equal(params?.nativeCurrency.symbol, "KCS");
  assert.equal(params?.nativeCurrency.decimals, 18);
  assert.ok((params?.rpcUrls.length ?? 0) >= 1, "KCC must have at least one RPC");
  assert.ok((params?.rpcUrls[0] ?? "").length > 0, "RPC URL must not be empty");
});

test("buildAddEthereumChainParams for BASE includes the 0x chainId hex", () => {
  const params = buildAddEthereumChainParams(8453);
  assert.equal(params?.chainId, "0x2105");
  assert.equal(params?.chainName, "Base");
  assert.equal(params?.nativeCurrency.symbol, "ETH");
});

test("buildAddEthereumChainParams returns null for an unknown chainId", () => {
  assert.equal(buildAddEthereumChainParams(999999999), null);
});

test("buildAddEthereumChainParams for Moonbeam (GM chain) returns GLMR", () => {
  const params = buildAddEthereumChainParams(1284);
  assert.ok(params, "Moonbeam should be in deploy chain params");
  assert.equal(params?.chainId, "0x504");
  assert.equal(params?.nativeCurrency.symbol, "GLMR");
});

test("buildAddEthereumChainParams for PulseChain returns PLS", () => {
  const params = buildAddEthereumChainParams(369);
  assert.ok(params, "PulseChain should be in deploy chain params");
  assert.equal(params?.chainId, "0x171");
  assert.equal(params?.nativeCurrency.symbol, "PLS");
});

test("buildAddEthereumChainParams is case-insensitive and ignores hex string", () => {
  const params = buildAddEthereumChainParams(8453);
  assert.equal(params?.chainId, "0x2105");
});
