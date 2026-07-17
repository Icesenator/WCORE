import { z } from "zod";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SVM_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSvmAddress(value: string): boolean {
  if (!SVM_ADDRESS_PATTERN.test(value)) return false;

  let decoded = 0n;
  for (const character of value) {
    decoded = decoded * 58n + BigInt(BASE58_ALPHABET.indexOf(character));
  }

  let decodedBytes = 0;
  for (let remaining = decoded; remaining > 0n; remaining >>= 8n) decodedBytes++;

  let leadingZeroBytes = 0;
  while (value[leadingZeroBytes] === "1") leadingZeroBytes++;
  return leadingZeroBytes + decodedBytes === 32;
}

export const EvmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "invalid EVM address")
  .transform((s) => s.toLowerCase());
export type EvmAddress = z.infer<typeof EvmAddress>;

export const SvmAddress = z
  .string()
  .refine(isValidSvmAddress, "invalid Solana base58 address");
export type SvmAddress = z.infer<typeof SvmAddress>;

export const CosmosAddress = z
  .string()
  .regex(/^[a-z]{1,32}1[a-z0-9]{38,58}$/, "invalid Cosmos bech32 address");
export type CosmosAddress = z.infer<typeof CosmosAddress>;

export const TonAddress = z
  .string()
  .regex(/^(EQ|UQ|Ef|Uf)[A-Za-z0-9_-]{40,60}$/, "invalid TON base64 address");
export type TonAddress = z.infer<typeof TonAddress>;

export const AnyAddress = z.union([EvmAddress, SvmAddress, CosmosAddress, TonAddress]);
export type AnyAddress = z.infer<typeof AnyAddress>;
