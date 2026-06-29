# DeFi Position Engine v1 Design

Date: 2026-06-29

## Goal

Create a first internal DeFi position layer for WCORE while keeping the current Google Sheets output format mostly unchanged.

The immediate driver is the recent addition of real DeFi-like positions already visible in the portfolio:

- Compound V3 collateral and debt on Optimism.
- WCT locked and claimable positions on Optimism.
- Chainbase locked and claimable positions on Base.
- Staked/mirrored variants such as SDAYS, SSWEET, sKAITO, lSTONE, rSTONE, stETH, frxETH.
- Aave-like and RealT RMM positions such as AWETH, armmv3RTW-USD-01, and variableDebtrmmv3WXDAI.

The v1 objective is not to redesign the visible portfolio table. It is to stop treating every DeFi position as a normal token internally, so future protocol coverage can grow without repeating one-off patches across API, cache, output, and Apps Script.

## Non-Goals

- Do not add new Sheet columns in v1.
- Do not add `INFO_DEBT` or `INFO_GROSS_ASSETS` in v1.
- Do not change the user-facing Sheet table shape.
- Do not attempt full automatic DeFi discovery for every protocol in v1.
- Do not migrate unrelated token/pricing/scam behavior.

## Current Output Compatibility

The Sheet output remains:

```text
chain_name | token_ticker | token_name | contract_address | balance | price_eur | value_eur
```

`INFO_TOTAL` remains net value and continues to include negative values from debt positions.

The only intended visible change is adding a liquidity suffix to `token_name` for known DeFi positions:

- `[Flex]`: position is recoverable now or repayable/claimable now.
- `[Lock]`: position is currently not recoverable because it is locked, vested, delegated, unbonding, or in cooldown.
- `[Unknown]`: the position is DeFi-like, but WCORE cannot confidently determine recoverability yet.

Examples:

- `Compound V3 cWETHv3 Borrowed [Flex]`
- `Compound V3 cWETHv3 Collateral [Flex]`
- `WCT Stake Weight [Lock]`
- `WCT Staking Reward Distributor [Flex]`
- `Chainbase Staking (locked) [Lock]`
- `Chainbase Airdrop (claimable) [Flex]`
- `RealT RMM V3 Variable Debt WXDAI [Flex]`
- `RealT RMM V3 RTW-USD-01 [Unknown]` if withdrawability cannot be validated safely.

Regular wallet tokens keep their current names and do not receive a suffix.

## Position Model

Introduce a normalized internal `PortfolioPosition` shape.

```ts
type PositionType =
  | "wallet_token"
  | "staking_locked"
  | "claimable"
  | "lending_collateral"
  | "lending_debt"
  | "vault_share"
  | "liquid_staking"
  | "real_world_asset"
  | "unknown_defi";

type LiquidityStatus = "flex" | "lock" | "unknown";

interface PortfolioPosition {
  id: string;
  chain: string;
  protocol?: string;
  type: PositionType;
  label: string;
  name: string;
  contract: string;
  underlying?: string;
  balance: number;
  decimals: number;
  priceEur: number | null;
  valueEur: number | null;
  liquidityStatus?: LiquidityStatus;
  source: "registry" | "discovery" | "registry+rpc" | "api" | "cache";
  confidence: "high" | "medium" | "low";
}
```

Rules:

- `wallet_token` is the default for normal ERC-20/native assets and has no `liquidityStatus` suffix.
- DeFi positions should always set `liquidityStatus` explicitly.
- Debt positions use negative `balance` and negative `valueEur` when displayed.
- Unknown DeFi positions may be shown only when confidence is high enough to avoid obvious false positives.

## Registry And Discovery Hybrid

Use both registry-driven and discovery-driven approaches.

### Registry-Driven

Add a `DEFI_POSITION_REGISTRY` for known positions and protocol-specific read definitions.

Registry entries describe how to read, price, sign, and label positions.

Example shape:

```ts
interface DeFiPositionRegistryEntry {
  chain: string;
  protocol: string;
  type: PositionType;
  label: string;
  name: string;
  contract: string;
  underlying?: string;
  liquidityStatus: LiquidityStatus;
  balanceCall?: {
    selector: string;
    args: Array<"wallet" | "underlying" | string>;
    decode: "uint256_first_word" | "uint256";
  };
  pricing?: {
    mode: "mirror_underlying" | "mirror_native" | "direct" | "none";
    sign?: "asset" | "debt";
  };
}
```

### Discovery-Driven

Add protocol adapters that can discover likely positions for a wallet, then enrich them using the registry where possible.

V1 discovery should be conservative:

- Discover only protocol families already observed in the portfolio.
- Prefer high-confidence RPC reads over broad heuristics.
- Use registry definitions to interpret discovered positions.
- Keep low-confidence discoveries out of the output until they can be validated.

## V1 Adapters

### Compound V3

Observed on `Ledger - Optimism`.

Positions:

- `Comp WETH Borrow`: `lending_debt`, `[Flex]`, negative value.
- `Comp wrsETH`: `lending_collateral`, `[Flex]` for v1 unless health-factor withdrawability is added later.

Reads:

- `borrowBalanceOf(address)` for debt.
- `collateralBalanceOf(address,address)` for collateral.

Pricing:

- Debt mirrors native ETH/WETH price with negative sign.
- Collateral mirrors underlying/native ETH-equivalent price for wrsETH until direct pricing is available.

### WCT Staking

Observed on `Ledger - Optimism`.

Positions:

- `WCT Stake`: `staking_locked`, `[Lock]`.
- `WCT Claimable`: `claimable`, `[Flex]`.

Pricing:

- Mirror WCT price from the same scan.

### Chainbase Staking And Airdrop

Observed on `Ledger - Base`.

Positions:

- `C-Locked`: `staking_locked`, `[Lock]`.
- `C-Airdrop`: `claimable`, `[Flex]`.

Reads:

- Locked via `getDelegationAmount(address)` RPC call.
- Claimable from Chainbase airdrop config until an on-chain/API source is available.

Pricing:

- Mirror C token price from the same scan.

### Staked And Mirrored Variants

Observed on Base, Ethereum, Scroll, Fraxtal, and other chains.

Examples:

- `SDAYS`, `SSWEET`, `sKAITO`
- `lSTONE`, `rSTONE`
- `stETH`, `frxETH`, `UNIETH`, `rSWELL`

Types:

- `liquid_staking` when directly redeemable or liquid.
- `vault_share` when it represents a vault receipt/share.
- `unknown_defi` when semantics are unclear.

Liquidity:

- `[Flex]` for liquid staking or normal transferable receipt tokens.
- `[Unknown]` when recoverability depends on an adapter that does not exist yet.

Pricing:

- Prefer direct pricing when available.
- Use mirror pricing only through registry definitions, not ad-hoc post-scan maps.

### RealT RMM / Aave-Like Positions

Observed on `Ledger - Gnosis`.

Positions:

- `armmv3RTW-USD-01`: likely supplied/collateral position.
- `variableDebtrmmv3WXDAI`: debt position.

V1 behavior:

- Classify `variableDebt*` tokens as `lending_debt`, `[Flex]`, negative value if WCORE confirms debt balance semantics.
- Classify `armm*`/receipt supplied tokens as `lending_collateral` or `vault_share`, `[Unknown]` unless withdrawability is confirmed.

Pricing:

- Prefer direct pricing if available.
- Mirror underlying stable/xDAI only when the registry identifies the underlying safely.

## Output Mapping

All `PortfolioPosition` rows map back to current Sheet rows.

```ts
function positionToSheetRow(position: PortfolioPosition): SheetAssetRow {
  return {
    token_ticker: position.label,
    token_name: withLiquiditySuffix(position.name, position),
    contract_address: position.contract,
    balance: position.balance,
    price_eur: position.priceEur,
    value_eur: position.valueEur,
  };
}
```

Suffix rules:

- No suffix for `wallet_token`.
- `[Flex]` for `liquidityStatus === "flex"`.
- `[Lock]` for `liquidityStatus === "lock"`.
- `[Unknown]` for `liquidityStatus === "unknown"` when the row is DeFi-like.
- Do not duplicate suffixes if a cached name already contains one.

## Totals And Cache Rules

V1 keeps the current net total behavior.

Rules:

- Preserve all non-zero balances, including negative balances.
- Preserve all finite `valueEur`, including negative values and zero.
- `INFO_TOTAL` is `sum(valueEur)` for all visible asset/position rows.
- Do not use positive-only filters for DeFi totals.
- Cache compaction must keep negative positions.
- Reconstructed cache output must derive `valueEur` from `balance * priceEur` when safe.

## Risk Controls

- Unknown DeFi positions should default to hidden unless confidence is high.
- Debt positions must only be negative when the registry or adapter explicitly marks them as debt.
- Mirror pricing must require an explicit registry rule.
- Discovery adapters must not infer debt from token name alone unless backed by known token patterns and contracts.
- Real-world asset and lending receipt tokens should avoid fallback pricing that can inflate totals through illiquid pools.

## Migration Plan

1. Add the internal `PortfolioPosition` type and output mapping with no behavior change for normal tokens.
2. Move existing custom-selector entries for Compound and WCT into `DEFI_POSITION_REGISTRY` while preserving their current visible rows.
3. Move Chainbase locked/claimable logic behind a Chainbase DeFi adapter while preserving the current visible rows.
4. Replace `STAKED_PRICE_MIRRORS` with registry-driven mirror pricing for the already-known mirrored variants.
5. Add suffix rendering for known DeFi positions in `token_name`.
6. Add tests for negative debt preservation, Flex/Lock suffixes, mirror pricing, and unchanged Sheet columns.
7. After v1 stabilizes, add broader discovery adapters for Aave/Morpho/RealT RMM and decide whether to expose `INFO_DEBT` and `INFO_GROSS_ASSETS`.

## Testing Requirements

Minimum tests:

- Compound borrow remains negative and contributes negatively to `INFO_TOTAL`.
- Compound collateral remains positive and receives `[Flex]`.
- WCT Stake receives `[Lock]`; WCT Claimable receives `[Flex]`.
- Chainbase locked receives `[Lock]`; Chainbase claimable receives `[Flex]`.
- Existing regular tokens do not receive suffixes.
- Sheet output still has exactly the current seven columns.
- Cache deflate/inflate preserves negative positions and suffix-bearing names.
- Mirror pricing cannot run unless a registry rule exists.

## Open Later

- Add visible `INFO_DEBT` and `INFO_GROSS_ASSETS` once formulas are ready.
- Add a dedicated `position_liquidity` column if parsing `token_name` becomes fragile.
- Add health-factor-aware withdrawability for Compound/Aave collateral.
- Add unbonding/cooldown timestamps for staking protocols.
- Add broader protocol discovery for Aave, Morpho, Pendle, Curve, Uniswap LPs, and vault aggregators.
