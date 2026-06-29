const BALANCE_OF_SELECTOR = "0x70a08231";
export const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SYMBOL_SELECTOR = "0x95d89b41";
const NAME_SELECTOR = "0x06fdde03";
const DECIMALS_SELECTOR = "0x313ce567";

export function encodeBalanceOf(address: string): string {
  const normalized = normalizeEvmAddress(address);
  if (!normalized) throw new Error("invalid EVM address");
  return `${BALANCE_OF_SELECTOR}${normalized.replace(/^0x/, "").padStart(64, "0")}`;
}

export function encodeCustomBalanceCall(address: string, selector: string, extraArgs?: string[]): string {
  const normalized = normalizeEvmAddress(address);
  if (!normalized) throw new Error("invalid EVM address");
  if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) throw new Error("invalid 4-byte selector");
  const extra = Array.isArray(extraArgs) ? extraArgs.map((a) => {
    const hex = String(a).replace(/^0x/, "");
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("invalid 32-byte extra arg");
    return hex;
  }).join("") : "";
  return `${selector.toLowerCase()}${normalized.replace(/^0x/, "").padStart(64, "0")}${extra}`;
}

export function decodeUint256(hex: string): bigint {
  const clean = String(hex || "0x0").trim();
  return BigInt(clean === "0x" ? "0x0" : clean);
}

export function decodeUint256FirstWord(hex: string): bigint {
  const clean = String(hex || "0x0").trim();
  // For responses longer than 32 bytes (e.g. struct returns), extract only the
  // first 32-byte word (66 hex chars including "0x" prefix).
  const MAX_HEX_LEN = 66; // "0x" + 64 hex chars = 32 bytes
  if (clean.startsWith("0x") && clean.length > MAX_HEX_LEN) {
    return BigInt(clean.slice(0, MAX_HEX_LEN));
  }
  return BigInt(clean === "0x" ? "0x0" : clean);
}

export function formatUnits(value: bigint, decimals: number): number {
  if (value === 0n) return 0;
  const safeDecimals = Math.max(0, Math.trunc(decimals));
  const divisor = 10n ** BigInt(safeDecimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionText = fraction.toString().padStart(safeDecimals, "0").replace(/0+$/, "");
  return Number(fractionText ? `${whole}.${fractionText}` : whole.toString());
}

export function encodeErc20Symbol(): string {
  return SYMBOL_SELECTOR;
}

export function encodeErc20Name(): string {
  return NAME_SELECTOR;
}

export function encodeErc20Decimals(): string {
  return DECIMALS_SELECTOR;
}

export function decodeStringResult(hex: string): string | null {
  const clean = String(hex || "").replace(/^0x/i, "");
  if (!clean || clean.length < 64) return null;

  const firstWord = clean.slice(0, 64);
  const offset = Number.parseInt(firstWord, 16);
  if (offset > 0 && Number.isFinite(offset) && offset * 2 + 64 <= clean.length) {
    const lengthWordStart = offset * 2;
    const length = Number.parseInt(clean.slice(lengthWordStart, lengthWordStart + 64), 16);
    if (!Number.isFinite(length) || length < 0 || lengthWordStart + 64 + length * 2 > clean.length) return null;
    const dataStart = lengthWordStart + 64;
    return hexToUtf8(clean.slice(dataStart, dataStart + length * 2));
  }

  return hexToUtf8(firstWord.replace(/(?:00)+$/u, ""));
}

export function decodeDecimalsResult(hex: string): number | null {
  const value = decodeUint256(hex);
  if (value < 0n || value > 255n) return null;
  return Number(value);
}

function normalizeEvmAddress(address: string): string | null {
  const value = String(address || "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(value) ? value : null;
}

function hexToUtf8(hex: string): string | null {
  try {
    if (!hex) return null;
    return Buffer.from(hex, "hex").toString("utf8").replace(/\0+$/u, "") || null;
  } catch {
    return null;
  }
}
