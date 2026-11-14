// Phone notification relay for the GSheet (ntfy). Apps Script egress addresses are shared and
// ntfy.sh answers them 429, so the workbook posts a closed, structured event here and the API
// composes the text and sends it from its own address.
//
// - The ntfy topic lives only in the API environment (NTFY_TOPIC); the client never chooses the
//   URL, the topic, the priority or a header, and never sends free text.
// - Content: rebalancing category, two symbols and two whole euro amounts (decision of the owner
//   on 2026-11-12, confirmed to ProjetIA; declared exception for WCORE only).
// - Deduplication is keyed on the occurrence id the workbook creates at each V->X transition and
//   reuses on every retry (never on the text, whose amounts move with prices). The key is stored
//   as an HMAC (server secret = the topic), so the table holds no amount.
// - Admission: a daily cap common to every instance, reserved in PostgreSQL under an advisory
//   lock (ops_events, type "ntfy_notify"); a reservation is "pending" until the send is confirmed.
// - The topic, the message and the ntfy answer are never logged.
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@wcore/db";
import { buildAckActionHeader } from "./gsheet-trade-ack.js";

export const NTFY_BASE_URL = "https://ntfy.sh/";
export const NTFY_TOPIC_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const NOTIFY_LOCK_KEY = 74_210_611;
const PENDING_WINDOW_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 2 * DAY_MS;
const SEND_TIMEOUT_MS = 5000;

const leg = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.$_-]{1,15}$/),
  eur: z.number().int().min(0).max(10_000_000).optional(),
}).strict();

export const notifyBodySchema = z.union([
  z.object({
    event: z.literal("strat_rebalance"),
    category: z.enum(["crypto", "action"]),
    occurrence: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    sell: leg.optional(),
    buy: leg.optional(),
  }).strict(),
  z.object({ event: z.literal("test") }).strict(),
]);

export type NotifyBody = z.infer<typeof notifyBodySchema>;
export type NotifyAdmission = "ok" | "cap" | "duplicate" | "pending" | "failed" | "unavailable";
export interface NotifyReservation {
  admission: NotifyAdmission;
  /** Transient refusal (429, 408): frees the reservation so a retry is admitted. */
  release?: () => Promise<void>;
  /** Confirmed delivery: later requests for the same occurrence are duplicates. */
  markSent?: () => Promise<void>;
  /** Permanent refusal (other 4xx): the occurrence is abandoned, never sent again. */
  markFailed?: () => Promise<void>;
}

export interface NotifyDeps {
  topic: string;
  admit: (key: string) => Promise<NotifyReservation>;
  fetchImpl?: typeof fetch;
  /** Public https base URL of this API; when set, a rebalancing notification carries a "Trade fait" button. */
  ackBaseUrl?: string;
}

function euros(n: number | undefined): string {
  if (n === undefined) return "";
  return " de " + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " €";
}

/** Text composed by the server only, from validated fields. */
export function composeNotifyText(body: NotifyBody): string {
  if (body.event === "test") return "WCORE : essai depuis le classeur, rien à faire.";
  const label = body.category === "crypto" ? "rééquilibrage Crypto à faire" : "rééquilibrage Action à faire";
  if (!body.sell || !body.buy) return "WCORE : " + label + ".";
  return "WCORE : " + label + " : alléger " + body.sell.symbol + euros(body.sell.eur)
    + ", renforcer " + body.buy.symbol + euros(body.buy.eur) + ".";
}

/** Deduplication key: HMAC of the occurrence (never of the text or the amounts). */
export function notifyKey(body: NotifyBody, topic: string): string {
  const id = body.event === "test" ? "test|" + randomUUID() : "rebalance|" + body.category + "|" + body.occurrence;
  return createHmac("sha256", topic).update(id).digest("hex").slice(0, 32);
}

/**
 * Daily cap and occurrence deduplication, shared by every instance through PostgreSQL.
 * Same occurrence already sent (24 h) = duplicate; still pending for less than 30 min = pending
 * (ambiguous earlier send: the workbook waits and retries); pending for longer = sent again.
 * Rows older than two days are purged in the same transaction.
 */
export function createPrismaNotifyAdmission(prisma: PrismaClient, dailyCap: number, now: () => number = Date.now) {
  return async (key: string): Promise<NotifyReservation> => {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe("SELECT true AS locked FROM pg_advisory_xact_lock($1)", NOTIFY_LOCK_KEY);
        const t = now();
        await tx.opsEvent.deleteMany({ where: { type: "ntfy_notify", createdAt: { lt: new Date(t - RETENTION_MS) } } });
        const recent = await tx.opsEvent.findMany({
          where: { type: "ntfy_notify", createdAt: { gte: new Date(t - DAY_MS) } },
          select: { data: true, createdAt: true },
        });
        const same = recent.filter((e) => (e.data as { h?: unknown } | null)?.h === key);
        if (same.some((e) => (e.data as { s?: unknown } | null)?.s === "sent")) return { admission: "duplicate" as const };
        if (same.some((e) => (e.data as { s?: unknown } | null)?.s === "failed")) return { admission: "failed" as const };
        if (same.some((e) => t - e.createdAt.getTime() < PENDING_WINDOW_MS)) return { admission: "pending" as const };
        if (recent.length >= dailyCap) return { admission: "cap" as const };
        const row = await tx.opsEvent.create({
          data: { type: "ntfy_notify", severity: "info", message: "", data: { h: key, s: "pending" } },
          select: { id: true },
        });
        return {
          admission: "ok" as const,
          release: async () => { try { await prisma.opsEvent.delete({ where: { id: row.id } }); } catch { /* kept: cap still holds */ } },
          markSent: async () => {
            for (let attempt = 0; attempt < 2; attempt++) {
              try { await prisma.opsEvent.update({ where: { id: row.id }, data: { data: { h: key, s: "sent" } } }); return; } catch { /* retried once */ }
            }
          },
          markFailed: async () => {
            try { await prisma.opsEvent.update({ where: { id: row.id }, data: { data: { h: key, s: "failed" } } }); } catch { /* stays pending */ }
          },
        };
      });
    } catch {
      return { admission: "unavailable" };
    }
  };
}

export type NotifyResult =
  | { status: 200; body: { ok: true; sent: boolean; duplicate?: boolean } }
  | { status: 400 | 409 | 422 | 429 | 502 | 503; body: { ok: false; error: string } };

export function notifyHeaders(body: NotifyBody, deps: Pick<NotifyDeps, "topic" | "ackBaseUrl">): Record<string, string> {
  const headers: Record<string, string> = { Title: "WCORE", Priority: "high", Tags: "warning" };
  if (body.event === "strat_rebalance" && deps.ackBaseUrl && /^https:\/\//.test(deps.ackBaseUrl)) {
    headers.Actions = buildAckActionHeader(deps.ackBaseUrl, deps.topic, body.category, body.occurrence);
  }
  return headers;
}

export async function handleNotify(raw: unknown, deps: NotifyDeps): Promise<NotifyResult> {
  if (!NTFY_TOPIC_PATTERN.test(deps.topic)) return { status: 503, body: { ok: false, error: "notify_disabled" } };
  const parsed = notifyBodySchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { ok: false, error: "invalid_body" } };
  const text = composeNotifyText(parsed.data);
  const reservation = await deps.admit(notifyKey(parsed.data, deps.topic));
  const admission = reservation.admission;
  if (admission === "cap") return { status: 429, body: { ok: false, error: "daily_cap" } };
  if (admission === "duplicate") return { status: 200, body: { ok: true, sent: false, duplicate: true } };
  if (admission === "pending") return { status: 409, body: { ok: false, error: "pending" } };
  if (admission === "failed") return { status: 422, body: { ok: false, error: "ntfy_refused" } };
  if (admission !== "ok") return { status: 503, body: { ok: false, error: "admission_unavailable" } };
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(NTFY_BASE_URL + deps.topic, {
      method: "POST",
      body: text,
      headers: notifyHeaders(parsed.data, deps),
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      // 429/408: transient refusal (nothing published), free the reservation so the next pass is
      // admitted. Other 4xx: permanent refusal, the occurrence is abandoned (422 to the workbook,
      // which stops retrying it). 5xx: ambiguous, the reservation stays pending.
      if (res.status === 429 || res.status === 408) {
        if (reservation.release) await reservation.release();
        return { status: 502, body: { ok: false, error: "ntfy_" + res.status } };
      }
      if (res.status >= 400 && res.status < 500) {
        if (reservation.markFailed) await reservation.markFailed();
        return { status: 422, body: { ok: false, error: "ntfy_refused" } };
      }
      return { status: 502, body: { ok: false, error: "ntfy_" + res.status } };
    }
    if (reservation.markSent) await reservation.markSent();
    return { status: 200, body: { ok: true, sent: true } };
  } catch {
    // Ambiguous result (timeout, network): the reservation stays pending and the cap holds; the
    // workbook retries with the same occurrence (409 for 30 min), then the text goes again.
    return { status: 502, body: { ok: false, error: "ntfy_unreachable" } };
  }
}
