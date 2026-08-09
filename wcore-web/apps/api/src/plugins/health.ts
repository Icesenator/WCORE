import type { FastifyInstance } from "fastify";

export interface HealthPluginOptions {
  /** Liveness ne l'appelle jamais; seul /ready sonde la base. */
  checkDb: () => Promise<boolean>;
  /** Idem: reserve a /ready. */
  checkRedis: () => Promise<boolean>;
  coreVersion: string;
  chainCount: number;
}

/**
 * Separe volontairement les deux sondes:
 *
 * - `/health` est la sonde de **liveness**. Railway redemarre le conteneur
 *   quand elle echoue, donc elle ne doit dependre d'aucune dependance externe:
 *   un hoquet Redis deviendrait une boucle de redemarrage. Elle reste aussi
 *   muette sur l'etat des disjoncteurs (SEC-10), l'endpoint etant public et non
 *   authentifie — ce detail appartient a `/api/metrics/errors`, cote admin.
 *
 * - `/ready` est la sonde de **readiness**. Elle expose la disponibilite reelle
 *   de PostgreSQL et de Redis et repond 503 des que l'une manque, garde posee
 *   par le contre-audit du 2026-08-07.
 */
export async function healthPlugin(app: FastifyInstance, opts: HealthPluginOptions) {
  app.get("/health", async () => ({
    status: "ok",
    service: "wcore-api",
    coreVersion: opts.coreVersion,
    uptimeSec: Math.round(process.uptime()),
    chainCount: opts.chainCount,
  }));

  app.get("/ready", async (_req, reply) => {
    const dbOk = await opts.checkDb();
    const redisOk = await opts.checkRedis();
    const ready = dbOk && redisOk;
    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "not_ready",
      service: "wcore-api",
      checks: { db: dbOk, redis: redisOk },
    });
  });
}
