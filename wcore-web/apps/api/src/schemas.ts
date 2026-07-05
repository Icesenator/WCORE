import { z } from "zod";

// ─── Primitives ─────────────────────────────────────────────────────────────

export const EvmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/i, "Invalid EVM address");

export const AnyWalletAddress = z.string().min(1).max(150);

export const TxHash = z
  .string()
  .regex(/^0x[0-9a-fA-F]+$/, "Invalid tx hash")
  .min(4)
  .max(132);

export const ChainKey = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_-]+$/i, "Invalid chain key")
  .transform((s) => s.toLowerCase());

export const CuidId = z.string().cuid("Invalid id");

export const UuidOrCuid = z.string().min(1).max(128);

// ─── Auth ────────────────────────────────────────────────────────────────────

/** GET /api/auth/nonce */
export const NonceQuerySchema = z.object({
  address: z.string().min(1).max(150),
  chainId: z.coerce.number().int().positive(),
});

/** POST /api/auth/login */
export const LoginBodySchema = z.object({
  message: z.string().min(1).max(4000),
  signature: z.string().min(1).max(500),
  address: z.string().min(1).max(150),
  chainId: z.number().int().positive().optional(),
  ref: z.string().min(4).max(20).regex(/^[a-z0-9]+$/i).optional(),
});

/** GET /api/profile/:address */
export const ProfileParamsSchema = z.object({
  address: AnyWalletAddress,
});

/** GET /api/wallets/nonce */
export const WalletNonceQuerySchema = z.object({
  address: z.string().min(1).max(150),
});

/** POST /api/wallets */
export const LinkedWalletAddBodySchema = z.object({
  address: z.string().min(1).max(150),
  label: z.string().min(1).max(500).optional(),
  signature: z.string().min(1).max(500).optional(),
  message: z.string().min(1).max(4000).optional(),
  publicKey: z.string().min(1).max(500).optional(),
  mode: z.enum(["view_only"]).optional(),
});

/** DELETE /api/wallets/:id  PATCH /api/wallets/:id */
export const WalletIdParamsSchema = z.object({
  id: UuidOrCuid,
});

/** PATCH /api/wallets/:id */
export const LinkedWalletPatchBodySchema = z.object({
  label: z.string().min(1).max(500).nullish(),
});

// ─── Gamification ─────────────────────────────────────────────────────────────

/** POST /api/gm/onchain */
export const GmOnchainBodySchema = z.object({
  txHash: TxHash,
  chainKey: ChainKey.optional().default("base"),
  contractAddress: EvmAddress.optional(),
});

/** GET /api/leaderboard/stats */
export const LeaderboardStatsQuerySchema = z.object({
  period: z.enum(["7d", "30d", "all"]).optional(),
});

/** POST /api/quests/:questId/complete */
export const QuestParamsSchema = z.object({
  questId: UuidOrCuid,
});

/** POST /api/gm/contracts/deploy */
export const GmDeployBodySchema = z.object({
  chainKey: ChainKey,
  contractAddress: EvmAddress,
  txHash: TxHash,
});

/** GET /api/gm/random  GET /api/gm/has-deployed */
export const ChainQuerySchema = z.object({
  chain: ChainKey.optional(),
});

/** GET /api/gm/random with address */
export const GmRandomQuerySchema = z.object({
  chain: ChainKey.optional(),
  address: z.string().min(1).max(150).optional(),
});

/** GET /api/gm/status-onchain */
export const GmStatusOnchainQuerySchema = z.object({
  chain: ChainKey,
  address: EvmAddress,
});

/** GET /api/gm/contracts/:id/balance */
export const GmContractIdParamsSchema = z.object({
  id: UuidOrCuid,
});

/** GET /api/notifications/stream */
export const NotificationStreamQuerySchema = z.object({
  token: z.string().min(1).max(256).optional(),
  once: z.string().optional(),
});

/** POST /api/notifications/:id/read */
export const NotificationIdParamsSchema = z.object({
  id: UuidOrCuid,
});

// ─── Server ──────────────────────────────────────────────────────────────────

/** GET /api/admin/metrics/history */
export const MetricsHistoryQuerySchema = z.object({
  range: z.enum(["24h", "48h", "7d"]).default("24h"),
});

/** GET /api/scan/async/:jobId */
export const ScanJobParamsSchema = z.object({
  jobId: z.string().min(1).max(128),
});

/** POST /api/admin/scam-override */
export const ScamOverrideBodySchema = z.object({
  symbol: z.string().min(1).max(20),
  action: z.enum(["approve", "block"]),
  contract: z.string().min(1).max(150).optional(),
});

/** GET /api/admin/events */
export const AdminEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  type: z.string().min(1).max(100).optional(),
});

/** GET /api/price/native */
export const NativePriceQuerySchema = z.object({
  chain: z.string().min(1).max(50).optional(),
});

/** POST /api/custom-tokens */
export const CustomTokenAddBodySchema = z.object({
  contract: z.string().min(1).max(150),
  label: z.string().min(1).max(500).optional(),
  chainType: z.enum(["EVM", "SVM", "COSMOS"]).optional().default("EVM"),
});

export const CexProviderSchema = z.enum(["binance", "bitpanda", "bitfinex", "bybit", "coinbase", "okx", "kraken"]);

export const CexAccountBodySchema = z.object({
  provider: CexProviderSchema,
  label: z.string().min(1).max(80).optional(),
  // HMAC/JWT providers: each user supplies their own read-only API credentials. The
  // secret never reaches the browser-rendered response; it is sent to the
  // server-side CEX relay when needed and stored encrypted.
  apiKey: z.string().min(10).max(500).optional(),
  apiSecret: z.string().min(10).max(5000).optional(),
  apiPassphrase: z.string().min(1).max(500).optional(),
}).strict();

export const CexAccountParamsSchema = z.object({
  id: UuidOrCuid,
});

/** DELETE /api/custom-tokens/:id  GET /api/scans/:id */
export const ResourceIdParamsSchema = z.object({
  id: UuidOrCuid,
});

/** GET /api/scans */
export const ScansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
});

/** POST /api/scans/:id/share  DELETE /api/scans/:id/share */
export const ScanShareParamsSchema = z.object({
  id: UuidOrCuid,
});

/** GET /api/public/scans/:shareToken */
export const ShareTokenParamsSchema = z.object({
  shareToken: z.string().min(1).max(256),
});

/** POST /api/scan — top-level shape; address/chains still validated piecewise
 *  by the handler (AnyAddress + validateChains). This schema bounds the body
 *  size (notably customTokens) and rejects malformed JSON shapes early. */
export const ScanRequestBodySchema = z.object({
  address: z.unknown().optional(),
  chains: z.unknown().optional(),
  deepScan: z.boolean().optional(),
  forceRefresh: z.boolean().optional(),
  strictTokens: z.boolean().optional(),
  // customTokens passes through resolveCustomTokens, which already validates
  // each entry. Cap the array to prevent unbounded payloads from blocking the
  // worker on resolution.
  customTokens: z.array(z.unknown()).max(100).optional(),
}).strict();

/** POST /api/scan/batch — multi-wallet scan */
export const BatchScanRequestBodySchema = z.object({
  addresses: z.array(z.unknown()).min(1).max(20),
  chains: z.unknown().optional(),
  deepScan: z.boolean().optional(),
  forceRefresh: z.boolean().optional(),
  strictTokens: z.boolean().optional(),
  customTokens: z.array(z.unknown()).max(100).optional(),
}).strict();

/** POST /api/scans/:id/share */
export const ScanShareBodySchema = z.object({
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .optional(),
});

// ─── Support ─────────────────────────────────────────────────────────────────

/** POST /api/tickets */
export const SupportTicketCreateBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  type: z.enum(["bug", "feature"]).optional().default("bug"),
});

/** GET /api/tickets */
export const TicketsQuerySchema = z.object({
  status: z.string().min(1).max(50).optional(),
});

/** GET /api/tickets/:id  PATCH /api/tickets/:id */
export const TicketIdParamsSchema = z.object({
  id: UuidOrCuid,
});

/** PATCH /api/tickets/:id */
export const SupportTicketUpdateBodySchema = z.object({
  status: z.string().min(1).max(50).optional(),
  response: z.string().min(1).max(2000).optional(),
});
