"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { TRANSLATIONS, type Language as Lang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";

export type Currency = "EUR" | "USD" | "GBP" | "CHF" | "JPY";
export type Language = Lang;

interface Preferences {
  currency: Currency;
  language: Language;
  setCurrency: (c: Currency) => void;
  setLanguage: (l: Language) => void;
  formatValue: (valueEur: number) => string;
  t: (key: string) => string;
}

const _SYMBOLS: Record<Currency, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF", JPY: "¥" };
const EUR_TO_CROSS: Record<string, number> = { GBP: 0.85, CHF: 0.97, JPY: 164 };

const LOCALES: Record<Currency, string> = { EUR: "fr-FR", USD: "en-US", GBP: "en-GB", CHF: "de-CH", JPY: "ja-JP" };

const Ctx = createContext<Preferences | null>(null);

export function usePreferences(): Preferences {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePreferences must be inside PreferencesProvider");
  return ctx;
}

const VALID_CURRENCIES: Currency[] = ["EUR", "USD", "GBP", "CHF", "JPY"];
const VALID_LANGUAGES: Language[] = ["fr", "en"];

function readStored<T>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw && (allowed as readonly unknown[]).includes(raw)) return raw as T;
  } catch { /* localStorage unavailable */ }
  return fallback;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("EUR");
  const [language, setLanguageState] = useState<Language>("fr");
  const [eurUsdRate, setEurUsdRate] = useState<number>(1.08);

  // Fetch real EUR/USD rate on mount. Use apiFetch so the call works in
  // dev/staging (API is on a different port) AND in prod (cookies/credentials).
  useEffect(() => {
    const ctrl = new AbortController();
    apiFetch("/api/price/fx", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { eurUsd?: number }) => { if (d.eurUsd && d.eurUsd > 0) setEurUsdRate(d.eurUsd); })
      .catch((_e) => { /* keep default 1.08 */ });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    setCurrencyState(readStored("wcore_currency", VALID_CURRENCIES, "EUR"));
    setLanguageState(readStored("wcore_language", VALID_LANGUAGES, "fr"));
  }, []);

  // Dynamic FX rates: EUR is always 1, USD from API, others as cross-rates
  const fxRates = useMemo((): Record<string, number> => ({
    EUR: 1,
    USD: eurUsdRate,
    ...Object.fromEntries(Object.entries(EUR_TO_CROSS).map(([k, v]) => [k, v * eurUsdRate / 1.08])),
  }), [eurUsdRate]);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try { localStorage.setItem("wcore_currency", c); } catch { /* unavailable */ }
  }, []);

  const setLanguage = useCallback((l: Language) => {
    setLanguageState(l);
    try { localStorage.setItem("wcore_language", l); } catch { /* unavailable */ }
  }, []);

  const formatValue = useCallback((valueEur: number) => {
    const converted = valueEur * (fxRates[currency] || 1);
    return new Intl.NumberFormat(LOCALES[currency] || "fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(converted);
  }, [currency, fxRates]);

  const t = useCallback((key: string) => {
    return TRANSLATIONS[key]?.[language] ?? key;
  }, [language]);

  return (
    <Ctx.Provider value={{ currency, language, setCurrency, setLanguage, formatValue, t }}>
      {children}
    </Ctx.Provider>
  );
}
