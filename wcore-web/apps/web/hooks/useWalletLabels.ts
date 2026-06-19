"use client";
import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/lib/api";

const API_URL = getApiUrl();

export function useWalletLabels({ initialLabels }: {
  initialLabels: Record<string, string>;
}) {
  const [labels, setLabels] = useState<Record<string, string>>(() => {
    // Start from URL params only (localStorage will be merged after API fetch)
    return { ...initialLabels };
  });

  useEffect(() => {
    apiFetch(`${API_URL}/api/wallets`)
      .then((r) => r.json())
      .then((d: { wallets?: Array<{ address: string; label: string | null }> }) => {
        const map: Record<string, string> = { ...initialLabels };
        // 1. API is source of truth
        if (d.wallets) {
          for (const w of d.wallets) {
            map[w.address.toLowerCase()] = w.label ?? w.address.slice(0, 10);
          }
        }
        // 2. Merge local-only wallets from localStorage
        try {
          const raw = localStorage.getItem("wcore_linked");
          if (raw) {
            const parsed = JSON.parse(raw) as Array<{ address: string; label: string }>;
            for (const w of parsed) {
              const key = w.address.toLowerCase();
              if (!map[key]) {
                const cleanLabel = w.label === "🔗 Connected" || w.label === "Connected" ? w.address.slice(0, 10) : w.label;
                if (cleanLabel) map[key] = cleanLabel;
              }
            }
          }
        } catch { /* ignore */ }
        setLabels(map);
      }).catch(() => {
        // On error, fallback to localStorage
        const map: Record<string, string> = { ...initialLabels };
        try {
          const raw = localStorage.getItem("wcore_linked");
          if (raw) {
            const parsed = JSON.parse(raw) as Array<{ address: string; label: string }>;
            for (const w of parsed) {
              const key = w.address.toLowerCase();
              const cleanLabel = w.label === "🔗 Connected" || w.label === "Connected" ? w.address.slice(0, 10) : w.label;
              if (cleanLabel && !map[key]) map[key] = cleanLabel;
            }
          }
        } catch { /* ignore */ }
        setLabels(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { labels };
}
