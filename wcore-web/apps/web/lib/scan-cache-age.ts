/**
 * Age label of a chain result served from the API scan-result cache (cachedAt set by the API,
 * up to 6 h old). Null when the result was scanned for this request or the date is unusable.
 */
export function cacheAgeLabel(cachedAt: string | null | undefined, now: number = Date.now()): string | null {
  if (typeof cachedAt !== "string") return null;
  const observed = Date.parse(cachedAt);
  if (!Number.isFinite(observed)) return null;
  const minutes = Math.max(0, Math.floor((now - observed) / 60_000));
  if (minutes < 1) return "cached just now";
  if (minutes < 60) return `cached ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `cached ${hours} h ago` : `cached ${hours} h ${rest} min ago`;
}
