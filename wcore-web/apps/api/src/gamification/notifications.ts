import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@wcore/db";
import { randomBytes } from "node:crypto";

// Scan notifications are client-side toasts now — never persist them.
const EXCLUDED_NOTIFICATION_TYPES = ["scan_done", "scan_degraded"];

export async function registerNotificationRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
) {
  const _streamTokens = new Map<string, { userId: string; address: string; expiresAt: number }>();

  // Cleanup expired stream tokens every 60s
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _streamTokens) {
      if (v.expiresAt < now) _streamTokens.delete(k);
    }
  }, 60_000).unref();

  // One-time cleanup: delete old scan spam from DB
  prisma.notification.deleteMany({
    where: { type: { in: EXCLUDED_NOTIFICATION_TYPES } },
  }).then(c => { if (c.count > 0) console.log(`[notifications] cleaned up ${c.count} old scan notifications`); })
    .catch(() => {});

  const notifWhere = (userId: string) => ({
    userId,
    type: { notIn: EXCLUDED_NOTIFICATION_TYPES },
  });

  app.get("/api/notifications", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const notifications = await prisma.notification.findMany({
      where: notifWhere(req.user.id),
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { notifications };
  });

  app.put("/api/notifications/read-all", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false, type: { notIn: EXCLUDED_NOTIFICATION_TYPES } },
      data: { read: true },
    });
    return { ok: true };
  });

  // Get a short-lived opaque token for SSE stream (JWT must be in Authorization header)
  app.post("/api/notifications/stream-token", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const opaque = randomBytes(32).toString("hex");
    _streamTokens.set(opaque, { userId: req.user.id, address: req.user.address, expiresAt: Date.now() + 60_000 });
    return { token: opaque, expiresIn: 60 };
  });

  app.get("/api/notifications/stream", async (req, reply) => {
    const { NotificationStreamQuerySchema } = await import("../schemas.js");
    // Only opaque stream tokens are accepted. JWTs must never be passed in URLs.
    const streamQ = NotificationStreamQuerySchema.parse(req.query);
    const opaqueToken = streamQ.token;
    if (!opaqueToken) return reply.code(401).send({ error: "not_authenticated" });

    let user: { id: string; address: string };

    // Try opaque token first
    const streamEntry = _streamTokens.get(opaqueToken);
    if (streamEntry && streamEntry.expiresAt > Date.now()) {
      _streamTokens.delete(opaqueToken); // single-use
      user = { id: streamEntry.userId, address: streamEntry.address };
    } else return reply.code(401).send({ error: "not_authenticated" });

    const sendSnapshot = async () => {
      const [notifications, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where: notifWhere(user.id),
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.notification.count({ where: { ...notifWhere(user.id), read: false } }),
      ]);
      reply.raw.write(`event: snapshot\ndata: ${JSON.stringify({ notifications, unreadCount })}\n\n`);
    };

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    await sendSnapshot();
    if (streamQ.once === "1") {
      reply.raw.end();
      return reply;
    }

    const heartbeat = setInterval(() => {
      reply.raw.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 25_000);
    const poll = setInterval(() => {
      sendSnapshot().catch((e) => { console.error("SSE snapshot poll error:", (e as Error).message || String(e)); });
    }, 60_000);
    req.raw.on("close", () => {
      clearInterval(heartbeat);
      clearInterval(poll);
    });
    return reply;
  });

  app.post("/api/notifications/:id/read", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { NotificationIdParamsSchema } = await import("../schemas.js");
    const { id } = NotificationIdParamsSchema.parse(req.params);
    await prisma.notification.updateMany({
      where: { id, userId: req.user.id },
      data: { read: true },
    });
    return { success: true };
  });

  app.get("/api/notifications/unread-count", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const count = await prisma.notification.count({
      where: { ...notifWhere(req.user.id), read: false },
    });
    return { count };
  });
}
