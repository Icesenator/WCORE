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
  // >= hier : tolere aussi un lastGmDate legerement dans le futur (derive d'horloge) au lieu de le juger expire.
  const storedStillValid = storedDay != null && storedDay >= yesterday && stored.gmStreak > 0;

  let base = 0;
  if (storedStillValid) {
    base = stored.gmStreak;
    // Le compte s'arretait a hier et un GM en chaine arrive aujourd'hui : ce jour s'ajoute une fois.
    if (storedDay === yesterday && latestDay != null && latestDay >= today) base += 1;
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

// Reclamation du bonus general quotidien d'un GM en chaine : updateMany conditionne a l'etat lu
// (gmStreak, longestStreak, lastGmDate) ET a lastGmDate < jour de scoring. Un GM gratuit ou une reparation
// concurrents ecrits apres la lecture font perdre la reclamation (count 0) au lieu d'etre ecrases ; la
// reparation qui suit le GM en chaine recalcule alors la serie depuis l'etat frais.
export async function claimGeneralDailyGm(args: {
  tx: { user: { updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }> } };
  user: { id: string } & StoredGmState;
  scoringDay: Date;
  gmDate: Date;
  generalStreak: number;
  generalLongest: number;
  scoreGain: number;
}): Promise<boolean> {
  const { tx, user, scoringDay, gmDate, generalStreak, generalLongest, scoreGain } = args;
  const claimed = await tx.user.updateMany({
    where: {
      id: user.id,
      gmStreak: user.gmStreak,
      longestStreak: user.longestStreak,
      lastGmDate: user.lastGmDate,
      OR: [{ lastGmDate: null }, { lastGmDate: { lt: scoringDay } }],
    },
    data: { gmStreak: generalStreak, longestStreak: generalLongest, lastGmDate: gmDate, score: { increment: scoreGain } },
  });
  return claimed.count === 1;
}

type ClaimTx = {
  user: {
    findUnique(a: { where: { id: string } }): Promise<({ id: string } & StoredGmState) | null>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
};

// Serie generale d'un GM en chaine : calcul a partir de l'etat lu, puis reclamation atomique du bonus du jour.
// Si la reclamation perd :
//  - le jour est desormais pris (autre GM en chaine ou GM gratuit) : pas de second bonus (alreadyGeneralGm) ;
//  - sinon (reparation, serie ou record ecrits entre la lecture et l'ecriture) : relecture et recalcul, 3 tours
//    au plus, puis Error("gm_conflict") pour annuler la transaction et permettre une nouvelle soumission.
export async function claimGeneralDailyGmWithRetry<U extends { id: string } & StoredGmState>(args: {
  tx: ClaimTx;
  userId: string;
  initial: U;
  scoringDay: Date;
  gmDate: Date;
  maxTries?: number;
}): Promise<{ claimed: boolean; alreadyGeneralGm: boolean; generalStreak: number; generalLongest: number; scoreGain: number; user: U }> {
  const { tx, userId, scoringDay, gmDate } = args;
  const maxTries = args.maxTries ?? 3;
  const scoringMs = utcDayStartMs(scoringDay);
  let user = args.initial;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    let generalStreak = user.gmStreak;
    let generalLongest = user.longestStreak;
    let scoreGain = 0;
    let alreadyGeneralGm = false;
    if (user.lastGmDate) {
      const lastMs = utcDayStartMs(user.lastGmDate);
      if (lastMs >= scoringMs) {
        alreadyGeneralGm = true;
      } else if (lastMs >= scoringMs - DAY_MS) {
        generalStreak = user.gmStreak + 1;
        generalLongest = Math.max(generalStreak, user.longestStreak);
        scoreGain += 20 + (generalStreak > 1 ? generalStreak * 2 : 0);
      } else {
        generalStreak = 1;
        generalLongest = Math.max(1, user.longestStreak);
        scoreGain += 20;
      }
    } else {
      generalStreak = 1;
      generalLongest = 1;
      scoreGain += 20;
    }
    if (alreadyGeneralGm) return { claimed: false, alreadyGeneralGm, generalStreak, generalLongest, scoreGain: 0, user };

    if (await claimGeneralDailyGm({ tx, user, scoringDay, gmDate, generalStreak, generalLongest, scoreGain })) {
      return { claimed: true, alreadyGeneralGm: false, generalStreak, generalLongest, scoreGain, user };
    }
    const fresh = (await tx.user.findUnique({ where: { id: userId } })) as U | null;
    if (!fresh) throw new Error("user_not_found");
    if (fresh.lastGmDate && utcDayStartMs(fresh.lastGmDate) >= scoringMs) {
      return { claimed: false, alreadyGeneralGm: true, generalStreak: fresh.gmStreak, generalLongest: fresh.longestStreak, scoreGain: 0, user: fresh };
    }
    user = fresh;
  }
  throw new Error("gm_conflict");
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
      where: { id: userId, gmStreak: stored.gmStreak, longestStreak: stored.longestStreak, lastGmDate: stored.lastGmDate },
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
