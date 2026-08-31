export interface CanonicalStockMapping {
  canonicalTicker: string;
  yahooTickers: string[];
  bitpandaAliases: string[];
  expectedCurrency?: string;
  unitsPerReceipt?: number;
  supplyMultiplier?: number;
  companiesMarketCapFallback?: boolean;
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
  BRK: stock("BRKB", ["BRK-B", "NYSE:BRK.B"], ["BRKB", "BRK.B", "BRK-B", "BRK", "NYSE:BRK.B"], "USD"),
  BRKB: stock("BRKB", ["BRK-B", "NYSE:BRK.B"], ["BRKB", "BRK.B", "BRK-B", "BRK", "NYSE:BRK.B"], "USD"),
  "BRK.B": stock("BRKB", ["BRK-B", "NYSE:BRK.B"], ["BRKB", "BRK.B", "BRK-B", "BRK", "NYSE:BRK.B"], "USD"),
  "BRK-B": stock("BRKB", ["BRK-B", "NYSE:BRK.B"], ["BRKB", "BRK.B", "BRK-B", "BRK", "NYSE:BRK.B"], "USD"),
  GOOGL: stock("GOOG", ["GOOG"], ["GOOGL"], "USD"),
  FB: stock("META", ["META"], ["FB"], "USD"),
  MRKUS: stock("MRK", ["MRK"], ["MRKUS"], "USD"),
  RDSA: stock("SHEL", ["SHEL.L"], ["RDSA"], "GBp", { supplyMultiplier: 2 }),
  TSFA: stock("TPE:2330", ["2330.TW"], ["TSFA"], "TWD"),
  TCTZF: stock("TCEHY", ["TCEHY", "TCTZF"], ["TCTZF"], "USD"),
  NOVO: stock("CPH:NOVO-B", ["NVO", "NOVO-B.CO"], ["NOVO", "NOVO-B"], "DKK"),
  "NOVO-B": stock("CPH:NOVO-B", ["NVO", "NOVO-B.CO"], ["NOVO", "NOVO-B"], "DKK"),
  BROA: stock("AVGO", ["AVGO"], ["BROA"], "USD"),
  TM: stock("TYO:7203", ["7203.T"], ["TM"], "JPY", { supplyMultiplier: 10 }),
  SSU: stock("SMSN", ["005930.KS"], ["SSU", "SMSN"], "KRW", { unitsPerReceipt: 25 }),
  SMSN: stock("SMSN", ["005930.KS"], ["SSU", "SMSN"], "KRW", { unitsPerReceipt: 25 }),
  HYXS: stock("SKHY", ["SKHY"], ["HYXS", "SKHY", "SKHYx"], "USD"),
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
  // Shell: 1 ADR US (NYSE:SHEL) = 2 actions Londres (SHEL.L). Bitpanda + Yahoo suivent
  // Londres (GBp), mais CompaniesMarketCap liste le cours ADR US -> supplyMultiplier:2
  // divise le fallback CSV pour rester sous le garde-fou de drift 15%. Fallback Yahoo US retire.
  SHEL: stock("SHEL", ["SHEL.L"], ["SHEL", "RDSA"], "GBp", { supplyMultiplier: 2 }),
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
  TM: BITPANDA_SECURITIES.TM!,
  GOOG: stock("GOOG", ["GOOG"], ["GOOGL"], "USD"),
  GOOGL: BITPANDA_SECURITIES.GOOGL!,
  // SK Hynix: les xStocks Bitpanda (HYXS) et Kraken (SKHYx/SKHY) suivent la cotation
  // Nasdaq (SKHY) ; la cotation KRX 000660.KS reste en fallback pour le top market cap.
  "000660.KS": stock("SKHY", ["SKHY", "000660.KS"], ["HYXS", "SKHY", "SKHYx"], "USD", { companiesMarketCapFallback: false }),
  // Samsung: le canonique est SMSN (ex-KRX:005930), alias SSU/SMSN conservés pour Bitpanda.
  "005930.KS": BITPANDA_SECURITIES.SSU!,
  // Berkshire Hathaway: le canonique est BRKB (ex-NYSE:BRK.B), aliases BRK/BRK.B/BRK-B conservés.
  "BRK-A": stock("BRKA", ["BRK-A"], [], "USD"),
  // Shell: CompaniesMarketCap liste "SHEL" au cours ADR US (1 ADR = 2 actions Londres).
  // Sans override, mapTopMarketCapTicker traiterait SHEL comme un ticker US (yahoo:["SHEL"],
  // USD). On force le mapping Londres (SHEL.L/GBp) + supplyMultiplier:2 pour aligner le
  // fallback CSV sur Londres et rester sous le garde-fou de drift 15%.
  SHEL: BITPANDA_SECURITIES.SHEL!,
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
  ratios: Pick<CanonicalStockMapping, "unitsPerReceipt" | "supplyMultiplier" | "companiesMarketCapFallback"> = {},
): CanonicalStockMapping {
  return {
    canonicalTicker,
    yahooTickers,
    bitpandaAliases,
    ...(expectedCurrency ? { expectedCurrency } : {}),
    ...(ratios.unitsPerReceipt ? { unitsPerReceipt: ratios.unitsPerReceipt } : {}),
    ...(ratios.supplyMultiplier ? { supplyMultiplier: ratios.supplyMultiplier } : {}),
    ...(ratios.companiesMarketCapFallback === false ? { companiesMarketCapFallback: false } : {}),
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

/**
 * Normalise un symbole xStock Kraken (ex. "JPMx") vers le symbole canonique du
 * pipeline WCORE (ex. "JPM"). Réutilise BITPANDA_SECURITIES pour les
 * sous-jacents identiques ; tout ce qui est inconnu ou déjà canonique passe tel
 * quel, hors suffixe "x" retiré des xStocks non mappés (ex. "AAPLx" -> "AAPL").
 */
export function krakenStockCanonicalSymbol(symbol: string): string {
  const raw = String(symbol ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  // Résolution inverse: trouver le mapping dont un yahooTickers/alias correspond.
  for (const mapping of Object.values(BITPANDA_SECURITIES)) {
    const candidates = [...(mapping.yahooTickers ?? []), ...(mapping.bitpandaAliases ?? [])];
    for (const c of candidates) {
      const cu = c.toUpperCase();
      if (upper === cu || upper === `${cu}X` || upper === `${cu}-US`) {
        return mapping.canonicalTicker;
      }
    }
  }
  if (upper.endsWith("X")) return raw.slice(0, -1);
  return raw;
}
