// Run: node --import tsx --test packages/core/src/tokens/abi.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRANSFER_EVENT_TOPIC,
  decodeDecimalsResult,
  decodeStringResult,
  decodeUint256,
  encodeBalanceOf,
  encodeErc20Decimals,
  encodeErc20Name,
  encodeErc20Symbol,
  formatUnits,
} from "./abi.js";

test("encodeBalanceOf generates a valid ERC-20 balanceOf call", () => {
  const call = encodeBalanceOf("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");

  assert.equal(
    call,
    "0x70a08231000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045",
  );
});

test("decodeUint256 decodes hex words", () => {
  assert.equal(decodeUint256("0x" + "0".repeat(63) + "f"), 15n);
});

test("formatUnits formats integer token units", () => {
  assert.equal(formatUnits(123456789n, 6), 123.456789);
  assert.equal(formatUnits(1000000000000000000n, 18), 1);
  assert.equal(formatUnits(0n, 18), 0);
});

test("ERC-20 metadata selectors are encoded", () => {
  assert.equal(TRANSFER_EVENT_TOPIC, "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  assert.equal(encodeErc20Symbol(), "0x95d89b41");
  assert.equal(encodeErc20Name(), "0x06fdde03");
  assert.equal(encodeErc20Decimals(), "0x313ce567");
});

test("decodeStringResult decodes ABI dynamic and bytes32 strings", () => {
  const dynamic =
    "0x" +
    "20".padStart(64, "0") +
    "4".padStart(64, "0") +
    Buffer.from("USDC").toString("hex").padEnd(64, "0");
  const bytes32 = "0x" + Buffer.from("WETH").toString("hex").padEnd(64, "0");

  assert.equal(decodeStringResult(dynamic), "USDC");
  assert.equal(decodeStringResult(bytes32), "WETH");
});

test("decodeDecimalsResult decodes decimals", () => {
  assert.equal(decodeDecimalsResult("0x" + "6".padStart(64, "0")), 6);
});
