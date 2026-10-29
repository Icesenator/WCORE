import type { QuoteRequest } from "./registry.js";

/** Sérialisation stricte, sans toJSON ni pertes silencieuses de JSON.stringify. */
function canonical(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== "object" || value === null || ancestors.has(value)) throw new TypeError("INVALID_REQUEST_JSON");
  const array = Array.isArray(value);
  if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("INVALID_REQUEST_JSON");
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError("INVALID_REQUEST_JSON");
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === "length") continue;
      if (!descriptor.enumerable || !("value" in descriptor)) throw new TypeError("INVALID_REQUEST_JSON");
    }
    if (array) {
      if (Object.keys(value).length !== value.length || Object.keys(value).some((key, i) => key !== String(i))) throw new TypeError("INVALID_REQUEST_JSON");
      return `[${value.map(item => canonical(item, ancestors)).join(",")}]`;
    }
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(descriptors[key]!.value, ancestors)}`).join(",")}}`;
  } finally { ancestors.delete(value); }
}

export function canonicalRequest(request: QuoteRequest): string {
  const fields = ["fromChainId", "toChainId", "fromAsset", "toAsset", "amountInRaw", "maxSlippageBps", "minAmountOutRaw", "route", "preferences", "feePolicy", "providerParams"];
  if (!request || typeof request !== "object" || Object.getPrototypeOf(request) !== Object.prototype
    || Reflect.ownKeys(request).length !== fields.length
    || fields.some(key => !Object.hasOwn(request, key))) throw new TypeError("INVALID_REQUEST");
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(request))) {
    if (!("value" in descriptor) || !descriptor.enumerable) throw new TypeError("INVALID_REQUEST");
  }
  if (![request.fromChainId, request.toChainId].every(n => Number.isSafeInteger(n) && n > 0)
    || ![request.fromAsset, request.toAsset].every(s => typeof s === "string" && s.trim().length > 0)
    || typeof request.amountInRaw !== "bigint" || request.amountInRaw <= 0n
    || typeof request.minAmountOutRaw !== "bigint" || request.minAmountOutRaw < 0n
    || !Number.isInteger(request.maxSlippageBps) || request.maxSlippageBps < 0 || request.maxSlippageBps > 10000
    || !["INCLUDED", "ADDITIONAL"].includes(request.feePolicy)) throw new TypeError("INVALID_REQUEST");
  for (const object of [request.route, request.preferences, request.providerParams]) {
    if (!object || typeof object !== "object" || Array.isArray(object)) throw new TypeError("INVALID_REQUEST");
    canonical(object);
  }
  const route = request.route;
  if (Object.keys(route).some(key => !["routeId", "maxSteps", "path"].includes(key))
    || (route.routeId !== undefined && (typeof route.routeId !== "string" || !route.routeId.trim()))
    || (route.maxSteps !== undefined && (!Number.isSafeInteger(route.maxSteps) || route.maxSteps <= 0))
    || (route.path !== undefined && (!Array.isArray(route.path) || !route.path.length || route.path.some(s => typeof s !== "string" || !s.trim())))) throw new TypeError("INVALID_REQUEST");
  return canonical({ ...request, amountInRaw: request.amountInRaw.toString(), minAmountOutRaw: request.minAmountOutRaw.toString() });
}

/** Copie locale de l'identité validée, indépendante des mutations de l'appelant. */
export function snapshotRequest(request: QuoteRequest): QuoteRequest {
  const parsed = JSON.parse(canonicalRequest(request));
  return { ...parsed, amountInRaw: BigInt(parsed.amountInRaw), minAmountOutRaw: BigInt(parsed.minAmountOutRaw) };
}
