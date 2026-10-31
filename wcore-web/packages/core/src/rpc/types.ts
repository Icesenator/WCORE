export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown[];
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result: T;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

export function isJsonRpcSuccess<T>(r: JsonRpcResponse<T>): r is JsonRpcSuccess<T> {
  return "result" in r;
}

export class RpcCallError extends Error {
  declare readonly endpoint: string;
  declare readonly rpcCause?: unknown;
  constructor(message: string, endpoint: string, rpcCause?: unknown) {
    // Provider/transport messages can echo a key independently of the URL.
    super(/revert/i.test(message) ? "RPC execution reverted"
      : /^HTTP \d{3}$/.test(message) ? message
      : /^RPC error -?\d+/.test(message) ? message.match(/^RPC error -?\d+/)![0]
      : "RPC request failed");
    this.name = "RpcCallError";
    // Non-enumerable: a logged or serialized error must not carry a keyed provider URL.
    Object.defineProperty(this, "endpoint", { value: endpoint, enumerable: false });
    Object.defineProperty(this, "rpcCause", { value: rpcCause, enumerable: false });
  }
}

export interface RpcEndpointScore {
  success: number;
  failure: number;
  lastSeen: number;
  score: number;
}

export interface ChainRpcHealth {
  endpoints: Map<string, RpcEndpointScore>;
  updatedAt: number;
}
