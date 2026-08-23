import type { FastifyInstance } from "fastify";
import { AdminFunnelQuerySchema, FunnelEventsBodySchema } from "../schemas.js";

export interface AnalyticsIncrementInput {
  bucketDate: Date;
  event: string;
  campaign: string;
  surface: string;
  variant: string;
  dimensionKey: string;
}

export interface AnalyticsQueryInput {
  from?: Date;
  to?: Date;
  campaign?: string;
}

export interface AnalyticsAggregateRow {
  event: string;
  campaign: string;
  surface: string;
  variant: string;
  dimensionKey: string;
  count: number;
}

export interface AnalyticsAggregateStore {
  increment(input: AnalyticsIncrementInput): Promise<void>;
  query(input: AnalyticsQueryInput): Promise<AnalyticsAggregateRow[]>;
}

interface AnalyticsPrismaClient {
  funnelEventAggregate: {
    upsert(args: unknown): Promise<unknown>;
    groupBy(args: unknown): Promise<Array<{
      event: string;
      campaign: string;
      surface: string;
      variant: string;
      dimensionKey: string;
      _sum: { count: number | null };
    }>>;
  };
}

interface AnalyticsPluginDeps {
  store: AnalyticsAggregateStore;
  isAdminAuthorized: (request: { headers: Record<string, string | string[] | undefined> }) => boolean;
}

function utcDay(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dimensionKey(dimensions: Record<string, string | undefined>): string {
  return Object.entries(dimensions)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("|") || "none";
}

export function createPrismaAnalyticsStore(prisma: AnalyticsPrismaClient): AnalyticsAggregateStore {
  return {
    async increment(input) {
      const where = {
        bucketDate_event_campaign_surface_variant_dimensionKey: {
          bucketDate: input.bucketDate,
          event: input.event,
          campaign: input.campaign,
          surface: input.surface,
          variant: input.variant,
          dimensionKey: input.dimensionKey,
        },
      };
      await prisma.funnelEventAggregate.upsert({
        where,
        create: { ...input, count: 1 },
        update: { count: { increment: 1 } },
      });
    },
    async query(input) {
      const bucketDate = input.from || input.to
        ? { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) }
        : undefined;
      const rows = await prisma.funnelEventAggregate.groupBy({
        by: ["event", "campaign", "surface", "variant", "dimensionKey"],
        where: {
          ...(bucketDate ? { bucketDate } : {}),
          ...(input.campaign ? { campaign: input.campaign } : {}),
        },
        _sum: { count: true },
        orderBy: [
          { event: "asc" },
          { campaign: "asc" },
          { surface: "asc" },
          { variant: "asc" },
          { dimensionKey: "asc" },
        ],
      });
      return rows.map((row) => ({
        event: row.event,
        campaign: row.campaign,
        surface: row.surface,
        variant: row.variant,
        dimensionKey: row.dimensionKey,
        count: row._sum.count ?? 0,
      }));
    },
  };
}

export async function analyticsPlugin(app: FastifyInstance, deps: AnalyticsPluginDeps) {
  app.post("/api/analytics/events", async (request, reply) => {
    const parsed = FunnelEventsBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });

    const bucketDate = utcDay();
    try {
      await Promise.all(parsed.data.events.map((event) => deps.store.increment({
        bucketDate,
        event: event.event,
        campaign: event.campaign,
        surface: event.surface,
        variant: event.variant,
        dimensionKey: dimensionKey(event.dimensions),
      })));
    } catch {
      return reply.code(202).send({ ok: false });
    }
    return reply.code(202).send({ ok: true });
  });

  app.get("/api/admin/analytics/funnel", async (request, reply) => {
    if (!deps.isAdminAuthorized(request)) return reply.code(401).send({ error: "unauthorized" });
    const parsed = AdminFunnelQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });
    const rows = await deps.store.query(parsed.data);
    return { rows: rows.filter((row) => row.count >= 5) };
  });
}
