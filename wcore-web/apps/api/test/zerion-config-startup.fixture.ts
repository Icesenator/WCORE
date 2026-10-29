// Processus enfant lancé par zerion-config-startup.test.ts avec un environnement en liste blanche.
// Mode "config" : lit la configuration Zerion exactement comme le démarrage (apiConfig sur process.env).
// Mode "startup" : importe server.ts (démarrage réel) ; une sonde compte tout appel à fetch.
const mode = process.argv[2];
let fetchCalls = 0;
globalThis.fetch = (async () => {
  fetchCalls++;
  throw new Error("fetch bloqué par la sonde");
}) as typeof fetch;

function emit(payload: Record<string, unknown>): void {
  process.stdout.write(`RESULT ${JSON.stringify({ ...payload, fetchCalls })}\n`);
}

try {
  if (mode === "startup") {
    await import("../src/server.js");
    emit({ ok: true });
  } else {
    const { apiConfig } = await import("../src/config.js");
    const { maxPositions, maxResponseBytes } = apiConfig.portfolioEnrichment.zerion;
    emit({ ok: true, maxPositions, maxResponseBytes });
  }
} catch (error) {
  emit({ ok: false, message: error instanceof Error ? error.message : String(error) });
}
process.exit(0);
