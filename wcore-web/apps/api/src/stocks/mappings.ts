export interface CanonicalStockMapping {
  canonicalTicker: string;
  yahooTickers: string[];
  bitpandaAliases: string[];
  expectedCurrency?: string;
  unitsPerReceipt?: number;
  supplyMultiplier?: number;
}

interface ExchangeMapping {
  prefix: string | null;
  currency: string;
}

const EXCHANGES: Readonly<Record<string, ExchangeMapping>> = {
  KS: { prefix: "KRX", currency: "KRW" },
  KQ: { prefix: "KOSDAQ", currency: "KRW" },
  SS: { prefix: "SHA", currency: "CNY" },
  SZ: { prefix: "SHE", currency: "CNY" },
  HK: { prefix: "HKG", currency: "HKD" },
  SW: { prefix: "SWX", currency: "CHF" },
  PA: { prefix: "EPA", currency: "EUR" },
  AS: { prefix: "AMS", currency: "EUR" },
  BR: { prefix: "EBR", currency: "EUR" },
  LS: { prefix: "ELI", currency: "EUR" },
  DE: { prefix: "ETR", currency: "EUR" },
  F: { prefix: "FRA", currency: "EUR" },
  T: { prefix: "TYO", currency: "JPY" },
  TW: { prefix: "TPE", currency: "TWD" },
  TWO: { prefix: "TPE", currency: "TWD" },
  L: { prefix: "LON", currency: "GBp" },
  MC: { prefix: "BME", currency: "EUR" },
  MI: { prefix: "BIT", currency: "EUR" },
  ST: { prefix: "STO", currency: "SEK" },
  CO: { prefix: "CPH", currency: "DKK" },
  HE: { prefix: "HEL", currency: "EUR" },
  OL: { prefix: "OSL", currency: "NOK" },
  AX: { prefix: "ASX", currency: "AUD" },
  TO: { prefix: "TSE", currency: "CAD" },
  V: { prefix: "CVE", currency: "CAD" },
  SR: { prefix: null, currency: "SAR" },
  AE: { prefix: null, currency: "AED" },
  SAU: { prefix: null, currency: "SAR" },
};

const BITPANDA_SECURITIES: Readonly<Record<string, CanonicalStockMapping>> = {
  "AMD-US": stock("AMD", ["AMD"], ["AMD-US"], "USD"),
  "JPM-US": stock("JPM", ["JPM"], ["JPM-US"], "USD"),
  "LLYC-US": stock("LLY", ["LLY"], ["LLYC-US"], "USD"),
  "WMT-US": stock("WMT", ["WMT"], ["WMT-US"], "USD"),
  BRK: stock("NYSE:BRK.B", ["BRK-B"], ["BRKB", "BRK.B", "BRK-B", "BRK"], "USD"),
  BRKB: stock("NYSE:BRK.B", ["BRK-B"], ["BRKB", "BRK.B", "BRK-B", "BRK"], "USD"),
  "BRK.B": stock("NYSE:BRK.B", ["BRK-B"], ["BRKB", "BRK.B", "BRK-B", "BRK"], "USD"),
  "BRK-B": stock("NYSE:BRK.B", ["BRK-B"], ["BRKB", "BRK.B", "BRK-B", "BRK"], "USD"),
  GOOGL: stock("GOOG", ["GOOG"], ["GOOGL"], "USD"),
  FB: stock("META", ["META"], ["FB"], "USD"),
  MRKUS: stock("MRK", ["MRK"], ["MRKUS"], "USD"),
  RDSA: stock("SHEL", ["SHEL.L", "SHEL"], ["RDSA"], "GBp"),
  TSFA: stock("TPE:2330", ["2330.TW"], ["TSFA"], "TWD"),
  TCTZF: stock("TCEHY", ["TCEHY", "TCTZF"], ["TCTZF"], "USD"),
  NOVO: stock("CPH:NOVO-B", ["NVO", "NOVO-B.CO"], ["NOVO", "NOVO-B"], "DKK"),
  "NOVO-B": stock("CPH:NOVO-B", ["NVO", "NOVO-B.CO"], ["NOVO", "NOVO-B"], "DKK"),
  BROA: stock("AVGO", ["AVGO"], ["BROA"], "USD"),
  TM: stock("TYO:7203", ["7203.T"], ["TM"], "JPY", { supplyMultiplier: 10 }),
  SSU: stock("KRX:005930", ["005930.KS"], ["SSU", "SMSN"], "KRW", { unitsPerReceipt: 25 }),
  SMSN: stock("KRX:005930", ["005930.KS"], ["SSU", "SMSN"], "KRW", { unitsPerReceipt: 25 }),
  HYXS: stock("KRX:000660", ["000660.KS"], ["HYXS"], "KRW"),
  ADS: stock("ETR:ADS", ["ADS.DE"], ["ADS"], "EUR"),
  AIR: stock("EPA:AIR", ["AIR.PA"], ["AIR"], "EUR"),
  ALV: stock("ETR:ALV", ["ALV.DE"], ["ALV"], "EUR"),
  BAS: stock("ETR:BAS", ["BAS.DE"], ["BAS"], "EUR"),
  BAYN: stock("ETR:BAYN", ["BAYN.DE"], ["BAYN"], "EUR"),
  BMW: stock("ETR:BMW", ["BMW.DE"], ["BMW"], "EUR"),
  CBK: stock("ETR:CBK", ["CBK.DE"], ["CBK"], "EUR"),
  DBK: stock("ETR:DBK", ["DBK.DE"], ["DBK"], "EUR"),
  DTE: stock("ETR:DTE", ["DTE.DE"], ["DTE"], "EUR"),
  ENR: stock("ETR:ENR", ["ENR.DE"], ["ENR"], "EUR"),
  HEN3: stock("ETR:HEN3", ["HEN3.DE"], ["HEN3"], "EUR"),
  IFX: stock("ETR:IFX", ["IFX.DE"], ["IFX"], "EUR"),
  RHM: stock("ETR:RHM", ["RHM.DE"], ["RHM"], "EUR"),
  SAP: stock("ETR:SAP", ["SAP.DE", "SAP"], ["SAP"], "EUR"),
  SIE: stock("ETR:SIE", ["SIE.DE"], ["SIE"], "EUR"),
  VOW3: stock("ETR:VOW3", ["VOW3.DE"], ["VOW3"], "EUR"),
  ASML: stock("AMS:ASML", ["ASML.AS", "ASML"], ["ASML"], "EUR"),
  MC: stock("EPA:MC", ["MC.PA"], ["MC"], "EUR"),
  OR: stock("EPA:OR", ["OR.PA"], ["OR"], "EUR"),
  RMS: stock("EPA:RMS", ["RMS.PA"], ["RMS"], "EUR"),
  SAN: stock("BME:SAN", ["SAN.MC", "SAN"], ["SAN"], "EUR"),
  TTE: stock("EPA:TTE", ["TTE.PA", "TTE"], ["TTE"], "EUR"),
  IBE: stock("BME:IBE", ["IBE.MC"], ["IBE"], "EUR"),
  NESN: stock("SWX:NESN", ["NESN.SW"], ["NESN"], "CHF"),
  NOVN: stock("NVS", ["NOVN.SW"], ["NOVN"], "CHF"),
  ROG: stock("SWX:RO", ["RO.SW"], ["ROG"], "CHF"),
  SHEL: stock("SHEL", ["SHEL.L", "SHEL"], ["SHEL", "RDSA"], "GBp"),
  EUNL: stock("ETR:EUNL", ["EUNL.DE"], ["EUNL"], "EUR"),
  IS3N: stock("ETR:IS3N", ["IS3N.DE"], ["IS3N"], "EUR"),
  QDVE: stock("ETR:QDVE", ["QDVE.DE"], ["QDVE"], "EUR"),
  SXR8: stock("ETR:SXR8", ["SXR8.DE"], ["SXR8"], "EUR"),
  VUSA: stock("ETR:VUSA", ["VUSA.DE", "VUSA.L"], ["VUSA"], "EUR"),
  VWCE: stock("ETR:VWCE", ["VWCE.DE"], ["VWCE"], "EUR"),
  VWRL: stock("AMS:VWRL", ["VWRL.AS", "VWRL.L"], ["VWRL"], "EUR"),
};

const TOP_MARKET_CAP_OVERRIDES: Readonly<Record<string, CanonicalStockMapping>> = {
  "BRK-B": BITPANDA_SECURITIES["BRK-B"]!,
  "BRK-A": stock("NYSE:BRK.A", ["BRK-A"], [], "USD"),
  TM: BITPANDA_SECURITIES.TM!,
  GOOG: stock("GOOG", ["GOOG"], ["GOOGL"], "USD"),
  GOOGL: BITPANDA_SECURITIES.GOOGL!,
};

const CANONICAL_ALIASES = new Map<string, string[]>();
for (const mapping of Object.values(BITPANDA_SECURITIES)) {
  const aliases = CANONICAL_ALIASES.get(mapping.canonicalTicker) ?? [];
  for (const alias of mapping.bitpandaAliases) {
    if (!aliases.includes(alias)) aliases.push(alias);
  }
  CANONICAL_ALIASES.set(mapping.canonicalTicker, aliases);
}

function stock(
  canonicalTicker: string,
  yahooTickers: string[],
  bitpandaAliases: string[],
  expectedCurrency?: string,
  ratios: Pick<CanonicalStockMapping, "unitsPerReceipt" | "supplyMultiplier"> = {},
): CanonicalStockMapping {
  return {
    canonicalTicker,
    yahooTickers,
    bitpandaAliases,
    ...(expectedCurrency ? { expectedCurrency } : {}),
    ...(ratios.unitsPerReceipt ? { unitsPerReceipt: ratios.unitsPerReceipt } : {}),
    ...(ratios.supplyMultiplier ? { supplyMultiplier: ratios.supplyMultiplier } : {}),
  };
}

function copyMapping(mapping: CanonicalStockMapping): CanonicalStockMapping {
  return {
    ...mapping,
    yahooTickers: [...mapping.yahooTickers],
    bitpandaAliases: [...mapping.bitpandaAliases],
  };
}

export function mapTopMarketCapTicker(sourceTicker: string): CanonicalStockMapping {
  const ticker = String(sourceTicker ?? "").trim().toUpperCase();
  if (!ticker) return stock("", [], []);

  const override = TOP_MARKET_CAP_OVERRIDES[ticker];
  if (override) return copyMapping(override);

  const dot = ticker.lastIndexOf(".");
  if (dot < 0) {
    return stock(ticker, [ticker], getBitpandaAliases(ticker), "USD");
  }

  const base = ticker.slice(0, dot);
  const suffix = ticker.slice(dot + 1);
  const exchange = EXCHANGES[suffix];
  const canonicalTicker = exchange?.prefix ? `${exchange.prefix}:${base}` : ticker;
  return stock(
    canonicalTicker,
    [ticker],
    getBitpandaAliases(canonicalTicker),
    exchange?.currency,
  );
}

export function getBitpandaSecurity(symbol: string): CanonicalStockMapping {
  const ticker = String(symbol ?? "").trim().toUpperCase();
  const explicit = BITPANDA_SECURITIES[ticker];
  if (explicit) return copyMapping(explicit);

  const withoutUs = ticker.endsWith("-US") ? ticker.slice(0, -3) : ticker;
  return mapTopMarketCapTicker(withoutUs);
}

export function getBitpandaAliases(canonicalTicker: string): string[] {
  return [...(CANONICAL_ALIASES.get(String(canonicalTicker ?? "").trim().toUpperCase()) ?? [])];
}

export function normalizeSupply(sourceTicker: string, supply: number): number {
  return supply * (mapTopMarketCapTicker(sourceTicker).supplyMultiplier ?? 1);
}
