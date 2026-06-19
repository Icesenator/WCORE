import { test } from "node:test";
import assert from "node:assert/strict";
import { lsAnyGmDoneToday, lsGmDone, lsSetGmDone } from "../lib/gm-storage";

test("lsAnyGmDoneToday detects any chain marked done today", () => {
  const today = new Date().toISOString().slice(0, 10);
  const values: Record<string, string> = {
    wc_gm_onchain_chains: JSON.stringify({ blast: today }),
  };
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values[key] ?? null } },
  });

  try {
    assert.equal(lsAnyGmDoneToday(), true);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("lsGmDone matches chain keys case-insensitively", () => {
  const today = new Date().toISOString().slice(0, 10);
  const values: Record<string, string> = {
    wc_gm_onchain_chains: JSON.stringify({ MOONRIVER: today }),
  };
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: { getItem: (key: string) => values[key] ?? null } },
  });

  try {
    assert.equal(lsGmDone("moonriver"), true);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("lsSetGmDone stores canonical lowercase chain keys", () => {
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
    lsSetGmDone("MOONRIVER");
    const stored = JSON.parse(values.wc_gm_onchain_chains ?? "{}") as Record<string, string>;
    assert.equal(Boolean(stored.moonriver), true);
    assert.equal(Boolean(stored.MOONRIVER), false);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});
