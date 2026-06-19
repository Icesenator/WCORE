import test from "node:test";
import assert from "node:assert/strict";
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
