# Robinhood Chain Design

## Goal
Add Robinhood Chain mainnet to WCORE in the same layered way as the existing EVM chains, including Google Sheets chain functions, generated chain package data, and `/dev/deploy` wallet-add metadata.

## Validated Network Data
- Chain: Robinhood Chain
- Chain ID: `4663` (`0x1237`)
- RPC: `https://rpc.mainnet.chain.robinhood.com`
- Native currency: ETH, 18 decimals
- Explorer: `https://robinhoodchain.blockscout.com`
- Sources: Chainlist `https://chainlist.org/chain/4663`, live RPC calls `eth_chainId`, `net_version`, `eth_blockNumber`

## Design
Use `wcore-gsheet/src/*.gs` as the canonical chain source. Add `ROBINHOOD_CHAIN.gs` with the standard `ChainFactory.createEvmChain` pattern and standard exported GAS functions/diagnostics.

Regenerate `wcore-gsheet/dist/chains` so `@wcore/chains` and web core pick up the new chain without introducing a local RPC map.

Expose the chain on `/dev/deploy` by adding `ROBINHOOD_CHAIN` to `DEPLOY_CHAIN_KEYS` and `CHAIN_META`, then regenerating `apps/web/app/dev/deploy/chain-data.ts` from core chain data. Add the explorer entry in `apps/web/lib/explorers.ts` so deployed contracts and future GM links resolve to Blockscout.

Do not add `DEX_SLUG` or `GT_NETWORK` until those pricing slugs are validated against live APIs. Native ETH pricing uses `coingecko:ethereum` / `ethereum`.

## Verification
- `npm run validate:static` in `wcore-gsheet`
- `npm run build:chains` in `wcore-gsheet`
- `npm run test:phase3-chains` in `wcore-gsheet`
- targeted web tests for chain config and deploy chain params
