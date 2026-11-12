// Phone notification relay for the GSheet (ntfy). Apps Script egress addresses are shared and
// ntfy.sh answers them 429, so the workbook posts a closed, structured event here and the API
// composes the text and sends it from its own address.
//
// - The ntfy topic lives only in the API environment (NTFY_TOPIC); the client never chooses the
//   URL, the topic, the priority or a header, and never sends free text.
// - Content: rebalancing category, two symbols and two whole euro amounts (decision of the owner
//   on 2026-11-12, who accepts that anyone knowing the topic can read them).
// - Admission: a daily cap common to every instance and a short duplicate window, reserved in
//   PostgreSQL under an advisory lock (ops_events, type "ntfy_notify", only a hash is stored).
// - The topic, the message and the ntfy answer are never logged.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@wcore/db";

export const NTFY_BASE_URL = "https://ntfy.sh/";
export const NTFY_TOPIC_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const NOTIFY_LOCK_KEY = 74_210_611;
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEND_TIMEOUT_MS = 5000;

const leg = z.object({
  symbol: z.string().regex(/^[A-Za-z0-9.$_-]{1,15}$/),
  eur: z.number().int().min(0).max(10_000_000).optional(),
}).strict();

export const notifyBodySchema = z.union([
  z.object({
    event: z.literal("strat_rebalance"),
    category: z.enum(["crypto", "action"]),
    sell: leg.optional(),
    buy: leg.optional(),
  }).strict(),
  z.object({ event: z.literal("test") }).strict(),
]);

export type NotifyBody = z.infer<typeof notifyBodySchema>;
export type NotifyAdmission = "ok" | "cap" | "duplicate" | "pending" | "unavailable";
export interface NotifyReservation {
  admission: NotifyAdmission;
  /** Clear refusal: frees the reservation so a retry is admitted. */
  release?: () => Promise<void>;
  /** Confirmed delivery: later identical requests in the window are duplicates. */
  markSent?: () => Promise<void>;
}

export interface NotifyDeps {
  topic: string;
  admit: (hash: string) => Promise<NotifyReservation>;
  fetchImpl?: typeof fetch;
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

export function notifyHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

/**
 * Daily cap and duplicate window, shared by every instance through PostgreSQL.
 * A reservation is "pending" until the send is confirmed ("sent"). In the window, an identical
 * text already sent is a duplicate; one still pending (ambiguous result) answers "pending", so
 * the workbook keeps retrying, and the text goes again once the window has passed.
 */
export function createPrismaNotifyAdmission(prisma: PrismaClient, dailyCap: number, now: () => number = Date.now) {
  return async (hash: string): Promise<NotifyReservation> => {
    try {
      return await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe("SELECT true AS locked FROM pg_advisory_xact_lock($1)", NOTIFY_LOCK_KEY);
        const t = now();
        const recent = await tx.opsEvent.findMany({
          where: { type: "ntfy_notify", createdAt: { gte: new Date(t - DAY_MS) } },
          select: { data: true, createdAt: true },
        });
        const same = recent.filter((e) => {
          const d = e.data as { h?: unknown } | null;
          return d?.h === hash && t - e.createdAt.getTime() < DUPLICATE_WINDOW_MS;
        });
        if (same.some((e) => (e.data as { s?: unknown } | null)?.s === "sent")) return { admission: "duplicate" as const };
        if (same.length) return { admission: "pending" as const };
        if (recent.length >= dailyCap) return { admission: "cap" as const };
        const row = await tx.opsEvent.create({
          data: { type: "ntfy_notify", severity: "info", message: "", data: { h: hash, s: "pending" } },
          select: { id: true },
        });
        return {
          admission: "ok" as const,
          release: async () => { try { await prisma.opsEvent.delete({ where: { id: row.id } }); } catch { /* kept: cap still holds */ } },
          markSent: async () => { try { await prisma.opsEvent.update({ where: { id: row.id }, data: { data: { h: hash, s: "sent" } } }); } catch { /* stays pending: sent again after the window */ } },
        };
      });
    } catch {
      return { admission: "unavailable" };
    }
  };
}

export type NotifyResult =
  | { status: 200; body: { ok: true; sent: boolean; duplicate?: boolean } }
  | { status: 400 | 409 | 429 | 502 | 503; body: { ok: false; error: string } };

export async function handleNotify(raw: unknown, deps: NotifyDeps): Promise<NotifyResult> {
  if (!NTFY_TOPIC_PATTERN.test(deps.topic)) return { status: 503, body: { ok: false, error: "notify_disabled" } };
  const parsed = notifyBodySchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { ok: false, error: "invalid_body" } };
  const text = composeNotifyText(parsed.data);
  const reservation = await deps.admit(notifyHash(text));
  const admission = reservation.admission;
  if (admission === "cap") return { status: 429, body: { ok: false, error: "daily_cap" } };
  if (admission === "duplicate") return { status: 200, body: { ok: true, sent: false, duplicate: true } };
  if (admission === "pending") return { status: 409, body: { ok: false, error: "pending" } };
  if (admission !== "ok") return { status: 503, body: { ok: false, error: "admission_unavailable" } };
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(NTFY_BASE_URL + deps.topic, {
      method: "POST",
      body: text,
      headers: { Title: "WCORE", Priority: "high", Tags: "warning" },
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      // A 4xx is a clear refusal (nothing published): free the reservation so the next pass is
      // admitted. A 5xx may hide a publication: keep it pending.
      if (res.status < 500 && reservation.release) await reservation.release();
      return { status: 502, body: { ok: false, error: "ntfy_" + res.status } };
    }
    if (reservation.markSent) await reservation.markSent();
    return { status: 200, body: { ok: true, sent: true } };
  } catch {
    // Ambiguous result (timeout, network): the reservation stays pending and the cap holds; the
    // workbook keeps retrying (409 pending) and the text goes again once the window has passed.
    return { status: 502, body: { ok: false, error: "ntfy_unreachable" } };
  }
}
