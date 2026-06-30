// Chainbase Staking data reader for Base chain
// - Locked: dynamic via getDelegationAmount(address) on staking proxy
// - Claimable: read from chainbase-airdrop.json (merkle proof off-chain, not on-chain readable)

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { getRpcEndpoints } from "@wcore/core";

const STAKING_PROXY = "0x0297E997b56017164110f75F71ecd58dA823085B";
const AIRDROP_PROXY = "0x3F2061547174d206613Bc70869A454c25F84A0dF";
const CHAINBASE_RPC_TIMEOUT_MS = Math.max(1_000, Math.floor(Number(process.env.CHAINBASE_RPC_TIMEOUT_MS) || 5_000));

export function getChainbaseRpcEndpoints(): string[] {
  const endpoints = getRpcEndpoints("BASE");
  const override = String(process.env.CHAINBASE_RPC || "").trim();
  if (!override) return endpoints;
  return [override, ...endpoints.filter((endpoint) => endpoint !== override)];
}

// keccak256 minimal port (Ethereum variant, not SHA3)
function keccak256(bytes: Uint8Array): Uint8Array {
  const KECCAK_RC: bigint[] = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];
  const PI: number[] = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];
  const R: number[][] = [
    [0, 1, 62, 28, 27], [36, 44, 6, 55, 20], [3, 10, 43, 25, 39], [41, 45, 15, 21, 8],
    [18, 2, 61, 56, 14], [62, 6, 43, 39, 41], [28, 10, 55, 36, 44], [45, 15, 21, 8, 18],
    [2, 61, 56, 14, 63], [61, 43, 39, 41, 37], [10, 55, 36, 44, 2], [15, 21, 8, 18, 2],
    [56, 14, 63, 37, 55], [14, 63, 37, 55, 10], [63, 37, 55, 10, 15], [37, 55, 10, 15, 21],
    [55, 10, 15, 21, 8], [10, 15, 21, 8, 18], [15, 21, 8, 18, 2], [21, 8, 18, 2, 61],
    [8, 18, 2, 61, 56], [18, 2, 61, 56, 14], [2, 61, 56, 14, 63], [61, 56, 14, 63, 37],
    [56, 14, 63, 37, 55], [14, 63, 37, 55, 10], [63, 37, 55, 10, 15], [37, 55, 10, 15, 21],
    [55, 10, 15, 21, 8], [10, 15, 21, 8, 18], [15, 21, 8, 18, 2], [21, 8, 18, 2, 61],
    [8, 18, 2, 61, 56], [18, 2, 61, 56, 14], [2, 61, 56, 14, 63], [61, 56, 14, 63, 37],
    [56, 14, 63, 37, 55], [14, 63, 37, 55, 10], [63, 37, 55, 10, 15], [37, 55, 10, 15, 21],
    [55, 10, 15, 21, 8], [10, 15, 21, 8, 18], [15, 21, 8, 18, 2], [21, 8, 18, 2, 61],
    [8, 18, 2, 61, 56], [18, 2, 61, 56, 14], [2, 61, 56, 14, 63], [61, 56, 14, 63, 37],
    [56, 14, 63, 37, 55], [14, 63, 37, 55, 10], [63, 37, 55, 10, 15], [37, 55, 10, 15, 21],
    [55, 10, 15, 21, 8], [10, 15, 21, 8, 18], [15, 21, 8, 18, 2], [21, 8, 18, 2, 61],
    [8, 18, 2, 61, 56], [18, 2, 61, 56, 14], [2, 61, 56, 14, 63], [61, 56, 14, 63, 37],
    [56, 14, 63, 37, 55], [14, 63, 37, 55, 10], [63, 37, 55, 10, 15], [37, 55, 10, 15, 21],
    [55, 10, 15, 21, 8], [10, 15, 21, 8, 18], [15, 21, 8, 18, 2], [21, 8, 18, 2, 61],
    [8, 18, 2, 61, 56], [18, 2, 61, 56, 14], [2, 61, 56, 14, 63], [61, 56, 14, 63, 37],
    [56, 14, 63, 37, 55], [14, 63, 37, 55, 10], [63, 37, 55, 10, 15], [37, 55, 10, 15, 21],
    [55, 10, 15, 21, 8], [10, 15, 21, 8, 18], [15, 21, 8, 18, 2], [21, 8, 18, 2, 61],
    [8, 18, 2, 61, 56], [18, 2, 61, 56, 14], [2, 61, 56, 14, 63], [61, 56, 14, 63, 37],
    [56, 14, 63, 37, 55], [14, 63, 37, 55, 10], [63, 37, 55, 10, 15], [37, 55, 10, 15, 21],
    [55, 10, 15, 21, 8], [10, 15, 21, 8, 18], [15, 21, 8, 18, 2], [21, 8, 18, 2, 61],
    [8, 18, 2, 61, 56], [18, 2, 61, 56, 14], [2, 61, 56, 14, 63], [61, 56, 14, 63, 37],
    [56, 14, 63, 37, 55], [14, 63, 37, 55, 10], [63, 37, 55, 10, 15], [37, 55, 10, 15, 21],
    [55, 10, 15, 21, 8], [10, 15, 21, 8, 18], [15, 21, 8, 18, 2], [21, 8, 18, 2, 61],
  ];
  function rotl(x: bigint, n: bigint): bigint {
    n = n % 64n;
    if (n === 0n) return x & 0xffffffffffffffffn;
    return ((x << n) & 0xffffffffffffffffn) | (x >> (64n - n));
  }
  const s: bigint[] = new Array(25).fill(0n);
  const rate = 136;
  const padded = Buffer.alloc(Math.ceil(bytes.length / rate) * rate);
  Buffer.from(bytes).copy(padded);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] = padded[padded.length - 1]! | 0x80;
  for (let i = 0; i < padded.length; i += rate) {
    const block = padded.subarray(i, i + rate);
    for (let j = 0; j < rate; j += 8) {
      let lane = 0n;
      for (let k = 0; k < 8; k++) lane |= BigInt(block[j + k]!) << BigInt(k * 8);
      s[j / 8] = s[j / 8]! ^ lane;
    }
    for (let r = 0; r < 24; r++) {
      const C: bigint[] = [0n, 0n, 0n, 0n, 0n];
      for (let x = 0; x < 5; x++) C[x] = s[x]! ^ s[x + 5]! ^ s[x + 10]! ^ s[x + 15]! ^ s[x + 20]!;
      const D: bigint[] = [0n, 0n, 0n, 0n, 0n];
      for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5]! ^ rotl(C[(x + 1) % 5]!, 1n);
      for (let x = 0; x < 25; x += 5) for (let y = 0; y < 5; y++) s[x + y] = s[x + y]! ^ D[y]!;
      const B: bigint[] = new Array(25).fill(0n);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
        const v = s[x + 5 * y]!;
        const rRow = R[5 * x + y]!;
        B[5 * ((2 * x + 3 * y) % 5) + y] = rotl(v, BigInt(rRow[1]!));
      }
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x + 5 * y] = s[x + 5 * y]! ^ B[5 * x + y]!;
      for (let x = 0; x < 25; x++) s[x] = s[x]! ^ KECCAK_RC[r]!;
    }
  }
  const out = new Uint8Array(32);
  for (let j = 0; j < 32; j++) out[j] = Number((s[Math.floor(j / 8)]! >> BigInt((j % 8) * 8)) & 0xffn);
  return out;
}

function sig4(s: string): string {
  return "0x" + Buffer.from(keccak256(new TextEncoder().encode(s))).subarray(0, 4).toString("hex");
}

const SEL_GET_DELEGATION = "0x15c4642e";
const SEL_BALANCE_OF = "0x70a08231";
const SEL_TOKEN_OF_OWNER_BY_INDEX = sig4("tokenOfOwnerByIndex(address,uint256)");
const SEL_UNDELEGATE_REQUESTS = sig4("undelegateRequests(uint256)");
const MAX_DELEGATION_NFTS = 100;

type ChainbaseLiquidityStatus = "lock" | "flex";

export interface ChainbaseStaking {
  stakingContract: string;
  airdropContract: string;
  locked: number;
  claimable: number;
  total: number;
  liquidityStatus: ChainbaseLiquidityStatus;
  tokenSymbol: string;
  tokenAddress: string;
  sources: { locked: "rpc"; claimable: "config" };
  claimableProjectId?: number;
  claimableTxHash?: string;
  fetchedAt: string;
}

function encodeAddress(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function encodeUint256(value: bigint | number): string {
  return BigInt(value).toString(16).padStart(64, "0");
}

function decodeUint256At(hex: string, index: number): bigint {
  const clean = hex.replace(/^0x/, "");
  const start = index * 64;
  const word = clean.slice(start, start + 64);
  if (word.length !== 64) throw new Error("invalid uint256 result");
  return BigInt("0x" + word);
}

let cachedConfig: { map: Record<string, { amount: number; projectId: number; txHash?: string }>; mtimeMs: number } | null = null;
const CONFIG_PATHS = [
  path.resolve(import.meta.dirname, "chainbase-airdrop.json"),
  path.resolve(process.cwd(), "chainbase-airdrop.json"),
  path.resolve(process.cwd(), "src/plugins/chainbase-airdrop.json"),
  path.resolve(process.cwd(), "apps/api/src/plugins/chainbase-airdrop.json"),
  path.resolve(process.cwd(), "scripts/chainbase-airdrop.json"),
  path.resolve(process.cwd(), "../scripts/chainbase-airdrop.json"),
];

function loadClaimableConfig(): Record<string, { amount: number; projectId: number; txHash?: string }> {
  for (const p of CONFIG_PATHS) {
    try {
      const stat = fs.statSync(p);
      if (cachedConfig && cachedConfig.mtimeMs === stat.mtimeMs) return cachedConfig.map;
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      const out: Record<string, { amount: number; projectId: number; txHash?: string }> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof k === "string" && k.startsWith("_")) continue;
        const entry = v as { amount?: number; projectId?: number; txHash?: string };
        if (typeof entry.amount === "number") {
          out[k.toLowerCase()] = {
            amount: entry.amount,
            projectId: entry.projectId ?? 0,
            txHash: entry.txHash,
          };
        }
      }
      cachedConfig = { map: out, mtimeMs: stat.mtimeMs };
      return out;
    } catch {
      // file not found or invalid, try next
    }
  }
  return {};
}

async function rpcCall(to: string, data: string): Promise<string> {
  let lastError: unknown = new Error("no BASE RPC endpoint configured");
  for (const endpoint of getChainbaseRpcEndpoints()) {
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
        signal: AbortSignal.timeout(CHAINBASE_RPC_TIMEOUT_MS),
      });
      if (!r.ok) throw new Error(`HTTP_${r.status}`);
      const j = (await r.json()) as { error?: { message: string }; result?: string };
      if (j.error) throw new Error(j.error.message);
      if (!j.result || j.result === "0x") throw new Error("empty result");
      return j.result;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getChainbaseLocked(address: string): Promise<number> {
  const addr32 = encodeAddress(address);
  const res = await rpcCall(STAKING_PROXY, SEL_GET_DELEGATION + addr32);
  return Number(BigInt(res)) / 1e18;
}

export async function getChainbaseDelegationLiquidityStatus(address: string, now = Math.floor(Date.now() / 1000)): Promise<ChainbaseLiquidityStatus> {
  const addr32 = encodeAddress(address);
  const balanceHex = await rpcCall(STAKING_PROXY, SEL_BALANCE_OF + addr32);
  const nftCount = Number(BigInt(balanceHex));
  if (!Number.isFinite(nftCount) || nftCount < 0 || nftCount > MAX_DELEGATION_NFTS) return "lock";
  if (nftCount === 0) return "flex";

  for (let i = 0; i < nftCount; i++) {
    const tokenIdHex = await rpcCall(STAKING_PROXY, SEL_TOKEN_OF_OWNER_BY_INDEX + addr32 + encodeUint256(i));
    const tokenId = BigInt(tokenIdHex);
    const requestHex = await rpcCall(STAKING_PROXY, SEL_UNDELEGATE_REQUESTS + encodeUint256(tokenId));
    const amount = decodeUint256At(requestHex, 0);
    const unlockTime = decodeUint256At(requestHex, 1);
    if (amount <= 0n || unlockTime > BigInt(now)) return "lock";
  }
  return "flex";
}

export async function getChainbaseStaking(address: string): Promise<ChainbaseStaking> {
  const locked = await getChainbaseLocked(address);
  let liquidityStatus: ChainbaseLiquidityStatus = locked > 0 ? "lock" : "flex";
  if (locked > 0) {
    try {
      liquidityStatus = await getChainbaseDelegationLiquidityStatus(address);
    } catch {
      liquidityStatus = "lock";
    }
  }
  const configMap = loadClaimableConfig();
  const entry = configMap[address.toLowerCase()];
  const claimable = entry?.amount ?? 0;
  return {
    stakingContract: STAKING_PROXY,
    airdropContract: AIRDROP_PROXY,
    locked,
    claimable,
    total: locked + claimable,
    liquidityStatus,
    tokenSymbol: "C",
    tokenAddress: "0xba12bc7b210e61e5d3110b997a63ea216e0e18f7",
    sources: { locked: "rpc", claimable: "config" },
    claimableProjectId: entry?.projectId,
    claimableTxHash: entry?.txHash,
    fetchedAt: new Date().toISOString(),
  };
}
