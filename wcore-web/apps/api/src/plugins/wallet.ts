import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@wcore/db";
import {
  CustomTokenAddBodySchema,
  ResourceIdParamsSchema,
  ScansQuerySchema,
  ScanShareBodySchema,
  ScanShareParamsSchema,
  ShareTokenParamsSchema,
} from "../schemas.js";

export interface WalletPluginDeps {
  prisma: PrismaClient;
  validateCustomToken: (c: unknown) => c is string;
}

export async function walletPlugin(app: FastifyInstance, deps: WalletPluginDeps) {
  const { prisma, validateCustomToken } = deps;

  // --- Custom Tokens ---

  app.get("/api/custom-tokens", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const tokens = await prisma.customToken.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" } });
    return { tokens };
  });

  app.post("/api/custom-tokens", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const ctParsed = CustomTokenAddBodySchema.safeParse(req.body);
    if (!ctParsed.success || !validateCustomToken(ctParsed.data.contract)) return reply.code(400).send({ error: "invalid_contract" });
    try {
      const token = await prisma.customToken.create({
        data: { userId: req.user.id, contract: ctParsed.data.contract.trim().toLowerCase(), label: ctParsed.data.label?.trim() || null, chainType: ctParsed.data.chainType },
      });
      return { token };
    } catch (e) { console.error("customToken create DB error:", (e).message || String(e)); return { error: "already_exists" }; }
  });

  app.delete("/api/custom-tokens/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { id } = ResourceIdParamsSchema.parse(req.params);
    const token = await prisma.customToken.findUnique({ where: { id } });
    if (!token || token.userId !== req.user.id) return reply.code(404).send({ error: "not_found" });
    await prisma.customToken.delete({ where: { id } });
    return { ok: true };
  });

  // --- Scan History ---

  app.get("/api/scans", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const page = Math.max(1, ScansQuerySchema.parse(req.query).page ?? 1);
    const limit = 20;
    const scans = await prisma.walletScan.findMany({
      where: { userId: req.user.id },
      select: { id: true, address: true, chains: true, totalEur: true, tokenCount: true, createdAt: true },
      orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
    });
    const total = await prisma.walletScan.count({ where: { userId: req.user.id } });
    return { scans, total, page, totalPages: Math.ceil(total / limit) };
  });

  app.get("/api/scans/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { id } = ResourceIdParamsSchema.parse(req.params);
    const scan = await prisma.walletScan.findUnique({ where: { id } });
    if (!scan || scan.userId !== req.user.id) return reply.code(404).send({ error: "not_found" });
    return scan;
  });

  // --- Share ---

  app.post("/api/scans/:id/share", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { id } = ScanShareParamsSchema.parse(req.params);
    const scan = await prisma.walletScan.findUnique({ where: { id } });
    if (!scan || scan.userId !== req.user.id) return reply.code(404).send({ error: "not_found" });
    const shareBody = ScanShareBodySchema.safeParse(req.body ?? {});
    if (!shareBody.success) return reply.code(400).send({ error: "invalid_body", message: shareBody.error.issues[0]?.message ?? "invalid body" });
    const { expiresAt } = shareBody.data;
    const shareToken = randomBytes(16).toString("hex");
    await prisma.walletScan.update({ where: { id }, data: { shareToken, sharedAt: new Date(), expiresAt: expiresAt ? new Date(expiresAt) : null } });
    return { shareToken, url: `${process.env.PUBLIC_URL ?? "http://localhost:3000"}/share/${shareToken}` };
  });

  app.delete("/api/scans/:id/share", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { id } = ScanShareParamsSchema.parse(req.params);
    const scan = await prisma.walletScan.findUnique({ where: { id } });
    if (!scan || scan.userId !== req.user.id) return reply.code(404).send({ error: "not_found" });
    await prisma.walletScan.update({ where: { id }, data: { shareToken: null, sharedAt: null, expiresAt: null } });
    return { ok: true };
  });

  app.get("/api/public/scans/:shareToken", async (req, reply) => {
    const { shareToken } = ShareTokenParamsSchema.parse(req.params);
    const scan = await prisma.walletScan.findUnique({ where: { shareToken } });
    if (!scan) return reply.code(404).send({ error: "not_found" });
    if (scan.expiresAt && new Date(scan.expiresAt) < new Date()) return reply.code(410).send({ error: "expired" });
    // Log share token access for owner visibility (fire-and-forget)
    prisma.walletScan.update({
      where: { shareToken },
      data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    }).catch(() => {});
    return { id: scan.id, address: scan.address, chains: scan.chains, totalEur: scan.totalEur, tokenCount: scan.tokenCount, result: scan.result, createdAt: scan.createdAt, sharedAt: scan.sharedAt };
  });
}
