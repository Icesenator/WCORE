/**
 * Signalement d'un jeton (scam ou legitime) depuis la table des jetons.
 *
 * C'est l'API qui decide si la session est administrateur : la route
 * /api/admin/scam-override est tentee d'abord. Si elle repond 2xx, l'override est
 * applique ; si elle refuse (401/403), un ticket de support est cree a la place.
 * L'ancienne verification cote navigateur comparait l'adresse du portefeuille
 * connecte a l'adresse administrateur : quand l'extension etait sur un autre
 * compte que la session, l'administrateur creait des tickets au lieu d'agir.
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

type FetchLike = (url: string, init: { method: string; body: string }) => Promise<{ ok: boolean; status: number }>;

export async function submitTokenReport(input: TokenReportInput, fetcher: FetchLike): Promise<TokenReportOutcome> {
  const action = input.isCurrentlyScam ? "approve" : "block";
  const admin = await fetcher(`${input.apiUrl}/api/admin/scam-override`, {
    method: "POST",
    body: JSON.stringify({ symbol: input.symbol, action, contract: input.contract !== "native" ? input.contract : undefined }),
  });
  if (admin.ok) return "admin";
  if (admin.status !== 401 && admin.status !== 403) return "failed";

  const ticket = await fetcher(`${input.apiUrl}/api/tickets`, {
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
  return ticket.ok ? "ticket" : "failed";
}
