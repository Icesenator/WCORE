import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildPortfolioCsv } from "../lib/csv-export";

describe("CSV export formatter", () => {
  test("builds a flat enriched CSV with native and token asset rows", () => {
    const csv = buildPortfolioCsv([
      {
        address: "0xabc",
        label: "Main Wallet",
        totalEur: 124,
        chains: [
          {
            chainKey: "BASE",
            chainName: "Base",
            vm: "EVM",
            native: {
              contract: "native",
              symbol: "ETH",
              name: "Ether",
              decimals: 18,
              balance: 0.1,
              priceEur: 3000,
              priceSource: "pricing-cascade",
              valueEur: 300,
              flags: [],
            },
            tokens: [
              {
                contract: "0xusdc",
                symbol: "USDC",
                name: "USD, Coin",
                decimals: 6,
                balance: 12.5,
                priceEur: 0.92,
                priceSource: "pricing-cascade",
                valueEur: 11.5,
                flags: ["verified", "stable"],
              },
            ],
            totals: { valueEur: 311.5, tokenCount: 1, pricedCount: 1 },
            errors: [],
            degraded: false,
            fxRate: 0.92,
            scanMs: 42,
            cachedAt: null,
            scriptVersion: "test",
          },
        ],
      },
    ], { generatedAt: new Date("2026-05-07T12:00:00.000Z") });

    const lines = csv.split("\n");
    assert.equal(lines[0], "wallet_address,wallet_label,chain_key,chain_name,vm,asset_type,symbol,name,contract,balance,price_eur,value_eur,flags");
    assert.equal(lines[1], "0xabc,Main Wallet,BASE,Base,EVM,native,ETH,Ether,native,0.1,3000,300,");
    assert.equal(lines[2], "0xabc,Main Wallet,BASE,Base,EVM,token,USDC,\"USD, Coin\",0xusdc,12.5,0.92,11.5,verified|stable");
  });

  test("escapes quotes and keeps missing prices empty", () => {
    const csv = buildPortfolioCsv([
      {
        address: "0xdef",
        label: "Vault \"A\"",
        totalEur: 0,
        chains: [
          {
            chainKey: "ETHEREUM",
            chainName: "Ethereum",
            vm: "EVM",
            native: null,
            tokens: [
              {
                contract: "0xtoken",
                symbol: "TKN",
                name: "Token \"Quoted\"",
                decimals: 18,
                balance: 1,
                priceEur: null,
                priceSource: null,
                valueEur: null,
                flags: [],
              },
            ],
            totals: { valueEur: 0, tokenCount: 1, pricedCount: 0 },
            errors: [],
            degraded: true,
            fxRate: 0.92,
            scanMs: 42,
            cachedAt: null,
            scriptVersion: "test",
          },
        ],
      },
    ]);

    assert.match(csv, /0xdef,"Vault ""A""",ETHEREUM,Ethereum,EVM,token,TKN,"Token ""Quoted""",0xtoken,1,,,/);
  });

  test("neutralizes formula-leading CSV cells and tolerates missing legacy flags", () => {
    const csv = buildPortfolioCsv([
      {
        address: "0xghi",
        label: "=IMPORTXML()",
        totalEur: 1,
        chains: [
          {
            chainKey: "BASE",
            chainName: "Base",
            vm: "EVM",
            native: null,
            tokens: [
              {
                contract: "0xlegacy",
                symbol: "+TKN",
                name: "@metadata",
                decimals: 18,
                balance: 1,
                priceEur: 1,
                priceSource: "pricing-cascade",
                valueEur: 1,
              } as any,
            ],
            totals: { valueEur: 1, tokenCount: 1, pricedCount: 1 },
            errors: [],
            degraded: false,
            fxRate: 0.92,
            scanMs: 42,
            cachedAt: null,
            scriptVersion: "legacy",
          },
        ],
      },
    ]);

    assert.match(csv, /0xghi,'=IMPORTXML\(\),BASE,Base,EVM,token,'\+TKN,'@metadata,0xlegacy,1,1,1,$/);
  });
});
