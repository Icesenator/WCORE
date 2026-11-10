"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePreferences } from "@/components/PreferencesProvider";
import { useSentinelChains } from "@/lib/use-sentinel";
import { formatCountdown, nextDeadline, normalizeKey, riskIndex, statusClass, statusLabel } from "@/lib/sentinel-view";

/**
 * Badge d'avertissement Chain Sentinel pour une chaine (pages chaine, cartes de
 * scan, vues portefeuille). Rien n'est affiche pour une chaine active ou absente
 * du registre. Ne contient aucune donnee de portefeuille.
 */
export function SentinelChainBadge({ chainKey }: { chainKey: string | undefined }) {
  const data = useSentinelChains();
  const { language } = usePreferences();
  const chain = useMemo(() => (data && chainKey ? riskIndex(data.chains).get(normalizeKey(chainKey)) : undefined), [data, chainKey]);
  if (!chain) return null;
  const d = nextDeadline(chain);
  const title = `${chain.name} — ${statusLabel(chain.status, language)}${d ? `${language === "fr" ? " :" : ":"} ${formatCountdown(d.countdownMs, language)}` : ""}`;
  return (
    <Link href={`/sentinel#chain-${chain.chainKey}`} title={title} aria-label={`Chain Sentinel${language === "fr" ? " :" : ":"} ${title}`}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(chain.status)}`}>
      <span aria-hidden>⚠</span><span className="hidden sm:inline">{statusLabel(chain.status, language)}</span>
    </Link>
  );
}
