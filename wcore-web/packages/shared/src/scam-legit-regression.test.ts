// Regression guard: legit holdings must NEVER flip to scam/suspicious with
// enrichment data attached. If a case fails here, fix the RULE WEIGHTS in
// src/scam-detector.ts — never weaken this suite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectScam } from "./scam-detector.js";

const cleanGoPlus = {
  available: true, isHoneypot: false, isBlacklisted: false,
  canTakeBackOwnership: false, slippageModifiable: false,
  ownerPercent: 4, isOpenSource: true, isInDex: true,
};

interface LegitCase { sym: string; name: string; bal: number; eur: number | null; ct: string; liq?: number; vol?: number; buys?: number }

const LEGIT: LegitCase[] = [
  { sym: "xGRAIL", name: "Camelot escrowed token", bal: 0.00000058, eur: null, ct: "0x3caae25ee616f2c8e13c74da0813402eae3f496b" },
  { sym: "rSTONE", name: "StakeStone Ether", bal: 0.00000001923341776, eur: 1473.87, ct: "0xad3d07d431b85b525d81372802504fa18dbd554c" },
  { sym: "lSTONE", name: "LayerBank STONE", bal: 0.000064365024883053, eur: 1473.87, ct: "0xe5c40a3331d4fb9a26f5e48b494813d977ec0a8e" },
  { sym: "aRUSDC", name: "Ample Arbitrum USDC", bal: 0.009971, eur: 0.878, ct: "0xd1be1f98991cf69355e468ad15b6d0b6429bcfcb" },
  { sym: "Re7USDC", name: "Re7 USDC", bal: 100, eur: 0.91, ct: "0xb1e80387ebe53ff75a89736097d34dc8d9e9045b" },
  { sym: "SOCIAL", name: "Phavercoin", bal: 2500, eur: 0.04, ct: "0xd3c68968137317a57a9babeacc7707ec433548b4", liq: 180_000, vol: 40_000, buys: 320 },
  { sym: "PNP", name: "Penpie", bal: 3, eur: 12.4, ct: "0x2ac2b254bc18cd4999f64773a966e4f4869c34ee", liq: 900_000, vol: 210_000, buys: 95 },
  { sym: "WLD", name: "Worldcoin", bal: 10, eur: 18.2, ct: "0x163f8c2467924be0ae7b5467eac7d31ac88851ee", liq: 4_200_000, vol: 8_900_000, buys: 1500 },
  { sym: "CWIF", name: "catwifhat", bal: 40_000_000, eur: 0.0000168, ct: "0x7fd164d304b07112cd0da30dcc0900332e99c5ab", liq: 220_000, vol: 65_000, buys: 480 },
];

test("legit regression: no legit holding flips to scam with clean goplus + real liquidity", () => {
  for (const t of LEGIT) {
    const r = detectScam(t.sym, t.name, t.bal, t.eur, t.ct, {
      goPlus: { ...cleanGoPlus },
      dexLiquidityUsd: t.liq, dexVolume24h: t.vol, dexBuys24h: t.buys,
    });
    assert.notEqual(r.level, "scam", `${t.sym} flagged scam: ${r.reasons.join("; ")}`);
  }
});

test("legit regression: unknown-contract legit tokens stay below suspicious with plausible data", () => {
  for (const t of LEGIT.filter(x => x.liq)) {
    const r = detectScam(t.sym, t.name, t.bal, t.eur, t.ct, {
      goPlus: { ...cleanGoPlus },
      dexLiquidityUsd: t.liq, dexVolume24h: t.vol, dexBuys24h: t.buys,
    });
    assert.ok(r.score < 4, `${t.sym} score=${r.score}: ${r.reasons.join("; ")}`);
  }
});
