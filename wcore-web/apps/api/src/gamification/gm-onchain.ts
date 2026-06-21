import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@wcore/db";
import { assertPublicHttp } from "../lib/safe-http.js";
import { canonicalChainKey, getFactory } from "@wcore/shared";
import type { GmHelpersDeps } from "./gm-helpers.js";
import { createGmHelpers } from "./gm-helpers.js";
import { rebuildChainStreakFromOnchain } from "./gm-streak-rebuild.js";

const STATUS_ONCHAIN_CACHE_TTL_MS = 5 * 60 * 1000;
const statusOnchainCache = new Map<string, { value: boolean; expiresAt: number }>();

function statusOnchainCacheKey(chainKey: string, address: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${canonicalChainKey(chainKey)}:${address.toLowerCase()}:${day}`;
}

function getStatusOnchainCache(key: string): boolean | undefined {
  const cached = statusOnchainCache.get(key);
  if (!cached) return undefined;
  if (Date.now() > cached.expiresAt) {
    statusOnchainCache.delete(key);
    return undefined;
  }
  return cached.value;
}

function setStatusOnchainCache(key: string, value: boolean): void {
  statusOnchainCache.set(key, { value, expiresAt: Date.now() + STATUS_ONCHAIN_CACHE_TTL_MS });
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
  const { startOfUtcDay, getChainRpc, getChainRpcs, checkStreakBadges, GM_EVENT_SIG, getChainMaxLogRange } = deps;
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
    const fetchReceipts = () => rpcs.map(async (rpc) => {
      try {
        assertPublicHttp(rpc);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch(rpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(receiptRequest),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!resp.ok) return null;
        const data = await resp.json() as { result?: { from: string; to: string; logs: Array<{ address: string; topics: string[]; data: string }>; status: string } };
        return data.result ?? null;
      } catch { return null; }
    });

    let receipt: { from: string; to: string; logs: Array<{ address: string; topics: string[]; data: string }>; status: string } | null | undefined;
    // B3 and some newer chains have slow receipt indexing. Retry up to 10 times
    // with progressive backoff (0s, 5s, 7s, 9s, 11s, 13s, 15s, 17s, 19s, 21s ≈ 2 min).
    for (let attempt = 0; attempt < 10; attempt++) {
      const results = await Promise.all(fetchReceipts());
      receipt = results.find((r) => r?.status === "0x1") ?? results.find((r) => r != null);
      if (receipt?.status === "0x1") break;
      if (attempt < 9) await new Promise(r => setTimeout(r, 5000 + attempt * 2000));
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
    const today = startOfUtcDay(now);

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
        const gmTipWei = (req as unknown as Record<string, unknown>)["_gmTipWei"] as string | undefined;
        const gmEventCreatedAt = (req as unknown as Record<string, unknown>)["_gmEventCreatedAt"] as Date | undefined;
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
            data: { userId: req.user!.id, txHash, chainKey, contractId: gmContract.id, tipWei: gmTipWei ?? "0", ...(gmEventCreatedAt ? { createdAt: gmEventCreatedAt } : {}) },
          });
        } catch {
          throw new Error("tx_already_used");
        }

        const user = await tx.user.findUnique({ where: { id: req.user!.id } });
        if (!user) throw new Error("user_not_found");

        let generalStreak = user.gmStreak;
        let generalLongest = user.longestStreak;
        let scoreGain = 0;
        let alreadyGeneralGm = false;

        // --- General GM streak (once per day across all chains) ---
        if (user.lastGmDate) {
          const lastGmDay = startOfUtcDay(new Date(user.lastGmDate));
            if (lastGmDay.getTime() >= today.getTime()) {
              alreadyGeneralGm = true;
            } else {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            if (lastGmDay.getTime() >= yesterday.getTime()) {
              generalStreak = user.gmStreak + 1;
              generalLongest = Math.max(generalStreak, user.longestStreak);
              scoreGain += 20 + (generalStreak > 1 ? generalStreak * 2 : 0);
            } else {
              generalStreak = 1;
              generalLongest = Math.max(1, user.longestStreak);
              scoreGain += 20;
            }
          }
        } else {
          generalStreak = 1;
          generalLongest = 1;
          scoreGain += 20;
        }

        if (!alreadyGeneralGm) {
          await tx.user.update({
            where: { id: user.id },
            data: { gmStreak: generalStreak, longestStreak: generalLongest, lastGmDate: now, score: { increment: scoreGain } },
          });
          await checkStreakBadges(tx, user.id, generalStreak);
        } else {
          await tx.user.update({
            where: { id: user.id },
            data: { score: { increment: scoreGain } },
          });
        }

        // --- Per-chain GM tracking ---
        const chainGm = await tx.userChainGm.findUnique({
          where: { userId_chainKey: { userId: user.id, chainKey } },
        });

        let chainStreak = chainGm?.gmStreak ?? 0;
        let chainLongest = chainGm?.longestStreak ?? 0;
        let chainScoreGain = 0;
        let alreadyChainGm = false;

        if (chainGm && chainGm.lastGmDate) {
          const lastChainDay = startOfUtcDay(new Date(chainGm.lastGmDate));
          if (lastChainDay.getTime() >= today.getTime()) {
            alreadyChainGm = true;
          } else {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            if (lastChainDay.getTime() >= yesterday.getTime()) {
              chainStreak = chainGm.gmStreak + 1;
            } else {
              chainStreak = 1;
            }
            chainLongest = Math.max(chainStreak, chainGm.longestStreak);
            chainScoreGain = 5 + (chainStreak > 1 ? chainStreak : 0);
          }
        } else {
          chainStreak = 1;
          chainLongest = 1;
          chainScoreGain = 5;
        }

        if (!alreadyChainGm && chainStreak > 0) {
          const data = {
            lastGmDate: now,
            gmStreak: chainStreak,
            longestStreak: chainLongest,
          };
          if (chainGm) {
            await tx.userChainGm.update({ where: { id: chainGm.id }, data });
          } else {
            await tx.userChainGm.create({ data: { userId: user.id, chainKey, ...data } });
          }
        }

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
      throw error;
    }

    // Self-heal: reconcile per-chain streak from on-chain events. Idempotent —
    // backfills any prior GMs that bypassed this endpoint (direct on-chain
    // calls, failed verifications, etc.). Runs after the DB transaction so the
    // just-inserted OnchainGm row is visible even if the chain RPC hasn't
    // indexed the new event yet.
    try {
      const userAddr = (req.user!.address ?? "").toLowerCase();
      if (userAddr) {
        const rebuilt = await rebuildChainStreakFromOnchain(
          { prisma, getChainRpcs, GM_EVENT_SIG, rpcJson },
          req.user!.id, userAddr, chainKey,
        );
        result.chainStreak = rebuilt.currentStreak;
        result.chainLongest = Math.max(rebuilt.longestStreak, result.chainLongest);

        // Reconcile general streak from on-chain events. The per-chain rebuild
        // may have discovered prior GMs on other chains that should contribute
        // to the general streak (user.gmStreak / longestStreak / lastGmDate).
        // Without this, the general streak can diverge from on-chain reality.
        const allGms = await prisma.onchainGm.findMany({
          where: { userId: req.user!.id },
          select: { createdAt: true },
        });
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
          const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { gmStreak: true, longestStreak: true },
          });
          if (user && (currentStreak !== user.gmStreak || longest > user.longestStreak)) {
            await prisma.user.update({
              where: { id: req.user!.id },
              data: {
                gmStreak: currentStreak,
                longestStreak: Math.max(longest, user.longestStreak),
                lastGmDate: new Date(latestTs),
              },
            });
            result.streak = currentStreak;
            result.longestStreak = Math.max(longest, user.longestStreak);
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

      // Check GmCheckedIn events from ALL contracts for this address today
      const gmEventSig = GM_EVENT_SIG;
      const paddedUser = "0x000000000000000000000000" + address.slice(2);
      const todayStart = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);

      // Get recent blocks (last 10k covers ~1 day on most chains), chunked by
      // RPC.MAX_LOG_RANGE. Moonriver/Moonbeam official RPCs reject 10k-block
      // eth_getLogs queries with -32603 "block range is too wide".
      const bnData2 = await rpcJson<{ result?: string }>(rpcs, { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" });
      const latestBlock = parseInt(bnData2?.result || "0x0", 16);
      const targetFromBlock = Math.max(0, latestBlock - 10000);
      const rangeLimit = getChainMaxLogRange?.(chainQuery);
      const chunkSize = rangeLimit && rangeLimit > 0 ? Math.min(rangeLimit, 10000) : 10000;
      const logs: Array<{ data: string }> = [];

      for (let to = latestBlock; to > targetFromBlock; to -= chunkSize) {
        const from = Math.max(targetFromBlock, to - chunkSize);
        const logsData = await rpcJson<{ result?: Array<{ data: string }> }>(rpcs, {
          jsonrpc: "2.0", id: 1, method: "eth_getLogs",
          params: [{
            address: contracts,
            fromBlock: "0x" + from.toString(16),
            toBlock: "0x" + to.toString(16),
            topics: [gmEventSig, paddedUser],
          }],
        });
        if (logsData?.result?.length) logs.push(...logsData.result);
        if (logs.length > 0) break;
      }
      if (logs.length === 0) {
        setStatusOnchainCache(cacheKey, false);
        return { chainGmDone: false };
      }

      // Check if any event has timestamp >= today
      let gmDone = false;
      for (const log of logs) {
        const tsHex = log.data.slice(0, 66); // first 32 bytes = timestamp
        const eventTs = parseInt(tsHex, 16);
        if (eventTs >= todayStart) { gmDone = true; break; }
      }

      setStatusOnchainCache(cacheKey, gmDone);
      return { chainGmDone: gmDone };
    } catch (e) {
      console.error("GM status-onchain RPC error:", (e as Error).message || String(e));
      return { chainGmDone: false };
    }
   });

  // Backfill GM state from on-chain truth. Rebuilds OnchainGm rows,
  // UserChainGm.gmStreak/longestStreak per chain, user.gmStreak/
  // longestStreak/lastGmDate (general, across all chains), AND adds the
  // missing score for GMs that were never counted. Body: { chainKey?: string }
  // — when omitted, every factory-supported chain is processed.
  app.post("/api/gm/backfill", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    if (!deps.isAdminAuthorized(req)) return reply.code(401).send({ error: "admin_required" });
    const userAddr = (req.user.address ?? "").toLowerCase();
    if (!userAddr) return reply.code(400).send({ error: "no_address" });

    const body = (req.body ?? {}) as { chainKey?: string };
    const chainKeys: string[] = body.chainKey
      ? [canonicalChainKey(body.chainKey)]
      : Object.keys(deps.FACTORIES).map(canonicalChainKey);

    const helperDeps = { prisma, getChainRpcs, GM_EVENT_SIG, rpcJson };
    type ChainResult = Awaited<ReturnType<typeof rebuildChainStreakFromOnchain>>;
    const perChain: ChainResult[] = [];
    const errors: Array<{ chainKey: string; error: string }> = [];
    for (const ck of chainKeys) {
      try {
        const r = await rebuildChainStreakFromOnchain(helperDeps, req.user.id, userAddr, ck);
        perChain.push(r);
      } catch (e) {
        errors.push({ chainKey: ck, error: (e as Error).message || String(e) });
      }
    }

    // ── Score + general streak reconciliation ─────────────────────────────
    // Per-chain score delta: walk each chain's events chronologically,
    // maintain the chain streak, and credit the scoring formula for events
    // that were newly inserted in this run only.
    const DAY_MS = 86_400_000;
    let scoreDelta = 0;
    for (const c of perChain) {
      let lastChainDay = -1;
      let chainStreak = 0;
      for (const e of c.events) {
        if (e.dayMs === lastChainDay) continue; // same day, no new chain credit
        if (lastChainDay !== -1 && e.dayMs === lastChainDay + DAY_MS) chainStreak += 1;
        else chainStreak = 1;
        lastChainDay = e.dayMs;
        if (e.wasInserted) {
          scoreDelta += 5 + (chainStreak > 1 ? chainStreak : 0);
        }
      }
    }

    // General streak (one increment per UTC day across all chains): merge all
    // events, sort, dedupe by day. For each new day, if any event that day
    // was newly inserted, credit the general scoring formula at that day's
    // running general streak.
    type FlatEvent = { ts: number; dayMs: number; wasInserted: boolean };
    const allEvents: FlatEvent[] = [];
    for (const c of perChain) for (const e of c.events) allEvents.push(e);
    allEvents.sort((a, b) => a.ts - b.ts);

    let lastGeneralDay = -1;
    let generalStreak = 0;
    let generalLongest = 0;
    let dayHadInsertion = false;
    let latestGeneralTs = 0;
    const finalizeDay = () => {
      if (dayHadInsertion) {
        scoreDelta += 20 + (generalStreak > 1 ? generalStreak * 2 : 0);
      }
    };
    for (const e of allEvents) {
      if (e.ts > latestGeneralTs) latestGeneralTs = e.ts;
      if (e.dayMs === lastGeneralDay) {
        if (e.wasInserted) dayHadInsertion = true;
        continue;
      }
      // New day → settle previous day's score.
      finalizeDay();
      if (lastGeneralDay !== -1 && e.dayMs === lastGeneralDay + DAY_MS) generalStreak += 1;
      else generalStreak = 1;
      if (generalStreak > generalLongest) generalLongest = generalStreak;
      lastGeneralDay = e.dayMs;
      dayHadInsertion = e.wasInserted;
    }
    finalizeDay();

    // Current general streak: only count if last GM day was today or yesterday.
    const today = (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime(); })();
    const yesterday = today - DAY_MS;
    let currentGeneralStreak = 0;
    if (lastGeneralDay === today || lastGeneralDay === yesterday) {
      // Walk back the deduped day list.
      const days = [...new Set(allEvents.map((e) => e.dayMs))].sort((a, b) => a - b);
      let expected = lastGeneralDay;
      for (let i = days.length - 1; i >= 0; i--) {
        const d = days[i];
        if (d === undefined) break;
        if (d === expected) { currentGeneralStreak++; expected -= DAY_MS; }
        else if (d < expected) break;
      }
    }

    // Apply user updates: score, general streak, longest, lastGmDate.
    const lastGmDate = latestGeneralTs ? new Date(latestGeneralTs * 1000) : undefined;
    if (allEvents.length > 0) {
      const existingUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { longestStreak: true },
      });
      const finalLongest = Math.max(generalLongest, existingUser?.longestStreak ?? 0);
      await prisma.user.update({
        where: { id: req.user.id },
        data: {
          score: { increment: scoreDelta },
          gmStreak: currentGeneralStreak,
          longestStreak: finalLongest,
          ...(lastGmDate ? { lastGmDate } : {}),
        },
      });
    }

    return {
      backfilled: perChain,
      errors,
      scoreDelta,
      currentGeneralStreak,
      longestGeneralStreak: generalLongest,
      lastGmDate,
    };
  });
}
