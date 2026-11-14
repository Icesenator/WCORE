// Fusion de la serie generale de GM recalculee depuis les evenements en chaine avec la serie deja stockee.
//
// Les GM gratuits (bouton, POST /api/gm) ne laissent aucune trace par jour : seuls gmStreak et lastGmDate
// du compte les portent. Une serie recalculee depuis les seuls GM en chaine ne voit donc pas ces jours.
// Avant cette fusion, le recalcul ecrasait la serie du compte et la ramenait a la serie en chaine
// (30 jours devenaient 2). Regle : une serie stockee encore valide (dernier GM aujourd'hui ou hier, en UTC)
// ne baisse jamais ; si le premier GM en chaine d'un nouveau jour arrive alors que le compte s'arretait
// a hier, ce jour s'ajoute a la serie stockee.

const DAY_MS = 86_400_000;

export function utcDayStartMs(value: Date | number): number {
  const d = new Date(value);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface StoredGmState {
  gmStreak: number;
  longestStreak: number;
  lastGmDate: Date | null;
}

export interface MergedGeneralStreak {
  gmStreak: number;
  longestStreak: number;
  lastGmDate: Date | null;
  changed: boolean;
}

export function mergeGeneralStreak(args: {
  /** Serie courante calculee depuis les evenements en chaine (0 si le dernier jour est plus ancien qu'hier). */
  computedStreak: number;
  /** Plus longue serie calculee depuis les evenements en chaine. */
  computedLongest: number;
  /** Horodatage (ms) du dernier evenement en chaine, ou null s'il n'y en a pas. */
  latestEventMs: number | null;
  stored: StoredGmState;
  now?: Date;
}): MergedGeneralStreak {
  const { computedStreak, computedLongest, latestEventMs, stored } = args;
  const today = utcDayStartMs(args.now ?? new Date());
  const yesterday = today - DAY_MS;

  const storedDay = stored.lastGmDate ? utcDayStartMs(stored.lastGmDate) : null;
  const latestDay = latestEventMs != null ? utcDayStartMs(latestEventMs) : null;
  const storedStillValid = storedDay != null && (storedDay === today || storedDay === yesterday) && stored.gmStreak > 0;

  let base = 0;
  if (storedStillValid) {
    base = stored.gmStreak;
    // Le compte s'arretait a hier et un GM en chaine arrive aujourd'hui : ce jour s'ajoute une fois.
    if (storedDay === yesterday && latestDay === today) base += 1;
  }

  const gmStreak = Math.max(computedStreak, base);
  const longestStreak = Math.max(computedLongest, stored.longestStreak, gmStreak);

  // lastGmDate ne recule jamais.
  const lastCandidates = [stored.lastGmDate ? stored.lastGmDate.getTime() : null, latestEventMs].filter((x): x is number => x != null);
  const lastMs = lastCandidates.length ? Math.max(...lastCandidates) : null;
  const lastGmDate = lastMs != null ? new Date(lastMs) : null;

  const lastDayChanged = (lastGmDate?.getTime() ?? null) !== (stored.lastGmDate?.getTime() ?? null);
  const changed = gmStreak !== stored.gmStreak || longestStreak !== stored.longestStreak || lastDayChanged;
  return { gmStreak, longestStreak, lastGmDate, changed };
}
