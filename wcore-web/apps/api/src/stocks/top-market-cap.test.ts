import assert from "node:assert/strict";
import test from "node:test";
import {
  getBitpandaAliases,
  getBitpandaSecurity,
  mapTopMarketCapTicker,
  normalizeSupply,
} from "./mappings.js";
import { parseTopMarketCapCsv } from "./top-market-cap.js";

test("maps CompaniesMarketCap exchange suffixes and explicit overrides", () => {
  assert.deepEqual(mapTopMarketCapTicker("000660.KS"), {
    canonicalTicker: "KRX:000660",
    yahooTickers: ["000660.KS"],
    bitpandaAliases: ["HYXS"],
    expectedCurrency: "KRW",
  });
  assert.equal(mapTopMarketCapTicker("BRK-B").canonicalTicker, "NYSE:BRK.B");
  assert.equal(mapTopMarketCapTicker("TM").canonicalTicker, "TYO:7203");
  assert.equal(mapTopMarketCapTicker("TM").supplyMultiplier, 10);
  assert.equal(mapTopMarketCapTicker("2222.SR").canonicalTicker, "2222.SR");
  assert.deepEqual(mapTopMarketCapTicker("2222.SR").yahooTickers, ["2222.SR"]);
});

test("consolidates Bitpanda aliases without ambiguous stock substitutions", () => {
  assert.deepEqual(getBitpandaAliases("KRX:000660"), ["HYXS"]);
  assert.equal(getBitpandaSecurity("GOOGL").canonicalTicker, "GOOG");
  assert.deepEqual(getBitpandaAliases("GOOG"), ["GOOGL"]);

  const novo = getBitpandaSecurity("NOVO-B");
  assert.equal(novo.canonicalTicker, "CPH:NOVO-B");
  assert.deepEqual(novo.yahooTickers, ["NVO", "NOVO-B.CO"]);
  assert.deepEqual(getBitpandaAliases("CPH:NOVO-B"), ["NOVO", "NOVO-B"]);

  const tsfa = getBitpandaSecurity("TSFA");
  assert.equal(tsfa.canonicalTicker, "TPE:2330");
  assert.deepEqual(tsfa.yahooTickers, ["2330.TW"]);
  assert.ok(!tsfa.yahooTickers.includes("TSLA"));

  const roche = getBitpandaSecurity("ROG");
  assert.equal(roche.canonicalTicker, "SWX:RO");
  assert.deepEqual(roche.yahooTickers, ["RO.SW"]);
});

test("unions and deduplicates aliases from every mapping of one canonical ticker", () => {
  assert.deepEqual(getBitpandaAliases("SHEL"), ["RDSA", "SHEL"]);
  assert.deepEqual(getBitpandaAliases("NYSE:BRK.B"), ["BRKB", "BRK.B", "BRK-B", "BRK"]);
});

test("records receipt metadata without changing canonical ordinary-share prices", () => {
  const samsung = getBitpandaSecurity("SMSN");
  assert.equal(samsung.canonicalTicker, "KRX:005930");
  assert.equal(samsung.unitsPerReceipt, 25);
  assert.equal(samsung.supplyMultiplier, undefined);
  assert.deepEqual(getBitpandaAliases("KRX:005930"), ["SSU", "SMSN"]);

  assert.equal(normalizeSupply("TM", 100), 1_000);
  assert.equal(normalizeSupply("005930.KS", 100), 100);
});

test("parses normalized headers and quoted CSV fields", () => {
  const csv = [
    "Country,Price (USD),Symbol,Name,Market Cap USD,Rank",
    'US,100,AAPL,"Apple, Inc.",3000000000000,1',
    'South Korea,2000,000660.KS,"SK Hynix, Inc.",100000000000,2',
  ].join("\n");

  assert.deepEqual(parseTopMarketCapCsv(csv, 10), [
    {
      rank: 1,
      company: "Apple, Inc.",
      sourceTicker: "AAPL",
      marketCapUsd: 3_000_000_000_000,
      priceUsd: 100,
      country: "US",
    },
    {
      rank: 2,
      company: "SK Hynix, Inc.",
      sourceTicker: "000660.KS",
      marketCapUsd: 100_000_000_000,
      priceUsd: 2_000,
      country: "South Korea",
    },
  ]);
});

test("uses the current positional CSV fallback and handles escaped quotes", () => {
  const csv = [
    "first,second,third,fourth,fifth,sixth",
    '1,"Berkshire ""Class B""",BRK-B,900000000000,500,USA',
  ].join("\n");

  assert.deepEqual(parseTopMarketCapCsv(csv), [{
    rank: 1,
    company: 'Berkshire "Class B"',
    sourceTicker: "BRK-B",
    marketCapUsd: 900_000_000_000,
    priceUsd: 500,
    country: "USA",
  }]);
});

test("rejects a partially recognized header instead of applying positional fallback", () => {
  const csv = [
    "name,unrecognized,symbol,marketcap,price,country",
    "1,Apple,AAPL,3000000000000,100,US",
  ].join("\n");

  assert.deepEqual(parseTopMarketCapCsv(csv), []);
});

test("rejects invalid rows and duplicate source tickers", () => {
  const csv = [
    "rank,name,symbol,marketcap,price,country",
    "1,Valid first,GOOG,1000,10,US",
    "2,Canonical duplicate,GOOG,900,9,US",
    "0,Bad rank,MSFT,1000,10,US",
    "3,Bad cap,AAPL,0,10,US",
    "4,Bad price,NVDA,1000,NaN,US",
    "5,Missing company,TSM,1000,10,",
    "6,,META,1000,10,US",
  ].join("\n");

  assert.deepEqual(parseTopMarketCapCsv(csv), [{
    rank: 1,
    company: "Valid first",
    sourceTicker: "GOOG",
    marketCapUsd: 1_000,
    priceUsd: 10,
    country: "US",
  }]);
});

test("deduplicates distinct source tickers that normalize to one canonical ticker", () => {
  const csv = [
    "rank,name,symbol,marketcap,price,country",
    "1,Alphabet Class C,GOOG,1000,10,US",
    "2,Alphabet Class A,GOOGL,900,9,US",
  ].join("\n");

  assert.deepEqual(parseTopMarketCapCsv(csv), [{
    rank: 1,
    company: "Alphabet Class C",
    sourceTicker: "GOOG",
    marketCapUsd: 1_000,
    priceUsd: 10,
    country: "US",
  }]);
});

test("clamps the result limit to the supported range of 1 through 5000", () => {
  const rows = Array.from({ length: 5_010 }, (_, index) =>
    `${index + 1},Company ${index + 1},TICK${index + 1},1000,10,US`);
  const csv = ["rank,name,symbol,marketcap,price,country", ...rows].join("\n");

  assert.equal(parseTopMarketCapCsv(csv, 0).length, 1);
  assert.equal(parseTopMarketCapCsv(csv, 5_500).length, 5_000);
  assert.equal(parseTopMarketCapCsv(csv, 2.9).length, 2);
});
