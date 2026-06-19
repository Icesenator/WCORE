// RpcClient — JSON-RPC 2.0 client for EVM and SVM endpoints.
// Mirrors the WCORE Apps Script client: timeouts via AbortSignal (Node fetch
// honors them, unlike GAS UrlFetchApp), batch payloads, single-call helpers.

import {
  isJsonRpcSuccess,
  RpcCallError,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./types.js";

export interface RpcCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class RpcClient {
  private idCounter = 1;
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly defaultTimeoutMs = 2500,
  ) {}

  private nextId() {
    return this.idCounter++;
  }

  async call<T>(
    endpoint: string,
    method: string,
    params: unknown[] = [],
    opts: RpcCallOptions = {},
  ): Promise<T> {
    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.nextId(),
      method,
      params,
    };
    const responses = await this.send(endpoint, req, opts);
    const body = (Array.isArray(responses) ? responses[0] : responses) as
      | JsonRpcResponse<T>
      | undefined;
    if (!body) throw new RpcCallError("empty response", endpoint);
    if (isJsonRpcSuccess<T>(body)) return body.result;
    throw new RpcCallError(
      `RPC error ${body.error.code}: ${body.error.message}`,
      endpoint,
      body.error,
    );
  }

  async batch<T = unknown>(
    endpoint: string,
    calls: Array<{ method: string; params?: unknown[] }>,
    opts: RpcCallOptions = {},
  ): Promise<JsonRpcResponse<T>[]> {
    if (calls.length === 0) return [];
    const reqs: JsonRpcRequest[] = calls.map((c) => ({
      jsonrpc: "2.0",
      id: this.nextId(),
      method: c.method,
      params: c.params ?? [],
    }));
    const result = await this.send(endpoint, reqs, opts);
    if (!Array.isArray(result)) {
      throw new RpcCallError("expected array response for batch", endpoint);
    }
    return result as JsonRpcResponse<T>[];
  }

  private async send(
    endpoint: string,
    payload: JsonRpcRequest | JsonRpcRequest[],
    opts: RpcCallOptions,
  ): Promise<JsonRpcResponse | JsonRpcResponse[]> {
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
    try {
      const res = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new RpcCallError(`HTTP ${res.status}`, endpoint);
      }
      return (await res.json()) as JsonRpcResponse | JsonRpcResponse[];
    } catch (err) {
      if (err instanceof RpcCallError) throw err;
      throw new RpcCallError((err as Error).message ?? "fetch failed", endpoint, err);
    } finally {
      clearTimeout(timer);
    }
  }
}

// EVM helpers — wrap common methods with type-safe signatures.
export class EvmRpc extends RpcClient {
  async chainId(endpoint: string, opts?: RpcCallOptions): Promise<number> {
    const hex = await this.call<string>(endpoint, "eth_chainId", [], opts);
    return Number.parseInt(hex, 16);
  }

  async blockNumber(endpoint: string, opts?: RpcCallOptions): Promise<number> {
    const hex = await this.call<string>(endpoint, "eth_blockNumber", [], opts);
    return Number.parseInt(hex, 16);
  }

  async getBalance(
    endpoint: string,
    address: string,
    block: string = "latest",
    opts?: RpcCallOptions,
  ): Promise<bigint> {
    const hex = await this.call<string>(
      endpoint,
      "eth_getBalance",
      [address, block],
      opts,
    );
    return BigInt(hex);
  }

  async getTransactionCount(
    endpoint: string,
    address: string,
    block: string = "latest",
    opts?: RpcCallOptions,
  ): Promise<number> {
    const hex = await this.call<string>(
      endpoint,
      "eth_getTransactionCount",
      [address, block],
      opts,
    );
    return Number.parseInt(hex, 16);
  }

  async ethCall(
    endpoint: string,
    to: string,
    data: string,
    block: string = "latest",
    opts?: RpcCallOptions,
  ): Promise<string> {
    return this.call<string>(endpoint, "eth_call", [{ to, data }, block], opts);
  }
}
