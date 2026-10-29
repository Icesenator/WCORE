/**
 * Harness réservé aux tests de confiance, absent du barrel public.
 * SYNTHETIC_OFFLINE est descriptif : un callback arbitraire peut effectuer des
 * I/O. Ce module n'est NI une sandbox OS NI une défense contre du code hostile
 * chargé dans le même processus. Préférer les réponses canned sans callback.
 * Aucun mode, contrat, booléen, fixture ou variable d'environnement ne donne
 * d'autorisation réseau. Aucun grant LIVE n'est implémenté.
 */
import { createOfflineBoundControlPlane } from "./control-plane.js";
import type { QuoteControlPlane, QuoteControlPlaneConfig, QuoteTransport } from "./control-plane.js";

const capabilities = new WeakMap<object, { context: object; transport: QuoteTransport }>();

// Factory volontairement privée : les propriétés copiées ne sont pas autorité.
function bind(context: object, transport: QuoteTransport): QuoteTransport {
  const capability = Object.freeze(Object.create(null)) as QuoteTransport;
  capabilities.set(capability, { context, transport: Object.freeze({
    mode: "SYNTHETIC_OFFLINE", fetchQuote: transport.fetchQuote.bind(transport),
  }) });
  return capability;
}

/** Interne à control-plane ; jamais réexporté par index.ts. */
export function resolveOfflineTransport(context: object | undefined, capability: unknown): QuoteTransport | undefined {
  if (!context || typeof capability !== "object" || capability === null) return undefined;
  const entry = capabilities.get(capability);
  return entry?.context === context ? entry.transport : undefined;
}

/** Injection explicite de code de test DE CONFIANCE, pas de transport LIVE. */
export function createOfflineQuoteControlPlane(config: QuoteControlPlaneConfig): QuoteControlPlane {
  const context = Object.freeze(Object.create(null)) as object;
  const transport = config.transport;
  // NETWORK_CAPABLE reste refusé même dans ce harness, avant lecture du callback.
  if (!transport || (transport.mode !== undefined && transport.mode !== "SYNTHETIC_OFFLINE")) return createOfflineBoundControlPlane(config, context);
  const capability = bind(context, transport);
  return createOfflineBoundControlPlane({ ...config, transport: capability }, context);
}

/** Chemin préféré : snapshots synthétiques, sans callback fourni par l'appelant. */
export function createCannedOfflineQuoteControlPlane(
  config: Omit<QuoteControlPlaneConfig, "transport">,
  responses: readonly unknown[],
): QuoteControlPlane {
  const snapshots = responses.map(value => structuredClone(value));
  let index = 0;
  return createOfflineQuoteControlPlane({ ...config, transport: {
    mode: "SYNTHETIC_OFFLINE",
    fetchQuote: async () => structuredClone(snapshots[index++]),
  } });
}
