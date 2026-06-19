import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@wcore/db";
import {
  SupportTicketCreateBodySchema,
  TicketsQuerySchema,
  TicketIdParamsSchema,
  SupportTicketUpdateBodySchema,
} from "./schemas.js";
import { isAdminAuthorized } from "./admin-auth.js";

const isAdmin = isAdminAuthorized;

export async function supportPlugin(app: FastifyInstance, prisma: PrismaClient) {

  app.post("/api/tickets", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const ticketParsed = SupportTicketCreateBodySchema.safeParse(req.body);
    if (!ticketParsed.success) return reply.code(400).send({ error: "title and description are required" });
    const { title, description, type } = ticketParsed.data;
    const ticket = await prisma.ticket.create({
      data: {
        userId: req.user.id,
        title: title.trim(),
        description: description.trim(),
        type,
      },
    });
    return { ticket };
  });

  app.get("/api/tickets", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { status } = TicketsQuerySchema.parse(req.query);
    const where: Record<string, unknown> = isAdmin(req) ? {} : { userId: req.user.id };
    if (status) where.status = status;
    const tickets = await prisma.ticket.findMany({
      where,
      include: { user: { select: { address: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { tickets };
  });

  app.get("/api/tickets/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    const { id } = TicketIdParamsSchema.parse(req.params);
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: { user: { select: { address: true } } },
    });
    if (!ticket) return reply.code(404).send({ error: "not_found" });
    if (!isAdmin(req) && ticket.userId !== req.user.id) {
      return reply.code(404).send({ error: "not_found" });
    }
    return { ticket };
  });

  app.patch("/api/tickets/:id", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "not_authenticated" });
    if (!isAdmin(req)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const { id } = TicketIdParamsSchema.parse(req.params);
    const { status, response } = SupportTicketUpdateBodySchema.parse(req.body);
    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "not_found" });

    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (response !== undefined) data.response = response?.trim() || null;

    const ticket = await prisma.ticket.update({ where: { id }, data });
    return { ticket };
  });
}
