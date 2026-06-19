# RPC Batch Size Limits — Known Chain Restrictions

## Problem

Some EVM chains reject JSON-RPC batch requests exceeding a certain size. When `_scanBatch` sends balanceOf + decimals + symbol + name for multiple tokens in a single batch, the RPC returns an error object instead of an array response → `parsed` is not an array → `rpcSuccess = false` → **zero tokens scanned** (`scn:0` in INFO_ROT).

## Affected Chains

| Chain | Max Batch Size | Error Message | Fix |
|-------|---------------|---------------|-----|
| **OPTIMISM** | 10 | "To send batches over 10 items, consider using a dedicated API provider" | `RPC.MAX_BATCH_SIZE: 10` |
| **UNICHAIN** | 10 | Same as Optimism (OP-stack) | `RPC.MAX_BATCH_SIZE: 10` |
| TEMPO | 3 | (provider-specific) | `RPC.MAX_BATCH_SIZE: 3` |

## How It Works

When `config.RPC.MAX_BATCH_SIZE` is set and > 0, `_scanBatch` (09_SIMPLE_ROTATION.gs:984-985) uses `RpcClient.batchCallChunked()` to split large batches into chunks that stay under the limit.

## Testing

Tested 2026-05-17 with 20-item batch requests:

- **Limited**: Optimism (10), Unichain (10)
- **OK (>=20)**: Zora, Mode, Blast, Metal L2, Fraxtal, Worldchain, Lisk, Redstone, Shape, Superseed, Ink, Polygon zkEVM, Abstract, Rari, Ancient8, BOB, Cyber, Duckchain, Openledger, Plume
- **DNS timeout (not batch limit)**: Base, Swan, Camp, Zircuit — these failed at DNS level, not batch rejection

## Future Chains to Watch

Any new OP-stack chain or chain using the same RPC infrastructure as Optimism may inherit the 10-item limit. If a new chain shows `scn:0` with `cov:N/N` (tokens covered but not scanned), suspect a batch size limit.

## Fix Pattern

```javascript
var _CHAIN = ChainFactory.createEvmChain("CHAIN", {
  CACHE_VERSION: N,
  RPC: {
    ENDPOINTS: ["..."],
    MAX_BATCH_SIZE: 10  // <-- Add this
  },
  // ...
});
```
