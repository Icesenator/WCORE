import type { PrismaClient } from "@wcore/db";

// Quete attribuee par le serveur a la fin d'un scan authentifie. Avant ce module, aucune quete n'etait
// jamais attribuee : la seule ecriture de user_quests etait POST /api/quests/:questId/complete, que le site
// n'appelle pas. La quete first_scan (25 points, semee en production) restait donc hors d'atteinte, et le
// classement, qui promet « Connect and scan to appear here », restait vide (aucun score positif).
export const FIRST_SCAN_QUEST_KEY = "first_scan";

export interface QuestAwardOutcome {
  awarded: boolean;
  scoreReward: number;
}

// Idempotent et sur sous concurrence : l'insertion passe par la contrainte unique (userId, questId) avec
// skipDuplicates, et le score n'est credite que si une ligne a vraiment ete inseree, dans la meme transaction.
// Un rejeu de job, deux scans simultanes ou une quete deja reclamee a la main ne creditent donc jamais deux fois.
export async function awardQuestOnce(
  prisma: Pick<PrismaClient, "$transaction">,
  userId: string,
  questKey: string,
): Promise<QuestAwardOutcome> {
  return prisma.$transaction(async (tx) => {
    const quest = await tx.quest.findUnique({ where: { key: questKey }, select: { id: true, scoreReward: true } });
    if (!quest) return { awarded: false, scoreReward: 0 };
    const { count } = await tx.userQuest.createMany({ data: [{ userId, questId: quest.id }], skipDuplicates: true });
    if (count !== 1) return { awarded: false, scoreReward: 0 };
    await tx.user.update({ where: { id: userId }, data: { score: { increment: quest.scoreReward } } });
    return { awarded: true, scoreReward: quest.scoreReward };
  });
}

// Une chaine compte comme scannee avec la meme regle que le job asynchrone (plugins/scan.ts, statut "done") :
// sans erreur, meme si le portefeuille est vide, ou avec des jetons malgre une erreur partielle. Un scan dont
// toutes les chaines ont echoue ne rapporte donc la quete sur aucun parcours (synchrone, lot, asynchrone).
export function isScannedChain(chain: { errors: readonly unknown[]; tokens: readonly unknown[] }): boolean {
  return chain.errors.length === 0 || chain.tokens.length > 0;
}

// Appel des routes de scan : ne leve jamais et n'attend rien du resultat, pour ne pas retarder ni faire
// echouer le scan lui-meme.
export function awardFirstScanQuest(prisma: Pick<PrismaClient, "$transaction">, userId: string): Promise<void> {
  return awardQuestOnce(prisma, userId, FIRST_SCAN_QUEST_KEY).then(
    () => undefined,
    (err: unknown) => { console.error("awardFirstScanQuest failed:", err instanceof Error ? err.message : String(err)); },
  );
}
