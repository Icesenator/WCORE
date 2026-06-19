import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSymbolBlocked,
  isContractBlocked,
  isSymbolApproved,
  isContractApproved,
  applyScamOverrides,
  readScamOverrides,
  writeScamOverride,
  removeScamOverride,
  buildScamEntry,
  type ScamEntry,
  type ScamTokenInput,
} from "../lib/scam-overrides";

const WBTC_SCROLL = "0x94b5bd0c00000000000000000000000000000001";
const WBTC_OTHER = "0x0000000000000000000000000000000000000001";

test("isContractBlocked matches a contract-aware entry (case-insensitive)", () => {
  const entries: ScamEntry[] = [{ symbol: "WBTC", contract: WBTC_SCROLL.toUpperCase() }];
  assert.equal(isContractBlocked(entries, "WBTC", WBTC_SCROLL), true);
  assert.equal(isContractBlocked(entries, "wbtc", WBTC_SCROLL), true);
  assert.equal(isContractBlocked(entries, "WBTC", WBTC_OTHER), false);
});

test("isContractBlocked ignores string entries (no contract to compare)", () => {
  const entries: ScamEntry[] = ["WBTC"];
  assert.equal(isContractBlocked(entries, "WBTC", WBTC_SCROLL), false);
});

test("isContractBlocked returns false when contract is empty or missing", () => {
  const entries: ScamEntry[] = [{ symbol: "WBTC", contract: WBTC_SCROLL }];
  assert.equal(isContractBlocked(entries, "WBTC", ""), false);
  assert.equal(isContractBlocked(entries, "WBTC", undefined as unknown as string), false);
});

test("isSymbolBlocked matches a string entry but not a contract-only entry", () => {
  const entries: ScamEntry[] = ["ETH", { symbol: "WBTC", contract: WBTC_SCROLL }];
  assert.equal(isSymbolBlocked(entries, "ETH"), true);
  assert.equal(isSymbolBlocked(entries, "WBTC"), false);
});

test("isSymbolBlocked matches an object entry that has no contract (wildcard)", () => {
  const entries: ScamEntry[] = [{ symbol: "ETH" }];
  assert.equal(isSymbolBlocked(entries, "ETH"), true);
});

test("isContractApproved mirrors isContractBlocked", () => {
  const entries: ScamEntry[] = [{ symbol: "USDC", contract: "0xabc" }];
  assert.equal(isContractApproved(entries, "USDC", "0xABC"), true);
  assert.equal(isContractApproved(entries, "USDC", "0xdef"), false);
});

test("isSymbolApproved mirrors isSymbolBlocked", () => {
  const entries: ScamEntry[] = ["USDC", { symbol: "WBTC", contract: "0xabc" }];
  assert.equal(isSymbolApproved(entries, "USDC"), true);
  assert.equal(isSymbolApproved(entries, "WBTC"), false);
});

test("applyScamOverrides excludes a contract-blocked token even if symbol is approved for another chain", () => {
  const blocked: ScamEntry[] = [{ symbol: "WBTC", contract: WBTC_SCROLL }];
  const approved: ScamEntry[] = ["WBTC"];
  const tokens: ScamTokenInput[] = [
    { symbol: "WBTC", contract: WBTC_SCROLL },
    { symbol: "WBTC", contract: WBTC_OTHER },
  ];
  const visible = applyScamOverrides(tokens, blocked, approved);
  assert.equal(visible.length, 1);
  assert.equal((visible[0] as { contract: string }).contract, WBTC_OTHER);
});

test("applyScamOverrides excludes a symbol-blocked (wildcard) token", () => {
  const blocked: ScamEntry[] = ["ETH"];
  const approved: ScamEntry[] = [];
  const tokens: ScamTokenInput[] = [
    { symbol: "ETH", contract: "native" },
    { symbol: "WBTC", contract: WBTC_OTHER },
  ];
  const visible = applyScamOverrides(tokens, blocked, approved);
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.symbol, "WBTC");
});

test("applyScamOverrides returns all tokens when no entries match", () => {
  const blocked: ScamEntry[] = [{ symbol: "WBTC", contract: WBTC_SCROLL }];
  const approved: ScamEntry[] = [];
  const tokens: ScamTokenInput[] = [
    { symbol: "WBTC", contract: WBTC_OTHER },
    { symbol: "USDC", contract: "0xabc" },
  ];
  const visible = applyScamOverrides(tokens, blocked, approved);
  assert.equal(visible.length, 2);
});

test("applyScamOverrides handles empty inputs", () => {
  assert.equal(applyScamOverrides([], [], []).length, 0);
  const tokens: ScamTokenInput[] = [{ symbol: "ETH" }];
  assert.equal(applyScamOverrides(tokens, [], []).length, 1);
});

test("readScamOverrides returns empty arrays when window is undefined", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
  try {
    const result = readScamOverrides();
    assert.deepEqual(result.blocked, []);
    assert.deepEqual(result.approved, []);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("readScamOverrides parses contract-aware entries from localStorage", () => {
  const values: Record<string, string> = {
    wcore_scam_blocked: JSON.stringify([{ symbol: "WBTC", contract: WBTC_SCROLL }, "ETH"]),
    wcore_scam_approved: JSON.stringify([{ symbol: "USDC", contract: "0xabc" }]),
  };
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values[key] ?? null } },
  });
  try {
    const result = readScamOverrides();
    assert.equal(result.blocked.length, 2);
    assert.equal(result.approved.length, 1);
    assert.equal(isContractBlocked(result.blocked, "WBTC", WBTC_SCROLL), true);
    assert.equal(isSymbolBlocked(result.blocked, "ETH"), true);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("readScamOverrides tolerates malformed JSON", () => {
  const values: Record<string, string> = {
    wcore_scam_blocked: "{not json",
    wcore_scam_approved: "[]",
  };
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values[key] ?? null } },
  });
  try {
    const result = readScamOverrides();
    assert.deepEqual(result.blocked, []);
    assert.deepEqual(result.approved, []);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("readScamOverrides tolerates non-array JSON", () => {
  const values: Record<string, string> = {
    wcore_scam_blocked: JSON.stringify({ not: "an array" }),
    wcore_scam_approved: "null",
  };
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values[key] ?? null } },
  });
  try {
    const result = readScamOverrides();
    assert.deepEqual(result.blocked, []);
    assert.deepEqual(result.approved, []);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("buildScamEntry returns a string for the native asset", () => {
  assert.deepEqual(buildScamEntry("ETH", "native"), "ETH");
});

test("buildScamEntry returns an object for a contract-aware asset", () => {
  assert.deepEqual(buildScamEntry("WBTC", "0xabc"), { symbol: "WBTC", contract: "0xabc" });
});

test("buildScamEntry collapses missing contracts to a string", () => {
  assert.deepEqual(buildScamEntry("ETH"), "ETH");
  assert.deepEqual(buildScamEntry("ETH", ""), "ETH");
});

test("writeScamOverride adds a new entry without duplicating", () => {
  const values: Record<string, string> = {};
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values[key] ?? null,
        setItem: (key: string, value: string) => { values[key] = value; },
      },
    },
  });
  try {
    const entry: ScamEntry = { symbol: "WBTC", contract: WBTC_SCROLL };
    writeScamOverride("blocked", entry);
    writeScamOverride("blocked", entry); // duplicate
    const stored = JSON.parse(values.wcore_scam_blocked ?? "[]") as ScamEntry[];
    assert.equal(stored.length, 1);
    assert.deepEqual(stored[0], entry);

    writeScamOverride("approved", "ETH");
    const approved = JSON.parse(values.wcore_scam_approved ?? "[]") as ScamEntry[];
    assert.deepEqual(approved, ["ETH"]);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("removeScamOverride drops the matching entry but keeps the rest", () => {
  const values: Record<string, string> = {
    wcore_scam_blocked: JSON.stringify([{ symbol: "WBTC", contract: WBTC_SCROLL }, "ETH", { symbol: "WBTC", contract: WBTC_OTHER }]),
  };
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values[key] ?? null,
        setItem: (key: string, value: string) => { values[key] = value; },
      },
    },
  });
  try {
    removeScamOverride("blocked", { symbol: "WBTC", contract: WBTC_SCROLL });
    const stored = JSON.parse(values.wcore_scam_blocked ?? "[]") as ScamEntry[];
    assert.equal(stored.length, 2);
    assert.equal(stored[0], "ETH");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("writeScamOverride is a no-op when window is undefined", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
  try {
    writeScamOverride("blocked", "ETH");
    removeScamOverride("approved", "WBTC");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});
