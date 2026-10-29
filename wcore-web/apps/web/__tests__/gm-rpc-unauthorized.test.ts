import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as switchErrors from "../lib/gm-switch-error";
import * as rpcErrors from "../lib/gm-rpc-error";

const require = createRequire(import.meta.url);
const unauthorized = () => ({
  code: -32603,
  message: "Internal JSON-RPC error",
  data: { originalError: { code: -32000, message: "Unauthorized: invalid RPC key (eth_getTransactionCount)" } },
});

// Execute the real hook with local EIP-1193/API/React boundaries. No browser,
// network, wallet profile, account access or signing is used by this harness.
function harness(options: { sendError?: unknown; chainError?: unknown; chainId?: string; receipt?: unknown; receiptError?: unknown; receiptDelay?: number; noRaw?: boolean; wagmiConnected?: boolean; publicStatus?: string; switchError?: unknown; chainKey?: string; deployChain?: string } = {}) {
  const states: unknown[] = [];
  const calls: string[] = [];
  let done = 0;
  let recorded = 0;
  let events = 0;
  let receiptDelay = options.receiptDelay ?? 0;
  let fail = options.sendError;
  let receiptFail = options.receiptError;
  let now = 0;
  const rawProvider = {
    request: async ({ method }: { method: string }) => {
      calls.push(method);
      if (method === "wallet_switchEthereumChain") {
        if (options.switchError) throw options.switchError;
        return null;
      }
      if (method === "eth_chainId") {
        if (options.chainError) throw options.chainError;
        return options.chainId ?? "0x2105";
      }
      if (method === "eth_sendTransaction") {
        if (fail) throw fail;
        return "0xmockhash";
      }
      if (method === "eth_getTransactionReceipt") {
        now += receiptDelay;
        if (receiptFail) throw receiptFail;
        return options.receipt ?? { status: "0x1", logs: [] };
      }
      throw new Error(`Unexpected method ${method}`);
    },
  };
  const mocks: Record<string, unknown> = {
    react: {
      useState: (initial: unknown) => { const i = states.push(initial) - 1; return [initial, (v: unknown) => { states[i] = v; }]; },
      useEffect: () => {}, useCallback: (fn: unknown) => fn, useRef: (current: unknown) => ({ current }),
    },
    viem: { encodeFunctionData: () => "0x1234" },
    wagmi: { useSendTransaction: () => ({ sendTransactionAsync: async () => {
      calls.push("wagmi_send");
      if (fail) throw fail;
      return "0xmockhash";
    } }), useChainId: () => 8453, useAccount: () => ({ isConnected: options.wagmiConnected ?? false }), useConfig: () => ({ chains: [] }) },
    "@wagmi/core": { getPublicClient: () => {
      calls.push("getPublicClient");
      return { waitForTransactionReceipt: async () => {
        calls.push("public_receipt");
        now += receiptDelay;
        if (receiptFail) throw receiptFail;
        return { status: options.publicStatus ?? "success", logs: [] };
      } };
    } }, 
    "@wcore/shared": { getFactory: () => ({ chainId: 8453 }), getFactoryAddress: () => "0xfactory" },
    "@/lib/gm-abi": { gmOnChainAbi: [], gmFactoryAbi: [] },
    "@/lib/api": { getApiUrl: () => "", apiFetch: async (url: string) => {
      if (url.includes("/api/gm/random")) return { ok: true, json: async () => ({ chainKey: options.chainKey ?? "BASE", contractAddress: "0xcontract" }) };
      if (url.includes("/api/gm/onchain")) { recorded++; return { ok: true }; }
      throw new Error(`Unexpected API ${url}`);
    } },
    "@/lib/gm-storage": { lsSetGmDone: () => { done++; } },
    "@/lib/gm-winddown": { getGmWindDown: () => null },
    "./useSafeSwitchChain": { useSafeSwitchChain: () => async () => {
      calls.push("wagmi_switch");
      if (options.switchError) throw options.switchError;
    } },
    "@/lib/gm-deploy-status": {},
    "@/lib/gm-switch-error": switchErrors,
    "@/lib/gm-tip": { computeGmTipWei: () => 1n },
    "@/components/ConnectButton": { useWallet: () => ({ rawProvider: options.noRaw ? undefined : rawProvider }) },
  };
  const source = readFileSync(new URL("../hooks/useOnChainGm.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, any> = {};
  // Advance only the hook's wrong-chain polling clock; all tests stay local and fast.
  class Clock extends Date { static override now() { now += 1000; return now; } }
  const clock = { Date: Clock, setTimeout: (fn: () => void) => { fn(); return 0; } };
  const transactionExports = {};
  const transactionSource = readFileSync(new URL("../lib/onchain-tx.ts", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(transactionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: transactionExports, require: (id: string) => id === "./gm-rpc-error" ? rpcErrors : require(id), ...clock });
  mocks["@/lib/onchain-tx"] = transactionExports;
  runInNewContext(compiled, {
    exports, require: (id: string) => id in mocks ? mocks[id] : require(id.replace("@/", "../")),
    ...clock, URLSearchParams, AbortSignal, console,
    window: { dispatchEvent: () => { events++; } }, CustomEvent: class {},
  });
  const hook = exports.useOnChainGm({ chainKey: options.deployChain, walletAddress: "0xwallet", streak: 1, nativePriceMap: { base: 2000, superseed: 2000 } });
  return { hook, states, calls, get done() { return done; }, get recorded() { return recorded; }, get events() { return events; }, allowRetry: () => { fail = undefined; receiptFail = undefined; receiptDelay = 0; } };
}

describe("GM provider acceptance (synthetic EIP-1193)", () => {
  function noPhantom(h: ReturnType<typeof harness>) {
    assert.equal(h.done, 0);
    assert.equal(h.recorded, 0);
    assert.equal(h.events, 0);
    assert.equal(h.states[0], false);
  }

  for (const noRaw of [false, true]) {
    test(`rejected switch stops before sending (${noRaw ? "wagmi" : "raw"})`, async () => {
      const error = Object.assign(new Error("User rejected switch"), { code: 4001 });
      const h = harness({ noRaw, wagmiConnected: true, switchError: error });
      await assert.rejects(h.hook.sendGm(), /reject|cancel/i);
      assert.deepEqual(h.calls, [noRaw ? "wagmi_switch" : "wallet_switchEthereumChain"]);
      noPhantom(h);
    });
  }

  test("no raw provider and disconnected wagmi cannot request a transaction", async () => {
    const h = harness({ noRaw: true });
    await assert.rejects(h.hook.sendGm(), /no longer connected|reconnect/i);
    assert.deepEqual(h.calls, []);
    noPhantom(h);
  });

  test("connected wagmi without raw provider validates a successful receipt", async () => {
    const h = harness({ noRaw: true, wagmiConnected: true });
    assert.equal(await h.hook.sendGm(), "0xmockhash");
    assert.deepEqual(h.calls, ["wagmi_switch", "wagmi_send", "getPublicClient", "public_receipt"]);
    assert.equal(h.done, 1);
    assert.equal(h.recorded, 1);
    assert.equal(h.states[0], false);
  });

  test("wagmi rejection permits only an explicit retry, with no raw fallback", async () => {
    const error = Object.assign(new Error("User rejected"), { code: 4001 });
    const h = harness({ noRaw: true, wagmiConnected: true, sendError: error });
    await assert.rejects(h.hook.sendGm(), (actual) => actual === error);
    assert.deepEqual(h.calls, ["wagmi_switch", "wagmi_send"]);
    noPhantom(h);
    h.allowRetry();
    assert.equal(await h.hook.sendGm(), "0xmockhash");
    assert.equal(h.calls.filter((call) => call === "wagmi_send").length, 2);
    assert.equal(h.done, 1);
    assert.equal(h.recorded, 1);
  });

  for (const noRaw of [false, true]) {
    test(`RPC failure during receipt is not a revert (${noRaw ? "wagmi" : "raw"})`, async () => {
      const h = harness({ noRaw, wagmiConnected: true, receiptError: unauthorized() });
      await assert.rejects(h.hook.sendGm(), (error: any) => {
        assert.doesNotMatch(error.message, /revert/i);
        assert.equal(error.code, "RPC_UNAUTHORIZED");
        return true;
      });
      assert.equal(h.calls.filter((call) => call === (noRaw ? "wagmi_send" : "eth_sendTransaction")).length, 1);
      noPhantom(h);
      h.allowRetry();
      assert.equal(await h.hook.sendGm(), "0xmockhash");
      assert.equal(h.done, 1);
    });
  }

  test("a real wagmi reverted receipt is reported as an on-chain revert", async () => {
    const h = harness({ noRaw: true, wagmiConnected: true, publicStatus: "reverted" });
    await assert.rejects(h.hook.sendGm(), /reverted on-chain/i);
    noPhantom(h);
  });

  test("transient raw RPC errors still poll to timeout without inventing a revert", async () => {
    const h = harness({ receiptError: new Error("Temporary RPC failure") });
    await assert.rejects(h.hook.sendGm(), (error: any) => {
      assert.match(error.message, /timeout.*confirmation unknown/i);
      assert.doesNotMatch(error.message, /revert/i);
      return true;
    });
    assert.ok(h.calls.filter((call) => call === "eth_getTransactionReceipt").length > 1);
    assert.equal(h.calls.filter((call) => call === "eth_sendTransaction").length, 1);
    noPhantom(h);
  });

  test("unknown wagmi receipt status is neither revert nor success", async () => {
    const h = harness({ noRaw: true, wagmiConnected: true, publicStatus: "unknown" });
    await assert.rejects(h.hook.sendGm(), (error: any) => {
      assert.match(error.message, /receipt.*status/i);
      assert.doesNotMatch(error.message, /revert/i);
      return true;
    });
    noPhantom(h);
  });

  for (const noRaw of [false, true]) {
    test(`successful receipt returned after deadline cannot mark GM done (${noRaw ? "wagmi" : "raw"})`, async () => {
      const h = harness({ noRaw, wagmiConnected: true, receiptDelay: 61_000 });
      await assert.rejects(h.hook.sendGm(), /timeout/i);
      assert.equal(h.calls.filter((call) => call === (noRaw ? "public_receipt" : "eth_getTransactionReceipt")).length, 1);
      assert.equal(h.calls.filter((call) => call === (noRaw ? "wagmi_send" : "eth_sendTransaction")).length, 1);
      noPhantom(h);
      h.allowRetry();
      assert.equal(await h.hook.sendGm(), "0xmockhash");
      assert.equal(h.calls.filter((call) => call === (noRaw ? "wagmi_send" : "eth_sendTransaction")).length, 2);
      assert.equal(h.done, 1);
      assert.equal(h.recorded, 1);
      assert.equal(h.events, 1);
    });
  }
});

describe("GM RPC authorization before signature", () => {
  test("page hides the signature journey behind the shared pure RPC status", () => {
    const getStatus = (rpcErrors as Record<string, any>).getGmRpcUnavailableMessage;
    assert.equal(typeof getStatus, "function");
    assert.match(getStatus(" SUPERSEED "), /Superseed.*removed/i);
    assert.equal(getStatus("base"), null);
    const page = readFileSync(new URL("../app/gm/GmPageClient.tsx", import.meta.url), "utf8");
    assert.match(page, /getGmRpcUnavailableMessage\(chain\.key\)/);
    assert.match(page, /rpcUnavailable \? \([\s\S]*?<button[^>]*disabled[\s\S]*?GM unavailable[\s\S]*?rpcUnavailable[\s\S]*?: !initDone/);
  });
  test("blocks Superseed GM before any wallet request, including an explicit retry", async () => {
    const h = harness({ chainKey: "SUPERSEED" });
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(h.hook.sendGm(), (error: any) => {
        assert.equal(error.code, "CHAIN_REMOVED");
        assert.match(error.message, /Superseed.*removed/i);
        return true;
      });
      assert.equal(h.states[0], false);
    }
    assert.deepEqual(h.calls, []);
    assert.equal(h.done, 0);
    assert.equal(h.recorded, 0);
  });

  test("blocks new Superseed deployments without wallet requests", async () => {
    const h = harness({ deployChain: "superseed" });
    await assert.rejects(h.hook.deployContract(), (error: any) => error.code === "CHAIN_REMOVED");
    assert.deepEqual(h.calls, []);
    assert.equal(h.states[1], false);
    assert.equal(h.done, 0);
  });
  test("classifies nested nonce-preparation rejection and resets for an explicit retry", async () => {
    const h = harness({ sendError: unauthorized() });
    await assert.rejects(h.hook.sendGm(), (error: any) => {
      assert.equal(error.code, "RPC_UNAUTHORIZED");
      assert.match(error.message, /RPC.*authoriz/i);
      assert.doesNotMatch(error.message, /insufficient|gas|revert|contract|sent|key \(/i);
      return true;
    });
    assert.equal(h.states[0], false);
    assert.equal(h.done, 0);
    assert.equal(h.recorded, 0);
    assert.equal(h.calls.filter((m) => m === "eth_sendTransaction").length, 1);
    assert.ok(!h.calls.includes("eth_getTransactionReceipt"));
    h.allowRetry();
    assert.equal(await h.hook.sendGm(), "0xmockhash");
    assert.equal(h.states[0], false);
    assert.equal(h.done, 1);
  });

  test("does not hide RPC unauthorized during chain verification as wrong chain", async () => {
    const h = harness({ chainError: unauthorized() });
    await assert.rejects(h.hook.sendGm(), (error: any) => error.code === "RPC_UNAUTHORIZED");
    assert.ok(!h.calls.includes("eth_sendTransaction"));
    assert.equal(h.done, 0);
    assert.equal(h.states[0], false);
  });

  for (const [label, error] of [
    ["cancel", Object.assign(new Error("User rejected"), { code: 4001 })],
    ["method reject", Object.assign(new Error("Unsupported method"), { code: 4200 })],
    ["timeout", new Error("Request timeout")],
    ["wallet authorization", Object.assign(new Error("Account unauthorized"), { code: 4100 })],
  ] as const) {
    test(`preserves ${label} without a false success or automatic resend`, async () => {
      const h = harness({ sendError: error });
      await assert.rejects(h.hook.sendGm(), (actual) => actual === error);
      assert.equal(h.states[0], false);
      assert.equal(h.done, 0);
      assert.equal(h.recorded, 0);
      assert.equal(h.calls.filter((m) => m === "eth_sendTransaction").length, 1);
    });
  }

  test("wrong chain never sends or marks done", async () => {
    const h = harness({ chainId: "0x1" });
    await assert.rejects(h.hook.sendGm(), /did not switch/);
    assert.ok(!h.calls.includes("eth_sendTransaction"));
    assert.equal(h.done, 0);
    assert.equal(h.states[0], false);
  });

  test("a sent hash with a reverted receipt is not a successful GM", async () => {
    const h = harness({ receipt: { status: "0x0", logs: [] } });
    await assert.rejects(h.hook.sendGm(), /reverted on-chain/);
    assert.equal(h.done, 0);
    assert.equal(h.recorded, 0);
    assert.equal(h.states[0], false);
  });
});
