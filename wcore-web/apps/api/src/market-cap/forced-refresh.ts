// Rafraichissement force des classements publics (/api/cmc/*?fresh=true).
//
// Le bouton « Refresh » de la page publique demande un instantane neuf. Sans borne, n'importe
// quel appelant pouvait enchainer les reconstructions et consommer les quotas des fournisseurs
// (audit du 10/11/2026). Au plus un rafraichissement force par classement et par fenetre,
// toutes origines confondues ; au-dela, le cache est servi normalement.
import type { CacheStore } from "@wcore/core";
import { cacheKey } from "@wcore/shared";

export const FORCED_REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

export async function allowForcedRefresh(cache: CacheStore, kind: "crypto" | "stock", requested: boolean, now = new Date()): Promise<boolean> {
  if (!requested) return false;
  try {
    return await cache.add(cacheKey("marketForcedRefresh", { kind }), now.toISOString(), FORCED_REFRESH_COOLDOWN_MS);
  } catch {
    return false; // magasin indisponible : on sert le cache plutot que de reconstruire sans borne
  }
}
