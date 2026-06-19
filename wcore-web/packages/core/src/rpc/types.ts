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
  readonly endpoint: string;
  readonly rpcCause?: unknown;
  constructor(message: string, endpoint: string, rpcCause?: unknown) {
    super(message);
    this.name = "RpcCallError";
    this.endpoint = endpoint;
    this.rpcCause = rpcCause;
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
