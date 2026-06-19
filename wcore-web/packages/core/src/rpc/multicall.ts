import type { EvmRpc, RpcCallOptions, RpcDispatcher } from "./index.js";

// Multicall3 deployed at the same address on 200+ EVM chains via CREATE2
// https://multicall3.com/
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

// tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls) returns ((bool success, bytes returnData)[])
const TRY_AGGREGATE_SELECTOR = "0xbce38bd7";

export interface MulticallCall {
  target: string;
  callData: string;
}

export interface MulticallResult {
  success: boolean;
  returnData: string;
}

function leftPad(hex: string, bytes = 32): string {
  return hex.replace(/^0x/i, "").toLowerCase().padStart(bytes * 2, "0");
}

function rightPadToWord(hex: string): string {
  const clean = hex.replace(/^0x/i, "").toLowerCase();
  const padded = Math.ceil(clean.length / 64) * 64;
  return clean.padEnd(padded, "0");
}

export function encodeTryAggregate(requireSuccess: boolean, calls: MulticallCall[]): string {
  const head = leftPad(requireSuccess ? "1" : "0") + leftPad("40");
  const arrayLen = leftPad(calls.length.toString(16));

  // Compute per-call tails and offsets
  const offsets: number[] = [];
  let cursor = calls.length * 32; // after N offset slots
  let tails = "";
  for (const c of calls) {
    offsets.push(cursor);
    const cleanData = c.callData.replace(/^0x/i, "").toLowerCase();
    const dataLen = cleanData.length / 2;
    const paddedData = rightPadToWord(cleanData);
    // Struct (address target, bytes callData)
    // - address (32)
    // - offset to bytes within struct = 0x40 (32)
    // - bytes length (32)
    // - bytes data (padded)
    const structEnc =
      leftPad(c.target) +
      leftPad("40") +
      leftPad(dataLen.toString(16)) +
      paddedData;
    tails += structEnc;
    cursor += structEnc.length / 2;
  }
  const offsetsHex = offsets.map((o) => leftPad(o.toString(16))).join("");
  return TRY_AGGREGATE_SELECTOR + head + arrayLen + offsetsHex + tails;
}

export function decodeTryAggregateResult(hex: string): MulticallResult[] {
  const clean = hex.replace(/^0x/i, "");
  if (clean.length < 128) return [];
  // First word: offset to array (= 0x20)
  const arrayLen = parseInt(clean.slice(64, 128), 16);
  if (!Number.isFinite(arrayLen) || arrayLen < 0) return [];

  const results: MulticallResult[] = [];
  const tupleStartChar = 128; // chars; corresponds to byte 64 of clean (after array offset + length)
  for (let i = 0; i < arrayLen; i++) {
    const headOffsetHex = clean.slice(tupleStartChar + i * 64, tupleStartChar + (i + 1) * 64);
    const headOffset = parseInt(headOffsetHex, 16);
    if (!Number.isFinite(headOffset)) {
      results.push({ success: false, returnData: "0x" });
      continue;
    }
    const resultStart = tupleStartChar + headOffset * 2;
    if (resultStart + 192 > clean.length) {
      results.push({ success: false, returnData: "0x" });
      continue;
    }
    const success = parseInt(clean.slice(resultStart, resultStart + 64), 16) !== 0;
    const bytesLen = parseInt(clean.slice(resultStart + 128, resultStart + 192), 16);
    const dataStart = resultStart + 192;
    const dataEnd = dataStart + bytesLen * 2;
    const data = clean.slice(dataStart, Math.min(dataEnd, clean.length));
    results.push({ success, returnData: "0x" + data });
  }
  return results;
}

/**
 * Execute a Multicall3 tryAggregate call against an EVM chain.
 * Returns one result per input call (success + returnData).
 * Falls back to sequential calls if multicall fails (e.g. chain has no Multicall3).
 */
export async function multicall(
  rpc: EvmRpc,
  dispatcher: RpcDispatcher,
  endpoints: string[],
  calls: MulticallCall[],
  _opts?: RpcCallOptions,
): Promise<MulticallResult[]> {
  if (calls.length === 0) return [];
  const data = encodeTryAggregate(false, calls);
  const callParam = { to: MULTICALL3_ADDRESS, data };
  try {
    const res = await dispatcher.run<string>(
      endpoints,
      (endpoint, runOpts) => rpc.call<string>(endpoint, "eth_call", [callParam, "latest"], runOpts),
      (v) => v,
    );
    if (!res.consensus || !res.value) return calls.map(() => ({ success: false, returnData: "0x" }));
    return decodeTryAggregateResult(res.value);
  } catch {
    return calls.map(() => ({ success: false, returnData: "0x" }));
  }
}
