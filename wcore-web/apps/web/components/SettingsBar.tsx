"use client";

import { useState, useRef, useEffect } from "react";
import { type Currency, type Language, usePreferences } from "./PreferencesProvider";

const PRIMARY_CURRENCIES: Currency[] = ["USD", "EUR"];
const SECONDARY_CURRENCIES: Currency[] = ["GBP", "CHF", "JPY"];
const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "€" };
const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "fr", label: "FR" },
];

export function SettingsBar() {
  const { currency, setCurrency, language, setLanguage } = usePreferences();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const isPrimary = PRIMARY_CURRENCIES.includes(currency);

  return (
    <div className="flex items-center gap-2">
        <>
          {/* Segmented currency control: USD / EUR + dropdown for more */}
          <div className="flex rounded border border-border">
            {PRIMARY_CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-2 py-1 text-xs transition ${
                  currency === c
                    ? "bg-accent/20 text-accent font-semibold"
                    : "bg-card text-muted hover:text-fg"
                }`}
              >
                {CURRENCY_SYMBOLS[c] ?? c}
              </button>
            ))}
            {/* More currencies dropdown */}
            <div ref={moreRef} className="relative">
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className={`px-2 py-1 text-xs transition border-l border-border ${
                  !isPrimary
                    ? "bg-accent/20 text-accent font-semibold"
                    : "bg-card text-muted hover:text-fg"
                }`}
                title="More currencies"
              >
                {!isPrimary ? currency : "···"}
              </button>
              {moreOpen ? (
                <div className="absolute top-full right-0 mt-1 rounded border border-border bg-card shadow-lg z-50 py-1 min-w-[64px]">
                  {SECONDARY_CURRENCIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setCurrency(c); setMoreOpen(false); }}
                      className={`block w-full text-left px-3 py-1.5 text-xs transition ${
                        currency === c
                          ? "text-accent font-semibold bg-accent/10"
                          : "text-muted hover:text-fg hover:bg-bg"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {/* Language switcher */}
          <div className="flex rounded border border-border overflow-hidden">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                onClick={() => setLanguage(l.value)}
                className={`px-2 py-1 text-xs transition ${
                  language === l.value
                    ? "bg-accent/20 text-accent font-semibold"
                    : "bg-card text-muted hover:text-fg"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </>
    </div>
  );
}
