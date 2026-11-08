"use client";

import Link from "next/link";
import { useSentinelAlerts } from "@/lib/use-sentinel";
import { pendingCount } from "@/lib/sentinel-view";

/**
 * Centre de notifications Chain Sentinel : nombre d'alertes P0/P1 non acquittees,
 * relu periodiquement par le serveur (aucune action manuelle requise pour etre
 * averti). Rien n'est affiche pour un visiteur non connecte.
 */
export function SentinelNotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const { state } = useSentinelAlerts();
  if (state.status !== "ok") return null;
  const n = pendingCount(state.data);
  if (n === 0) return null;
  const p0 = state.data.alerts.some((a) => a.severity === "P0" && !a.acknowledged);
  return (
    <Link href="/sentinel#alertes" role="status" aria-live="polite"
      aria-label={`${n} alerte(s) Chain Sentinel non acquittée(s)`}
      className={`mx-2 mb-2 flex min-h-11 items-center gap-2 rounded-md border px-2 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${p0 ? "border-red-500/60 bg-red-500/15 text-red-200" : "border-amber-500/60 bg-amber-500/10 text-amber-200"}`}>
      <span aria-hidden>🔔</span>
      {!collapsed && <span>Chain Sentinel</span>}
      <span className="ml-auto rounded-full bg-black/30 px-1.5">{n}</span>
    </Link>
  );
}
