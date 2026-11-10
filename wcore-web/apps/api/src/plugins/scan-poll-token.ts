import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Secret de lecture d'un scan asynchrone anonyme.
 *
 * Un scan anonyme appartenait seulement a son IP source. Or request.ip vient de X-Forwarded-For
 * des que le pair direct est de confiance (TRUST_PROXY) : un pair du reseau prive couvert par
 * cette confiance peut donc se faire passer pour n'importe quelle IP. Le jeton, un HMAC du jobId
 * avec domaine separe, est rendu au seul createur dans le corps de la reponse et renvoye dans un
 * en-tete : il n'apparait ni dans l'URL ni dans les journaux de requetes.
 */
export const SCAN_POLL_TOKEN_HEADER = "x-scan-poll-token";
const DOMAIN = "wcore.scan-poll/v1";

export function scanPollToken(secret: string, jobId: string): string {
  return createHmac("sha256", secret).update(`${DOMAIN}\0${jobId}`).digest("base64url");
}

export function verifyScanPollToken(secret: string, jobId: string, presented: unknown): boolean {
  if (typeof presented !== "string") return false;
  const expected = Buffer.from(scanPollToken(secret, jobId));
  const received = Buffer.from(presented);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
