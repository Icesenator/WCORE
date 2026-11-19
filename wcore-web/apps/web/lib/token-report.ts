/**
 * Signalement d'un jeton (scam ou legitime) depuis la table des jetons.
 *
 * L'identite de reference est celle de la SESSION, renvoyee par l'API
 * (/api/auth/me), et non le compte actif de l'extension : quand l'extension etait
 * sur un autre compte que la session, l'administrateur creait des tickets au lieu
 * d'appliquer l'override (tickets WHSPR du 19/11).
 *
 * - Session administrateur : POST /api/admin/scam-override. Si l'API le refuse
 *   (401/403, par exemple une adresse administrateur configuree autrement cote
 *   API), on retombe sur un ticket ; une autre erreur ne cree rien.
 * - Autre session, ou pas de session : un ticket, sans jamais solliciter la route
 *   administrateur (pas de 401 attendu, pas de renouvellement de session inutile).
 */
export type TokenReportOutcome = "admin" | "ticket" | "failed";

export interface TokenReportInput {
  apiUrl: string;
  chainKey: string;
  symbol: string;
  name: string;
  contract: string;
  isCurrentlyScam: boolean;
}

interface ResponseLike { ok: boolean; status: number; json(): Promise<unknown> }
type FetchLike = (url: string, init?: { method?: string; body?: string }) => Promise<ResponseLike>;

async function sessionAddress(apiUrl: string, fetcher: FetchLike): Promise<string | null> {
  try {
    const res = await fetcher(`${apiUrl}/api/auth/me`);
    if (!res.ok) return null;
    const data = await res.json() as { address?: unknown };
    return typeof data.address === "string" ? data.address.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function createTicket(input: TokenReportInput, fetcher: FetchLike): Promise<TokenReportOutcome> {
  const res = await fetcher(`${input.apiUrl}/api/tickets`, {
    method: "POST",
    body: JSON.stringify({
      title: input.isCurrentlyScam ? `Token report: ${input.symbol} is LEGIT` : `Token report: ${input.symbol} is SCAM`,
      description: [
        `Chain: ${input.chainKey}`,
        `Contract: ${input.contract}`,
        `Symbol: ${input.symbol}`,
        `Name: ${input.name}`,
        `Current scam status: ${input.isCurrentlyScam ? "flagged as scam" : "clean"}`,
      ].join("\n"),
      type: "bug",
    }),
  });
  return res.ok ? "ticket" : "failed";
}

export async function submitTokenReport(input: TokenReportInput, fetcher: FetchLike, adminAddress: string): Promise<TokenReportOutcome> {
  const session = await sessionAddress(input.apiUrl, fetcher);
  if (session && session === adminAddress.toLowerCase()) {
    const res = await fetcher(`${input.apiUrl}/api/admin/scam-override`, {
      method: "POST",
      body: JSON.stringify({
        symbol: input.symbol,
        action: input.isCurrentlyScam ? "approve" : "block",
        contract: input.contract !== "native" ? input.contract : undefined,
      }),
    });
    if (res.ok) return "admin";
    if (res.status !== 401 && res.status !== 403) return "failed";
  }
  return createTicket(input, fetcher);
}
