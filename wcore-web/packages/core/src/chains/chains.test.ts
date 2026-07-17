import test from "node:test";
import assert from "node:assert/strict";
import { GM_FACTORIES } from "@wcore/shared";
import { getChain } from "./index.js";

test("Nexus Mainnet is registered with verified RPC metadata", () => {
  const chain = getChain("NEXUS");

  assert.ok(chain, "NEXUS chain should be registered");
  assert.equal(chain.vm, "EVM");
  assert.equal(chain.CHAIN?.NAME, "Nexus Mainnet");
  assert.equal(chain.CHAIN?.CHAIN_ID, 3946);
  assert.equal(chain.CHAIN?.NATIVE_SYMBOL, "NEX");
  assert.equal(chain.CHAIN?.NATIVE_DECIMALS, 18);
  assert.deepEqual(chain.RPC?.ENDPOINTS, ["https://mainnet.rpc.nexus.xyz/"]);
});

test("Abstract native ETH pricing uses the Ethereum oracle ids", () => {
  const chain = getChain("ABSTRACT");

  assert.ok(chain, "ABSTRACT chain should be registered");
  assert.equal(chain.CHAIN?.NATIVE_SYMBOL, "ETH");
  assert.equal(chain.CHAIN?.NATIVE_LLAMA_ID, "coingecko:ethereum");
  assert.equal(chain.CHAIN?.NATIVE_GECKO_ID, "ethereum");
});

test("Robinhood Chain is registered with verified mainnet metadata", () => {
  const chain = getChain("ROBINHOOD_CHAIN");

  assert.ok(chain, "ROBINHOOD_CHAIN should be registered");
  assert.equal(chain.vm, "EVM");
  assert.equal(chain.CHAIN?.NAME, "Robinhood Chain");
  assert.equal(chain.CHAIN?.CHAIN_ID, 4663);
  assert.equal(chain.CHAIN?.NATIVE_SYMBOL, "ETH");
  assert.equal(chain.CHAIN?.NATIVE_LLAMA_ID, "coingecko:ethereum");
  assert.equal(chain.CHAIN?.NATIVE_GECKO_ID, "ethereum");
  assert.deepEqual(chain.RPC?.ENDPOINTS, ["https://rpc.mainnet.chain.robinhood.com"]);
});

test("all active GM chains have native pricing oracle ids", () => {
  const missing = Object.keys(GM_FACTORIES)
    .sort()
    .filter((key) => {
      const chain = getChain(key.toUpperCase());
      return !chain || chain.FLAGS?.DISABLE_CHAIN === true || !chain.CHAIN?.NATIVE_SYMBOL || !chain.CHAIN.NATIVE_LLAMA_ID || !chain.CHAIN.NATIVE_GECKO_ID;
    });

  assert.deepEqual(missing, []);
});
