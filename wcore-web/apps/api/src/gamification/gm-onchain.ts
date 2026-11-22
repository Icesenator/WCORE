import { firstAccepted, signalWithTimeout } from "../lib/first-accepted.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@wcore/db";
import { safeFetch } from "../lib/safe-http.js";
import { canonicalChainKey, getFactory } from "@wcore/shared";
import { z } from "zod";
import type { GmHelpersDeps } from "./gm-helpers.js";
import { createGmHelpers } from "./gm-helpers.js";
import { GM_CLOCK_MARGIN_MS, GmBackfillRpcError, rebuildChainStreakFromOnchain, scanGmBackfillCandidates, type BackfillCandidate } from "./gm-streak-rebuild.js";
import { createTtlCache } from "./ttl-cache.js";
import { applyMergedStreak, claimChainDailyGmWithRetry, claimGeneralDailyGmWithRetry, mergeGeneralStreak } from "./gm-streak-merge.js";

const backfillBody = z.object({
  chainKey: z.string().trim().min(1).optional(),
  fromDay: z.string().optional(),
  toDay: z.string().optional(),
});

function parseUtcDay(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN;
  const date = new Date(day + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? date.getTime() : NaN;
}

const STATUS_ONCHAIN_CACHE_TTL_MS = 5 * 60 * 1000;
const statusOnchainCache = createTtlCache<boolean>(STATUS_ONCHAIN_CACHE_TTL_MS);

function statusOnchainCacheKey(chainKey: string, address: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${canonicalChainKey(chainKey)}:${address.toLowerCase()}:${day}`;
}

function getStatusOnchainCache(key: string): boolean | undefined {
  return statusOnchainCache.get(key);
}

function setStatusOnchainCache(key: string, value: boolean): void {
  statusOnchainCache.set(key, value);
}

export async function registerGmOnchainRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  deps: GmHelpersDeps & {
    startOfUtcDay: (date: Date) => Date;
    getChainRpc: (chainKey: string) => string | undefined;
    getChainRpcs: (chainKey: string) => string[] | undefined;
    checkStreakBadges: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">, userId: string, streak: number) => Promise<void>;
    addReferralBonus: (userId: string, pointsEarned: number) => Promise<void>;
    isAdminAuthorized: (req: { headers: Record<string, string | string[] | undefined> }) => boolean;
    GM_EVENT_SIG: string;
  },
) {
  const { startOfUtcDay, getChainRpc, getChainRpcs, checkStreakBadges, GM_EVENT_SIG } = deps;
  const { rpcJson } = createGmHelpers(deps);

  // On-chain GM (multi-chain, once per day general + per-chain tracking)
  app.post("/api/gm/onchain", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });

    const { GmOnchainBodySchema } = await import("../schemas.js");
    const onchainParsed = GmOnchainBodySchema.safeParse(req.body);
    if (!onchainParsed.success) return reply.code(400).send({ error: "missing_tx_hash" });
    const txHash = onchainParsed.data.txHash.toLowerCase();
    const chainKey = canonicalChainKey(onchainParsed.data.chainKey);
    const gmContractAddress = onchainParsed.data.contractAddress?.toLowerCase();
    // GM_FACTORIES is the single source of truth for "GM is possible on this chain":
    // a chain whose factory was retired (Gravity 1625, ...) is refused like on the
    // other GM routes, before any DB or RPC work.
    if (!getFactory(chainKey)) return reply.code(400).send({ error: "unsupported_chain", chainKey });
    const rpcUrl = getChainRpc(chainKey);
    if (!rpcUrl) return reply.code(400).send({ error: "unsupported_chain", chainKey });

    // Resolve GM contract: use provided contractAddress if available, else fallback to platform
    let gmContract: { id: string; contractAddress: string; chainKey: string } | null = null;
    if (gmContractAddress) {
      try {
        // Case-insensitive: legacy rows may store chainKey in lowercase, while
        // chainKey is now canonical (UPPERCASE). The composite unique is
        // case-sensitive in Postgres, so a plain findUnique would miss them.
        gmContract = await prisma.gmContract.findFirst({
          where: { chainKey: { equals: chainKey, mode: "insensitive" }, contractAddress: gmContractAddress },
        });
      } catch (e) { console.error("gmContract.findFirst DB error:", (e as Error).message || String(e)); /* ignore */ }
    }
    if (!gmContract) {
      gmContract = await prisma.gmContract.findFirst({
        where: { chainKey: { equals: chainKey, mode: "insensitive" }, ownerId: null },
      });
    }
    if (!gmContract) return reply.code(400).send({ error: "no_gm_contract_for_chain", chainKey });

    // Verify TX on-chain — try all RPCs concurrently, retry up to 3 times
    let txVerified = false;
    const rpcs = getChainRpcs(chainKey) ?? [rpcUrl];
    const receiptRequest = {
      jsonrpc: "2.0", id: 1,
      method: "eth_getTransactionReceipt",
      params: [txHash],
    };
    type GmReceipt = { from: string; to: string; logs: Array<{ address: string; topics: string[]; data: string }>; status: string };
    const fetchReceipts = () => rpcs.map((rpc) => async (outer: AbortSignal): Promise<GmReceipt | null> => {
      const { signal, clear } = signalWithTimeout(outer, 8000);
      try {
        const resp = await safeFetch(rpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(receiptRequest),
          signal,
        });
        if (!resp.ok) return null;
        const data = await resp.json() as { result?: GmReceipt };
        return data.result ?? null;
      } catch { return null; } finally { clear(); }
    });

    let receipt: { from: string; to: string; logs: Array<{ address: string; topics: string[]; data: string }>; status: string } | null | undefined;
    // B3 and some newer chains have slow receipt indexing. Retry up to 10 times
    // with progressive backoff (0s, 1.5s, 4s, 6.5s, 9s, 11.5s, 14s, 16.5s, 19s, 21.5s ≈ 2 min
    // in total, as before). Each attempt keeps the PRIORITY order of the RPC list (rpcs[0] is the
    // most trusted): it settles with the first successful receipt in that order, so a fast
    // secondary RPC can never override a slower primary one, while a fast primary settles it
    // without waiting for the slowest RPC (up to 8 s each).
    for (let attempt = 0; attempt < 10; attempt++) {
      const { accepted, settled } = await firstAccepted(fetchReceipts(), (r) => r.status === "0x1");
      receipt = accepted ?? settled.find((r) => r != null);
      if (receipt?.status === "0x1") break;
      if (attempt < 9) await new Promise(r => setTimeout(r, 1500 + attempt * 2500));
    }

    if (receipt && receipt.status === "0x1") {
      const userAddr = (req.user!.address ?? "").toLowerCase();
      // Bind the credited GM to a tx the user actually SENT. Without this, a
      // malicious registered contract could emit a forged GmCheckedIn(victim,…)
      // event and mint GM credit + arbitrary tip for another user.
      const sentByUser = receipt.from?.toLowerCase() === userAddr;
      if (sentByUser && receipt.to?.toLowerCase() === gmContract.contractAddress.toLowerCase()) {
        const userTopic = "0x000000000000000000000000" + userAddr.slice(2);
        const gmLog = receipt.logs.find((log) =>
          log.address.toLowerCase() === gmContract.contractAddress.toLowerCase() &&
          log.topics[0] === GM_EVENT_SIG &&
          log.topics[1]?.toLowerCase() === userTopic
        );
        if (gmLog) {
          const rawData = gmLog.data ?? "0x0";
          const eventTs = parseInt(rawData.slice(0, 66), 16);
          const tipHex = "0x" + rawData.slice(-64);
          const tipWei = BigInt(tipHex);
          if (tipWei <= 0n) {
            return reply.code(400).send({ error: "invalid_tip", message: "Invalid tip amount detected." });
          }
          txVerified = true;
          (req as unknown as Record<string, unknown>)["_gmTipWei"] = tipWei.toString();
          if (Number.isFinite(eventTs) && eventTs > 0) {
            (req as unknown as Record<string, unknown>)["_gmEventCreatedAt"] = new Date(eventTs * 1000);
          }
        }
      }
    }

    if (!txVerified) {
      return reply.code(400).send({ error: "tx_verification_failed", message: "Transaction could not be verified on-chain. Please wait for confirmation and retry." });
    }

    const now = new Date();

    // Wrap all DB writes in a transaction: anti-replay, score, streak, badges
    const tipWei = (req as unknown as Record<string, unknown>)["_gmTipWei"] as string | undefined;
    let result: {
      streak: number; longestStreak: number; chainKey: string; chainStreak: number; chainLongest: number;
      scoreGain: number; totalScore: number; onChain: boolean; txVerified: boolean;
      alreadyGeneralGm: boolean; alreadyChainGm: boolean;
      tipWei: string;
    };
    try {
      result = await prisma.$transaction(async (tx) => {
        // User row lock first: every on-chain GM of a user is serialized and takes its locks in one order
        // (users, then user_chain_gms). Without it, a late GM whose general bonus was already paid locked the
        // chain row before the user row, and a same-day GM did the reverse: deadlock, then a 500.
        // NO KEY UPDATE, not UPDATE: it still serializes these POSTs, but does not block the foreign-key check
        // (KEY SHARE) of a concurrent user_chain_gms insert by the backfill, which could otherwise deadlock
        // against this transaction on the (userId, chainKey) unique index.
        await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${req.user!.id} FOR NO KEY UPDATE`;
        const gmTipWei = (req as unknown as Record<string, unknown>)["_gmTipWei"] as string | undefined;
        const gmEventCreatedAt = (req as unknown as Record<string, unknown>)["_gmEventCreatedAt"] as Date | undefined;
        // Score against the day the GM actually happened on-chain (decoded from
        // the GmCheckedIn event), not the day the API call lands. A late
        // submission uses the same UTC claims as backfill: each bonus is
        // available only if the event day strictly follows its last claim.
        // One fixed date per GM, also the stored createdAt (P1-GM-SERIE-SUIVIS-20261114, defect 3): an event at
        // most GM_CLOCK_MARGIN_MS ahead of our clock (chain clock drift) keeps its own time and day, so a GM
        // mined at 00:00:01 is never moved back to the previous day; anything further ahead is not a usable
        // date and counts as now. The stored date never changes afterwards, so a GM is never counted on two days.
        const gmDate = gmEventCreatedAt && gmEventCreatedAt.getTime() <= now.getTime() + GM_CLOCK_MARGIN_MS ? gmEventCreatedAt : now;
        const scoringDay = startOfUtcDay(gmDate);
        // Anti-replay: the (chainKey, txHash) unique is case-sensitive in
        // Postgres, so a legacy lowercase row would NOT collide with a new
        // canonical (UPPERCASE) insert. Pre-check case-insensitively to block
        // replays of GMs recorded before chainKey canonicalization.
        const replay = await tx.onchainGm.findFirst({
          where: { txHash, chainKey: { equals: chainKey, mode: "insensitive" } },
          select: { id: true },
        });
        if (replay) throw new Error("tx_already_used");
        try {
          await tx.onchainGm.create({
            data: { userId: req.user!.id, txHash, chainKey, contractId: gmContract.id, tipWei: gmTipWei ?? "0", createdAt: gmDate },
          });
        } catch {
          throw new Error("tx_already_used");
        }

        const firstRead = await tx.user.findUnique({ where: { id: req.user!.id } });
        if (!firstRead) throw new Error("user_not_found");
        let user = firstRead;

        // --- General GM streak (once per day across all chains) ---
        // Lecture, calcul, reclamation atomique ; sur perte de la reclamation sans que le jour soit pris
        // (reparation ou GM gratuit concurrent), relecture et recalcul (3 tours), puis transaction annulee
        // (anti-rejeu compris) pour permettre une nouvelle soumission. Voir gm-streak-merge.ts.
        const general = await claimGeneralDailyGmWithRetry({ tx, userId: req.user!.id, initial: user, scoringDay, gmDate });
        user = general.user;
        const generalStreak = general.generalStreak;
        const generalLongest = general.generalLongest;
        let scoreGain = general.scoreGain;
        const alreadyGeneralGm = general.alreadyGeneralGm;
        if (general.claimed) await checkStreakBadges(tx, user.id, generalStreak);

        // --- Per-chain GM tracking ---
        // Same scoring day and UTC rules as the general claim, compare-and-set write (see gm-streak-merge.ts).
        const chain = await claimChainDailyGmWithRetry({ tx, userId: user.id, chainKey, scoringDay, gmDate });
        const chainStreak = chain.chainStreak;
        const chainLongest = chain.chainLongest;
        const chainScoreGain = chain.scoreGain;
        const alreadyChainGm = chain.alreadyChainGm;

        if (chainScoreGain > 0) {
          scoreGain += chainScoreGain;
          await tx.user.update({
            where: { id: user.id },
            data: { score: { increment: chainScoreGain } },
          });
        }

        const updatedUser = await tx.user.findUnique({ where: { id: user.id } });
        return {
          streak: generalStreak,
          longestStreak: generalLongest,
          chainKey,
          chainStreak,
          chainLongest,
          scoreGain,
          totalScore: updatedUser?.score ?? user.score,
          onChain: true,
          txVerified,
          alreadyGeneralGm,
          alreadyChainGm,
          tipWei: tipWei ?? "0",
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === "tx_already_used") {
        return reply.code(400).send({ error: "duplicate_tx" });
      }
      if (error instanceof Error && error.message === "user_not_found") {
        return reply.code(404).send({ error: "user_not_found" });
      }
      if (error instanceof Error && error.message === "gm_conflict") {
        // Transaction annulee (anti-rejeu compris) : le client peut soumettre de nouveau.
        return reply.code(409).send({ error: "gm_conflict" });
      }
      throw error;
    }

    // Reconcile recorded GMs after commit. Unrecorded transactions must go
    // through a scoring transaction before they can enter the anti-replay table.
    try {
      const userAddr = (req.user!.address ?? "").toLowerCase();
      if (userAddr) {
        const rebuilt = await rebuildChainStreakFromOnchain(
          { prisma, getChainRpcs, GM_EVENT_SIG, rpcJson },
          req.user!.id, userAddr, chainKey, { recordedOnly: true },
        );
        result.chainStreak = rebuilt.currentStreak;
        result.chainLongest = Math.max(rebuilt.longestStreak, result.chainLongest);

        // Reconcile general streak from on-chain events. The per-chain rebuild
        // may have discovered prior GMs on other chains that should contribute
        // to the general streak (user.gmStreak / longestStreak / lastGmDate).
        // Without this, the general streak can diverge from on-chain reality.
        // Rows further ahead than the clock margin (stored before the on-chain timestamp was capped) are left
        // out: their latest date would become lastGmDate, and every general GM until that date would be refused
        // as already done. Every other row keeps its own fixed date (never re-capped).
        const futureLimit = Date.now() + GM_CLOCK_MARGIN_MS;
        const allGms = (await prisma.onchainGm.findMany({
          where: { userId: req.user!.id },
          select: { createdAt: true },
        })).filter((g) => g.createdAt.getTime() <= futureLimit);
        if (allGms.length > 0) {
          const DAY_MS = 86_400_000;
          const dayMsSet = new Set<number>(allGms.map((g) => {
            const d = new Date(g.createdAt);
            d.setUTCHours(0, 0, 0, 0);
            return d.getTime();
          }));
          const days = [...dayMsSet].sort((a, b) => a - b);
          const lastDay = days[days.length - 1]!;
          const latestTs = allGms.reduce((max, g) => Math.max(max, new Date(g.createdAt).getTime()), 0);

          // Compute longest streak across all days
          let longest = 0;
          let run = 0;
          let prevDay = -1;
          for (const d of days) {
            if (prevDay !== -1 && d === prevDay + DAY_MS) run += 1;
            else run = 1;
            if (run > longest) longest = run;
            prevDay = d;
          }

          // Compute current streak (only if last day is today or yesterday)
          const todayMs = (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); })();
          const yesterdayMs = todayMs - DAY_MS;
          let currentStreak = 0;
          if (lastDay === todayMs || lastDay === yesterdayMs) {
            let expected = lastDay;
            for (let i = days.length - 1; i >= 0; i--) {
              const d = days[i]!;
              if (d === expected) { currentStreak++; expected -= DAY_MS; }
              else if (d < expected) break;
            }
          }

          // Only update if values differ (avoid unnecessary writes)
          // Les GM gratuits (bouton) n'ont pas de ligne par jour : la serie recalculee depuis les seuls
          // GM en chaine ne doit jamais baisser une serie stockee encore valide. Ecriture par comparaison
          // atomique : un GM gratuit concurrent n'est jamais ecrase.
          const { merged, applied } = await applyMergedStreak({
            store: prisma,
            userId: req.user!.id,
            compute: (stored) => mergeGeneralStreak({ computedStreak: currentStreak, computedLongest: longest, latestEventMs: latestTs, stored }),
          });
          if (applied) {
            result.streak = merged.gmStreak;
            result.longestStreak = merged.longestStreak;
          }
        }
      }
    } catch (e) {
      console.error("gm.selfHeal failed:", (e as Error).message || String(e));
    }

    return result;
  });

  // Check on-chain GM status for a given wallet + chain (bypasses DB, works on fresh deploys)
  app.get("/api/gm/status-onchain", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const userAddr = (req.user.address ?? "").toLowerCase();
    const { GmStatusOnchainQuerySchema } = await import("../schemas.js");
    const statusOnchainParsed = GmStatusOnchainQuerySchema.safeParse(req.query);
    if (!statusOnchainParsed.success) return reply.code(400).send({ error: "invalid_query" });
    const { chain: chainQuery, address: addressQuery } = statusOnchainParsed.data;
    if (addressQuery.toLowerCase() !== userAddr && !deps.isAdminAuthorized(req)) {
      return reply.code(403).send({ error: "address_mismatch" });
    }
    const address = addressQuery.toLowerCase();
    const cacheKey = statusOnchainCacheKey(chainQuery, address);
    const cached = getStatusOnchainCache(cacheKey);
    if (cached !== undefined) return { chainGmDone: cached };

    const factory = getFactory(chainQuery);
    if (!factory) return reply.code(400).send({ error: "unsupported_chain" });
    const rpcs = getChainRpcs(chainQuery);
    if (!rpcs?.length) return reply.code(400).send({ error: "no_rpc" });

    try {
      // Enumerate factory contracts
      const contracts: string[] = [];
      const countData = await rpcJson<{ result?: string }>(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: factory.address, data: "0x9399869d" }, "latest"] });
      const count = parseInt(countData?.result || "0x0", 16);
      for (let i = 0; i < Math.min(count, 20); i++) {
        const addrData = await rpcJson<{ result?: string }>(rpcs, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: factory.address, data: "0x474da79a" + i.toString(16).padStart(64, "0") }, "latest"] });
        if (!addrData?.result || addrData.result === "0x") continue;
        contracts.push("0x" + addrData.result.slice(26));
      }

      if (contracts.length === 0) {
        setStatusOnchainCache(cacheKey, false);
        return { chainGmDone: false };
      }

      // Ask every contract for `lastGmTimestamp(address)` — the exact value the
      // contract's own once-a-day guard reads — and keep the newest.
      //
      // This replaces an eth_getLogs scan of the last 10k blocks. That window is
      // not a day on fast chains (Arc ~0.5s blocks → barely an hour), and some
      // RPCs reject the 10k span outright (Arc: "requested range too large",
      // erc-39000 / -32012), so the on-chain reconcile always returned false
      // there and the GM button could stay enabled after a GM was already done.
      // O(contracts) eth_calls is exact and chain-independent.
      const paddedUser = "0x000000000000000000000000" + address.slice(2);
      const lastGmCallData = "0xadb28e69" + paddedUser.slice(2); // lastGmTimestamp(address)
      const todayStart = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);

      let gmDone = false;
      for (const contract of contracts) {
        const tsData = await rpcJson<{ result?: string }>(rpcs, {
          jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to: contract, data: lastGmCallData }, "latest"],
        });
        if (typeof tsData?.result !== "string" || tsData.result === "0x") continue;
        try {
          // lastGmTimestamp is a uint256 but always a unix seconds value.
          if (Number(BigInt(tsData.result)) >= todayStart) { gmDone = true; break; }
        } catch { /* malformed result — treat as no GM */ }
      }

      setStatusOnchainCache(cacheKey, gmDone);
      return { chainGmDone: gmDone };
    } catch (e) {
      console.error("GM status-onchain RPC error:", (e as Error).message || String(e));
      return { chainGmDone: false };
    }
   });

  // Replay verified GMs for the authenticated account in a bounded UTC window.
  app.post("/api/gm/backfill", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    if (!deps.isAdminAuthorized(req)) return reply.code(401).send({ error: "admin_required" });
    const { id: userId, address } = req.user;
    const userAddr = (address ?? "").toLowerCase();
    if (!userAddr) return reply.code(400).send({ error: "no_address" });

    const parsed = backfillBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const { chainKey, fromDay, toDay } = parsed.data;
    if (!fromDay || !toDay) return reply.code(400).send({ error: "window_required" });
    const fromMs = parseUtcDay(fromDay);
    const toMs = parseUtcDay(toDay);
    const nowMs = Date.now();
    const dayMs = 86_400_000;
    const today = startOfUtcDay(new Date(nowMs)).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs
      || toMs - fromMs > 31 * dayMs || toMs > today + dayMs) {
      return reply.code(400).send({ error: "invalid_window" });
    }

    const requested = chainKey === undefined ? undefined : canonicalChainKey(chainKey);
    const supported = [...new Set(Object.keys(deps.FACTORIES).map(canonicalChainKey))];
    if (requested !== undefined && !supported.includes(requested)) {
      return reply.code(400).send({ error: "unsupported_chain" });
    }
    const chains = (requested === undefined ? supported : [requested]).map((key) => ({
      chainKey: key, insertedPaid: 0, alreadyPresent: 0, ignoredOlder: 0,
      insertedUnpaid: 0, legacyConflict: 0, rpcErrors: 0, scoreDelta: 0,
    }));
    const candidates: BackfillCandidate[] = [];
    let scoreDelta = 0;
    let outcome = "failed";
    try {
      for (const summary of chains) {
        try {
          candidates.push(...await scanGmBackfillCandidates(
            { prisma, getChainRpcs, GM_EVENT_SIG, rpcJson }, summary.chainKey, userAddr,
            deps.getChainMaxLogRange?.(summary.chainKey), fromMs, toMs, nowMs,
          ));
        } catch (error) {
          if (!(error instanceof GmBackfillRpcError)) throw error;
          summary.rpcErrors++;
        }
      }
      // An incomplete scan may hide an earlier candidate. Do not advance any claim.
      if (chains.some((chain) => chain.rpcErrors)) {
        outcome = "rpc_incomplete";
        return reply.code(503).send({ error: "rpc_incomplete", chains, scoreDelta });
      }

      // Pre-flight: a legacy chain row (other case) for a chain with candidates refuses the whole batch before
      // any write. It must be migrated first; skipping its candidates could let a later GM close their day.
      const candidateChains = [...new Set(candidates.map((c) => c.chainKey))];
      if (candidateChains.length) {
        const legacy = await prisma.userChainGm.findMany({
          where: { userId, OR: candidateChains.map((key) => ({ chainKey: { equals: key, mode: "insensitive" as const } })) },
          select: { chainKey: true },
        });
        const legacyKeys = legacy.filter((row) => !candidateChains.includes(row.chainKey)).map((row) => canonicalChainKey(row.chainKey));
        if (legacyKeys.length) {
          for (const summary of chains) if (legacyKeys.includes(summary.chainKey)) summary.legacyConflict++;
          outcome = "legacy_chain_row";
          return reply.code(409).send({ error: "legacy_chain_row", chains, scoreDelta });
        }
      }

      candidates.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        || a.chainKey.localeCompare(b.chainKey) || a.txHash.localeCompare(b.txHash));
      for (const { chainKey, txHash, contractId, createdAt, tipWei } of candidates) {
        const summary = chains.find((entry) => entry.chainKey === chainKey)!;
        const scoringDay = startOfUtcDay(createdAt);
        const result = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR NO KEY UPDATE`;
          const initial = await tx.user.findUniqueOrThrow({ where: { id: userId } });
          const replay = await tx.onchainGm.findFirst({
            where: { txHash: { equals: txHash, mode: "insensitive" }, chainKey: { equals: chainKey, mode: "insensitive" } },
            select: { id: true },
          });
          if (replay) return { bucket: "alreadyPresent", gain: 0 } as const;

          const chainRows = await tx.userChainGm.findMany({
            where: { userId, chainKey: { equals: chainKey, mode: "insensitive" } },
            select: { chainKey: true, lastGmDate: true },
          });
          // Legacy rows are refused before the batch (pre-flight below). One created meanwhile stops the batch
          // here, before any write: skipping it could let a later GM close this older day's general bonus.
          if (chainRows.some((row) => row.chainKey !== chainKey)) throw new Error("legacy_chain_row");
          const older = [initial.lastGmDate, chainRows[0]?.lastGmDate].some(
            (date) => date && startOfUtcDay(date).getTime() > scoringDay.getTime(),
          );

          const { count } = await tx.onchainGm.createMany({
            data: [{ userId, chainKey, txHash, contractId, createdAt, tipWei }],
            skipDuplicates: true,
          });
          if (!count) return { bucket: "alreadyPresent", gain: 0 } as const;

          const general = await claimGeneralDailyGmWithRetry({
            tx, userId, initial, scoringDay, gmDate: createdAt,
          });
          if (general.claimed) await checkStreakBadges(tx, userId, general.generalStreak);
          const chain = await claimChainDailyGmWithRetry({ tx, userId, chainKey, scoringDay, gmDate: createdAt });
          if (chain.scoreGain > 0) {
            await tx.user.update({ where: { id: userId }, data: { score: { increment: chain.scoreGain } } });
          }
          const gain = general.scoreGain + chain.scoreGain;
          return { bucket: gain > 0 ? "insertedPaid" : older ? "ignoredOlder" : "insertedUnpaid", gain } as const;
        });
        summary[result.bucket]++;
        summary.scoreDelta += result.gain;
        scoreDelta += result.gain;
      }
      outcome = "ok";
      return { chains, scoreDelta };
    } catch (error) {
      if (error instanceof Error && error.message === "legacy_chain_row") {
        outcome = "legacy_chain_row";
        return reply.code(409).send({ error: "legacy_chain_row", chains, scoreDelta });
      }
      if (error instanceof Error && error.message === "gm_conflict") {
        outcome = "gm_conflict";
        return reply.code(409).send({ error: "gm_conflict", chains, scoreDelta });
      }
      throw error;
    } finally {
      console.info("gm.backfill", { fromDay, toDay, chains, scoreDelta, outcome });
    }
  });
}
