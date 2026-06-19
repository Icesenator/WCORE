import type { FastifyInstance } from "fastify";

export interface GsheetFxTelemetry {
  rate: number;
  ts: number;
  sources: string[];
  runtime: "gsheet" | "web";
}

export interface GsheetPluginOptions {
  token: string;
  cacheStore: { get: (key: string) => Promise<string | null> };
  cacheWriter?: {
    set: (key: string, value: unknown, ttlMs: number) => Promise<unknown>;
    get: (key: string) => Promise<unknown>;
  };
}

const FX_TELEMETRY_KEY_WEB = "fx_telemetry:web";
const FX_TELEMETRY_KEY_GSHEET = "fx_telemetry:gsheet";
const FX_TELEMETRY_TTL_MS = 2 * 60 * 60 * 1000; // 2h
const FX_DRIFT_TOLERANCE = 0.02; // 2% between web and gsheet
const FX_DRIFT_ALERT = 0.05; // 5% = hard alert

export async function gsheetPlugin(app: FastifyInstance, opts: GsheetPluginOptions) {
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url || !req.url.startsWith("/api/gsheet/")) return;
    const header = req.headers["x-gsheet-token"];
    if (header !== opts.token) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/api/gsheet/cache/get", async (req, reply) => {
    const { key } = req.query as { key?: string };
    if (!key) return reply.code(400).send({ error: "missing_key" });
    const value = await opts.cacheStore.get(key);
    return { found: value !== null, value };
  });

  // Gsheet (or any other runtime) posts its current FX rate here for drift
  // detection against the web runtime. Auth via x-gsheet-token.
  app.post("/api/gsheet/fx-telemetry", async (req, reply) => {
    const body = req.body as Partial<GsheetFxTelemetry> | undefined;
    const rate = Number(body?.rate);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
      return reply.code(400).send({ error: "invalid_rate" });
    }
    const telemetry: GsheetFxTelemetry = {
      rate,
      ts: Number(body?.ts) || Date.now(),
      sources: Array.isArray(body?.sources) ? body.sources.map(String) : [],
      runtime: body?.runtime === "web" ? "web" : "gsheet",
    };
    if (!opts.cacheWriter) {
      return reply.code(503).send({ error: "telemetry_disabled" });
    }
    const key = telemetry.runtime === "web" ? FX_TELEMETRY_KEY_WEB : FX_TELEMETRY_KEY_GSHEET;
    await opts.cacheWriter.set(key, telemetry, FX_TELEMETRY_TTL_MS);
    return { ok: true, key };
  });

  // Public drift comparison endpoint — no auth, useful for CI smoke tests.
  // Returns 503 if either runtime hasn't reported yet (cold start).
  app.get("/api/diag/fx-parity", async (_req, reply) => {
    if (!opts.cacheWriter) return reply.code(503).send({ error: "telemetry_disabled" });
    const [web, gsheet] = await Promise.all([
      opts.cacheWriter.get(FX_TELEMETRY_KEY_WEB) as Promise<GsheetFxTelemetry | undefined>,
      opts.cacheWriter.get(FX_TELEMETRY_KEY_GSHEET) as Promise<GsheetFxTelemetry | undefined>,
    ]);
    const now = Date.now();
    const result: {
      ok: boolean;
      now: number;
      web: { rate: number; ts: number; ageMs: number; sources: string[] } | null;
      gsheet: { rate: number; ts: number; ageMs: number; sources: string[] } | null;
      drift: number | null;
      tolerance: number;
      alert: number;
    } = {
      ok: false,
      now,
      web: web ? { rate: web.rate, ts: web.ts, ageMs: now - web.ts, sources: web.sources } : null,
      gsheet: gsheet ? { rate: gsheet.rate, ts: gsheet.ts, ageMs: now - gsheet.ts, sources: gsheet.sources } : null,
      drift: null,
      tolerance: FX_DRIFT_TOLERANCE,
      alert: FX_DRIFT_ALERT,
    };
    if (web && gsheet) {
      const max = Math.max(web.rate, gsheet.rate);
      const min = Math.min(web.rate, gsheet.rate);
      result.drift = (max - min) / max;
      result.ok = result.drift <= FX_DRIFT_TOLERANCE;
    }
    return result;
  });
}
