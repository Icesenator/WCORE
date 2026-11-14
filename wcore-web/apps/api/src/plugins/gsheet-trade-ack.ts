// "Trade fait" button of the rebalancing notification (ntfy). The phone cannot write into the
// workbook, so the button only records an acknowledgement here; the workbook picks it up on its
// next watchdog pass (every 10 min) and runs the same refresh as ticking the manual cell.
//
// - The button URL carries an HMAC of (category, occurrence) keyed by the ntfy topic (server
//   secret), so it is valid for that one notification only and forges nothing else. Whoever can
//   read the topic can click it once: the only effect is one CEX refresh, never data or money.
// - One acknowledgement per occurrence (second click = "already taken into account"); it expires
//   after 6 h; the workbook takes it at most once (a lost take is a lost refresh, never two,
//   because a second refresh could lock the Kraken key).
// - Rows live in ops_events (type "trade_ack"), under a PostgreSQL advisory lock. No amount, no
//   symbol, no topic is stored or logged.
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@wcore/db";

const ACK_LOCK_KEY = 74_210_612;
export const ACK_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

export type AckCategory = "crypto" | "action";

export const ackQuerySchema = z.object({
  c: z.enum(["crypto", "action"]),
  o: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  t: z.string().regex(/^[0-9a-f]{32}$/),
}).strict();

/** Token of one notification: HMAC(topic, "ack|category|occurrence"). */
export function ackToken(topic: string, category: AckCategory, occurrence: string): string {
  return createHmac("sha256", topic).update("ack|" + category + "|" + occurrence).digest("hex").slice(0, 32);
}

/** Storage key of an acknowledgement (never the token itself). */
export function ackKey(topic: string, category: AckCategory, occurrence: string): string {
  return createHmac("sha256", topic).update("ackrow|" + category + "|" + occurrence).digest("hex").slice(0, 32);
}

/** ntfy "Actions" header value: one HTTP button, notification cleared after the tap. */
export function buildAckActionHeader(baseUrl: string, topic: string, category: AckCategory, occurrence: string): string {
  const u = new URL("/api/trade-ack", baseUrl);
  u.searchParams.set("c", category);
  u.searchParams.set("o", occurrence);
  u.searchParams.set("t", ackToken(topic, category, occurrence));
  return "http, Trade fait, " + u.toString() + ", method=POST, clear=true";
}

export interface AckStore {
  /** "recorded" = new, "duplicate" = already acknowledged, "unavailable" = storage error. */
  record: (key: string, category: AckCategory) => Promise<"recorded" | "duplicate" | "unavailable">;
  /** Atomically marks every fresh, not-yet-taken acknowledgement as taken; returns their categories. */
  take: () => Promise<AckCategory[] | null>;
}

export interface AckDeps {
  topic: string;
  store: AckStore;
}

export type AckResult =
  | { status: 200; body: { ok: true; duplicate?: boolean } }
  | { status: 400 | 403 | 503; body: { ok: false; error: string } };

function safeHexEq(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function handleTradeAck(query: unknown, deps: AckDeps): Promise<AckResult> {
  const parsed = ackQuerySchema.safeParse(query);
  if (!parsed.success) return { status: 400, body: { ok: false, error: "invalid_request" } };
  const { c, o, t } = parsed.data;
  if (!safeHexEq(t, ackToken(deps.topic, c, o))) return { status: 403, body: { ok: false, error: "forbidden" } };
  const r = await deps.store.record(ackKey(deps.topic, c, o), c);
  if (r === "unavailable") return { status: 503, body: { ok: false, error: "unavailable" } };
  return { status: 200, body: r === "duplicate" ? { ok: true, duplicate: true } : { ok: true } };
}

export async function handleTradeAckTake(store: AckStore): Promise<
  { status: 200; body: { ok: true; categories: AckCategory[] } } | { status: 503; body: { ok: false; error: string } }
> {
  const cats = await store.take();
  if (!cats) return { status: 503, body: { ok: false, error: "unavailable" } };
  return { status: 200, body: { ok: true, categories: cats } };
}

type AckRow = { h?: unknown; c?: unknown; taken?: unknown };

export function createPrismaAckStore(prisma: PrismaClient, now: () => number = Date.now): AckStore {
  return {
    record: async (key, category) => {
      try {
        return await prisma.$transaction(async (tx) => {
          await tx.$queryRawUnsafe("SELECT true AS locked FROM pg_advisory_xact_lock($1)", ACK_LOCK_KEY);
          const t = now();
          await tx.opsEvent.deleteMany({ where: { type: "trade_ack", createdAt: { lt: new Date(t - RETENTION_MS) } } });
          const rows = await tx.opsEvent.findMany({
            where: { type: "trade_ack", createdAt: { gte: new Date(t - RETENTION_MS) } },
            select: { data: true },
          });
          if (rows.some((r) => (r.data as AckRow | null)?.h === key)) return "duplicate" as const;
          await tx.opsEvent.create({
            data: { type: "trade_ack", severity: "info", message: "", data: { h: key, c: category, taken: false } },
          });
          return "recorded" as const;
        });
      } catch {
        return "unavailable" as const;
      }
    },
    take: async () => {
      try {
        return await prisma.$transaction(async (tx) => {
          await tx.$queryRawUnsafe("SELECT true AS locked FROM pg_advisory_xact_lock($1)", ACK_LOCK_KEY);
          const t = now();
          const rows = await tx.opsEvent.findMany({
            where: { type: "trade_ack", createdAt: { gte: new Date(t - ACK_MAX_AGE_MS) } },
            select: { id: true, data: true },
          });
          const cats = new Set<AckCategory>();
          for (const r of rows) {
            const d = r.data as AckRow | null;
            if (!d || d.taken === true || (d.c !== "crypto" && d.c !== "action") || typeof d.h !== "string") continue;
            await tx.opsEvent.update({ where: { id: r.id }, data: { data: { h: d.h, c: d.c, taken: true } } });
            cats.add(d.c);
          }
          return [...cats];
        });
      } catch {
        return null;
      }
    },
  };
}
