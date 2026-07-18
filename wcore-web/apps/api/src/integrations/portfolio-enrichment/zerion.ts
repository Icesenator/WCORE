import { EvmAddress, SvmAddress } from "@wcore/shared";
import { z } from "zod";
import type { ZerionEnrichmentConfig } from "../../config.js";
import { toWcoreChain } from "./chain-map.js";
import { canonicalProtocol } from "./protocol-aliases.js";
import type {
  NormalizedPositionType,
  NormalizedProviderPosition,
  PortfolioEnrichmentProvider,
  ProviderPortfolioSnapshot,
  ProviderRequestContext,
  ProviderWalletHint,
} from "./types.js";

const ZERION_ORIGIN = "https://api.zerion.io";
const MAX_RETRY_AFTER_MS = 10 * 60 * 1000;
const EVM_CONTRACT = /^0x[a-fA-F0-9]{40}$/;
const requiredJsonValue = z.unknown().refine((value) => value !== undefined);

const resourceIdentifierSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
});

const implementationSchema = z.object({
  chain_id: z.string().min(1),
  address: z.string().min(1),
});

const fungibleInfoSchema = z.object({
  flags: z.object({ verified: z.boolean() }),
  implementations: z.array(implementationSchema),
});

const protocolMetadataSchema = z.object({
  protocol_module: z.string().min(1),
  liquidity: z.enum(["liquid", "locked", "claimable", "unknown"]),
  pool_address: z.string().nullable(),
  receipt_contract: z.string().nullable(),
  underlying_contract: z.string().nullable(),
});

const positionSchema = z.object({
  type: z.literal("positions"),
  id: z.string().min(1),
  attributes: z.object({
    position_type: z.string().min(1),
    quantity: z.object({ float: requiredJsonValue }),
    price: requiredJsonValue,
    value: requiredJsonValue,
    flags: z.object({
      displayable: z.boolean(),
      is_trash: z.boolean(),
    }),
    fungible_info: fungibleInfoSchema.nullable(),
    protocol_metadata: protocolMetadataSchema.nullable(),
    group_id: z.string().min(1).nullable(),
  }),
  relationships: z.object({
    chain: z.object({ data: resourceIdentifierSchema }),
    dapp: z.object({ data: resourceIdentifierSchema.nullable() }),
  }),
});

const envelopeSchema = z.object({
  links: z.object({
    self: z.string(),
    next: z.string().nullable(),
    prev: z.string().nullable(),
  }),
  meta: z.object({ total: z.number().int().nonnegative() }),
  data: z.array(positionSchema),
});

const untrackedSchema = z.object({
  errors: z.array(z.object({
    title: z.literal("Wallet not found"),
    detail: z.literal("The requested wallet is not tracked"),
  })).length(1),
});

type ZerionPosition = z.infer<typeof positionSchema>;

export type ZerionErrorKind =
  | "network"
  | "timeout"
  | "oversize"
  | "malformed"
  | "malformed-request"
  | "auth"
  | "rate"
  | "server"
  | "untracked-candidate"
  | "http";

export class ZerionProviderError extends Error {
  readonly kind: ZerionErrorKind;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(kind: ZerionErrorKind, status?: number, retryAfterMs?: number) {
    super(`Zerion provider failure: ${kind}`);
    this.name = "ZerionProviderError";
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface CreateZerionProviderOptions
  extends Pick<ZerionEnrichmentConfig, "apiKey" | "timeoutMs" | "maxResponseBytes" | "maxPositions"> {
  apiKey: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

function isSupportedAddress(address: string): boolean {
  return EvmAddress.safeParse(address).success || SvmAddress.safeParse(address).success;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function validContract(chain: string, value: string): string | undefined {
  if (chain === "SOLANA") return SvmAddress.safeParse(value).success ? value : undefined;
  return EVM_CONTRACT.test(value) ? value.toLowerCase() : undefined;
}

function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : Date.parse(value) - now;
  if (!Number.isFinite(delay) || delay < 0) return undefined;
  return Math.min(Math.round(delay), MAX_RETRY_AFTER_MS);
}

async function readBoundedBody(
  response: Response,
  maxResponseBytes: number,
  abortController: AbortController,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
      abortController.abort();
      await response.body?.cancel().catch(() => undefined);
      throw new ZerionProviderError("oversize");
    }
  }

  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxResponseBytes) {
      abortController.abort();
      await reader.cancel().catch(() => undefined);
      throw new ZerionProviderError("oversize");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function parseJson(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new ZerionProviderError("malformed");
  }
}

function getPositionContract(position: ZerionPosition, chain: string): string | undefined {
  const implementation = position.attributes.fungible_info?.implementations.find(
    (candidate) => candidate.chain_id.trim().toLowerCase() === position.relationships.chain.data.id.trim().toLowerCase(),
  );
  return implementation ? validContract(chain, implementation.address) : undefined;
}

function getComplexType(position: ZerionPosition): NormalizedPositionType | undefined {
  const module = position.attributes.protocol_metadata?.protocol_module.toLowerCase();
  switch (position.attributes.position_type) {
    case "deposit":
      if (module === "lending") return "collateral";
      if (module === "vault") return "vault_share";
      return "unknown_defi";
    case "loan": return "lending_debt";
    case "locked": return "staking_locked";
    case "staked":
      return position.attributes.protocol_metadata?.liquidity === "liquid"
        ? "staking_liquid"
        : "staking_locked";
    case "reward": return "claimable";
    case "investment":
      if (module === "rwa") return "real_world_asset";
      if (module === "vault") return "vault_share";
      return "unknown_defi";
    default: return undefined;
  }
}

function hasInvalidLpComponent(position: ZerionPosition, chain: string | undefined): boolean {
  if (position.attributes.protocol_metadata?.protocol_module.toLowerCase() !== "liquidity_pool") return false;
  const fungible = position.attributes.fungible_info;
  return !chain || !fungible?.flags.verified || !getPositionContract(position, chain);
}

function adaptPosition(position: ZerionPosition): {
  hint?: ProviderWalletHint;
  normalized?: NormalizedProviderPosition;
} {
  const attributes = position.attributes;
  if (!attributes.flags.displayable || attributes.flags.is_trash) return {};

  const chain = toWcoreChain(position.relationships.chain.data.id);
  if (!chain) return {};
  const quantity = finiteNumber(attributes.quantity.float);
  const value = finiteNumber(attributes.value);
  const price = attributes.price === null ? null : finiteNumber(attributes.price);
  if (quantity === undefined || quantity < 0 || value === undefined || value < 0
    || price === undefined || (price !== null && price < 0)) return {};

  const fungible = attributes.fungible_info;
  const contract = getPositionContract(position, chain);
  if (attributes.position_type === "wallet") {
    if (!fungible?.flags.verified || !contract) return {};
    return { hint: { chain, contract } };
  }

  if (chain === "SOLANA") return {};
  if (fungible && (!fungible.flags.verified || !contract)) return {};
  const metadata = attributes.protocol_metadata;
  const dappId = position.relationships.dapp.data?.id;
  const type = getComplexType(position);
  if (!metadata || !dappId || !type) return {};
  const protocol = canonicalProtocol("zerion", dappId);
  if (!protocol) return {};

  const poolAddress = metadata.pool_address === null
    ? undefined
    : validContract(chain, metadata.pool_address);
  const receiptContract = metadata.receipt_contract === null
    ? undefined
    : validContract(chain, metadata.receipt_contract);
  const underlyingContract = metadata.underlying_contract === null
    ? undefined
    : validContract(chain, metadata.underlying_contract);
  if ((metadata.pool_address && !poolAddress)
    || (metadata.receipt_contract && !receiptContract)
    || (metadata.underlying_contract && !underlyingContract)) return {};

  const sign = attributes.position_type === "loan" ? -1 : 1;
  return {
    normalized: {
      provider: "zerion",
      chain,
      protocol,
      type,
      ...(contract ? { contract } : {}),
      ...(underlyingContract ? { underlyingContract } : {}),
      ...(receiptContract ? { receiptContract } : {}),
      ...(poolAddress ? { poolAddress } : {}),
      positionId: position.id,
      ...(attributes.group_id ? { groupId: attributes.group_id } : {}),
      balance: Math.abs(quantity) * sign,
      priceEur: price,
      valueEur: Math.abs(value) * sign,
      liquidity: metadata.liquidity,
      providerVerified: true,
    },
  };
}

function adaptEnvelope(
  parsed: z.infer<typeof envelopeSchema>,
  context: ProviderRequestContext,
  observedAt: string,
): ProviderPortfolioSnapshot {
  const invalidLpGroups = new Set<string>();
  for (const position of parsed.data) {
    const groupId = position.attributes.group_id;
    if (groupId && hasInvalidLpComponent(position, toWcoreChain(position.relationships.chain.data.id))) {
      invalidLpGroups.add(groupId);
    }
  }

  const walletHints: ProviderWalletHint[] = [];
  const positions: NormalizedProviderPosition[] = [];
  for (const position of parsed.data) {
    if (position.attributes.group_id && invalidLpGroups.has(position.attributes.group_id)) continue;
    const adapted = adaptPosition(position);
    if (adapted.hint) walletHints.push(adapted.hint);
    if (adapted.normalized) positions.push(adapted.normalized);
  }
  if (positions.length > context.maxPositions) throw new ZerionProviderError("oversize");

  return {
    provider: "zerion",
    walletHints,
    positions,
    derivedPositionValueEur: positions.reduce((sum, position) => sum + position.valueEur, 0),
    observedAt,
    diagnostics: {
      status: "ok",
      rawCount: parsed.data.length,
      normalizedCount: positions.length,
      walletHintCount: walletHints.length,
      droppedCount: parsed.data.length - positions.length - walletHints.length,
    },
  };
}

export function createZerionProvider(options: CreateZerionProviderOptions): PortfolioEnrichmentProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  return {
    id: "zerion",
    capabilities: {
      requestScope: "wallet",
      purposes: ["complex-positions", "wallet-hints", "diagnostics"],
      maxRequests: 1,
    },
    supports: isSupportedAddress,
    async load(context): Promise<ProviderPortfolioSnapshot> {
      if (!isSupportedAddress(context.address)) throw new ZerionProviderError("malformed-request");

      const abortController = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        abortController.abort();
      }, options.timeoutMs);

      try {
        const url = new URL(`/v1/wallets/${encodeURIComponent(context.address)}/positions/`, ZERION_ORIGIN);
        url.searchParams.set("filter[positions]", "no_filter");
        url.searchParams.set("currency", "eur");
        url.searchParams.set("filter[trash]", "only_non_trash");
        const response = await fetchImpl(url, {
          method: "GET",
          headers: { authorization: `Basic ${Buffer.from(`${options.apiKey}:`).toString("base64")}` },
          signal: abortController.signal,
        });

        if (response.status === 400) {
          const parsed = parseJson(await readBoundedBody(response, options.maxResponseBytes, abortController));
          if (untrackedSchema.safeParse(parsed).success) {
            throw new ZerionProviderError("untracked-candidate", 400);
          }
          throw new ZerionProviderError("malformed-request", 400);
        }
        if (!response.ok) {
          const status = response.status;
          const retryAfterMs = status === 429 || status === 503
            ? parseRetryAfter(response.headers.get("retry-after"), now())
            : undefined;
          if (status === 401 || status === 403) throw new ZerionProviderError("auth", status);
          if (status === 429) throw new ZerionProviderError("rate", status, retryAfterMs);
          if (status >= 500) throw new ZerionProviderError("server", status, retryAfterMs);
          throw new ZerionProviderError("http", status);
        }

        const body = await readBoundedBody(response, options.maxResponseBytes, abortController);
        const result = envelopeSchema.safeParse(parseJson(body));
        if (!result.success) throw new ZerionProviderError("malformed");
        if (result.data.data.length > options.maxPositions) throw new ZerionProviderError("oversize");
        return adaptEnvelope(result.data, context, new Date(now()).toISOString());
      } catch (error) {
        if (error instanceof ZerionProviderError) throw error;
        if (timedOut || abortController.signal.aborted) throw new ZerionProviderError("timeout");
        throw new ZerionProviderError("network");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
