import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getScanProgressDisplay } from "../components/scan-progress";

describe("scan progress display", () => {
  test("uses chain progress during deep scans before wallet completion", () => {
    const display = getScanProgressDisplay({
      walletDone: 0,
      walletTotal: 9,
      currentChainDone: 41,
      currentChainTotal: 110,
      overallChainDone: 41,
      overallChainTotal: 990,
      deepScan: true,
    });

    assert.equal(display.percent, 4);
    assert.equal(display.primaryLabel, "41/990 chain checks");
    assert.equal(display.secondaryLabel, "0/9 wallets");
  });

  test("weights mixed wallet VMs by compatible chain counts", () => {
    const display = getScanProgressDisplay({
      walletDone: 0,
      walletTotal: 3,
      currentChainDone: 6,
      currentChainTotal: 110,
      overallChainDone: 6,
      overallChainTotal: 115,
      deepScan: true,
    });

    assert.equal(display.percent, 5);
    assert.equal(display.primaryLabel, "6/115 chain checks");
    assert.equal(display.secondaryLabel, "0/3 wallets");
  });

  test("does not treat current wallet chain progress as global progress", () => {
    const display = getScanProgressDisplay({
      walletDone: 0,
      walletTotal: 9,
      currentChainDone: 6,
      currentChainTotal: 110,
      overallChainDone: 6,
      overallChainTotal: 990,
      deepScan: true,
    });

    assert.equal(display.percent, 1);
    assert.equal(display.primaryLabel, "6/990 chain checks");
    assert.equal(display.secondaryLabel, "0/9 wallets");
  });

  test("does not stay at zero percent once deep scan chains are progressing", () => {
    const display = getScanProgressDisplay({
      walletDone: 0,
      walletTotal: 9,
      currentChainDone: 6,
      currentChainTotal: 110,
      overallChainDone: 6,
      overallChainTotal: 990,
      deepScan: true,
    });

    assert.equal(display.percent, 1);
    assert.equal(display.primaryLabel, "6/990 chain checks");
    assert.equal(display.secondaryLabel, "0/9 wallets");
  });

  test("shows non-zero percent once at least one chain check completed", () => {
    const display = getScanProgressDisplay({
      walletDone: 0,
      walletTotal: 9,
      currentChainDone: 1,
      currentChainTotal: 110,
      overallChainDone: 1,
      overallChainTotal: 348,
      deepScan: true,
    });

    assert.equal(display.percent, 1);
    assert.equal(display.primaryLabel, "1/348 chain checks");
  });

  test("keeps wallet progress for standard scans", () => {
    const display = getScanProgressDisplay({
      walletDone: 2,
      walletTotal: 4,
      currentChainDone: 41,
      currentChainTotal: 110,
      deepScan: false,
    });

    assert.equal(display.percent, 50);
    assert.equal(display.primaryLabel, "2/4 wallets");
    assert.equal(display.secondaryLabel, null);
  });
});
