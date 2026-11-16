import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDeployTx } from "./gas-estimate";
import type { WalletRequest } from "./chain-switch";

function wallet(answer: unknown, calls: { method: string; params: unknown[] }[] = []): WalletRequest {
  return {
    request: async (args) => {
      calls.push({ method: args.method, params: args.params ?? [] });
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

const FROM = "0x1111111111111111111111111111111111111111";

test("estimate + 20 % is set as the gas limit (Etherlink: 10,210,156 -> 12,252,188)", async () => {
  const calls: { method: string; params: unknown[] }[] = [];
  const tx = await buildDeployTx(wallet("0x" + (10210156).toString(16), calls), FROM, "0x60");
  assert.equal(calls[0]!.method, "eth_estimateGas");
  assert.deepEqual(calls[0]!.params, [{ from: FROM, data: "0x60" }]);
  assert.equal(tx.gas, "0x" + (12252188).toString(16));
  assert.equal(tx.from, FROM);
  assert.equal(tx.data, "0x60");
});

test("the margin rounds up", async () => {
  const tx = await buildDeployTx(wallet("0x7"), FROM, "0x60"); // 7 * 1.2 = 8.4 -> 9
  assert.equal(tx.gas, "0x9");
});

test("a failed or invalid estimate leaves gas to the wallet", async () => {
  for (const answer of [new Error("execution reverted"), null, "0x0", "12", 42, "0xzz"]) {
    const tx = await buildDeployTx(wallet(answer), FROM, "0x60");
    assert.equal("gas" in tx, false, String(answer));
    assert.deepEqual(tx, { from: FROM, data: "0x60" });
  }
});

test("both deployments in DeployClient send the estimated transaction", () => {
  const src = readFileSync(join(__dirname, "DeployClient.tsx"), "utf8");
  assert.equal((src.match(/await buildDeployTx\(window\.ethereum, accounts\[0\], /g) || []).length, 2);
  assert.equal(/params: \[\{ from: accounts\[0\], data/.test(src), false);
});
