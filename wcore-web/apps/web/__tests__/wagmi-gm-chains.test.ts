import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../lib/wagmi";
import { getFactoryChainIds } from "@wcore/shared";

describe("wagmi config covers GM factory chains", () => {
  test("every GM factory chainId is configured in wagmi", () => {
    const configured = new Set(config.chains.map((chain) => chain.id));
    const missing: number[] = [];
    for (const id of getFactoryChainIds()) {
      if (!configured.has(id)) missing.push(id);
    }
    assert.deepEqual(missing, [], `Missing wagmi chains for GM factories: ${missing.join(", ")}`);
  });
});
