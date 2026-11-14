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

// Ecriture par comparaison atomique : lecture de l'etat du compte, fusion, puis updateMany conditionne a
// l'etat lu (gmStreak et lastGmDate). Si un GM gratuit concurrent a ecrit entre la lecture et l'ecriture,
// l'ecriture ne s'applique pas et la fusion est recalculee sur l'etat frais (au plus maxTries tours).
export interface StreakStore {
  user: {
    findUnique(args: { where: { id: string }; select: { gmStreak: true; longestStreak: true; lastGmDate: true } }): Promise<StoredGmState | null>;
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

export async function applyMergedStreak(args: {
  store: StreakStore;
  userId: string;
  compute: (stored: StoredGmState) => MergedGeneralStreak;
  /** Champs ajoutes a l'ecriture (ex. increment de score) : appliques une seule fois, par l'ecriture qui reussit. */
  extraData?: Record<string, unknown>;
  /** Ecrire meme si la fusion ne change rien (necessaire quand extraData doit etre applique). */
  alwaysWrite?: boolean;
  maxTries?: number;
}): Promise<{ merged: MergedGeneralStreak; applied: boolean }> {
  const { store, userId, compute, extraData, alwaysWrite } = args;
  const maxTries = args.maxTries ?? 3;
  let merged: MergedGeneralStreak | null = null;
  for (let i = 0; i < maxTries; i++) {
    const stored = await store.user.findUnique({ where: { id: userId }, select: { gmStreak: true, longestStreak: true, lastGmDate: true } });
    if (!stored) return { merged: { gmStreak: 0, longestStreak: 0, lastGmDate: null, changed: false }, applied: false };
    merged = compute(stored);
    if (!merged.changed && !alwaysWrite) return { merged, applied: false };
    const res = await store.user.updateMany({
      where: { id: userId, gmStreak: stored.gmStreak, lastGmDate: stored.lastGmDate },
      data: {
        gmStreak: merged.gmStreak,
        longestStreak: merged.longestStreak,
        ...(merged.lastGmDate ? { lastGmDate: merged.lastGmDate } : {}),
        ...(extraData ?? {}),
      },
    });
    if (res.count > 0) return { merged, applied: true };
  }
  // Conflits repetes : ne rien ecraser, le prochain recalcul repare.
  return { merged: merged!, applied: false };
}
