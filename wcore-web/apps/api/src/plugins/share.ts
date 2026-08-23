import type { FastifyInstance } from "fastify";
import { z } from "zod";

const WalletBucket = z.enum(["1", "2_3", "4_plus"]);
const ChainBucket = z.enum(["1_5", "6_20", "21_50", "51_plus"]);

const ShareCardQuerySchema = z.object({
  total: z.string().regex(/^\d{1,4}(\.\d)?[km]?$/i).max(8),
  cur: z.enum(["eur", "usd"]).default("usd"),
  wallets: WalletBucket,
  chains: ChainBucket,
  cex: z.coerce.number().int().min(0).max(20),
}).strict();

const WALLET_LABELS: Record<string, string> = { "1": "1 wallet", "2_3": "2-3 wallets", "4_plus": "4+ wallets" };
const CHAIN_LABELS: Record<string, string> = { "1_5": "1-5 chains", "6_20": "6-20 chains", "21_50": "21-50 chains", "51_plus": "51+ chains" };
const CURRENCY_SYMBOLS = { eur: "\u20ac", usd: "$" } as const;

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
}

export function buildShareCardSvg(input: { total: string; cur: string; wallets: string; chains: string; cex: number }): string {
  const symbol = CURRENCY_SYMBOLS[input.cur as keyof typeof CURRENCY_SYMBOLS];
  const walletLabel = WALLET_LABELS[input.wallets] ?? input.wallets;
  const chainLabel = CHAIN_LABELS[input.chains] ?? input.chains;
  const cexLabel = `${input.cex} CEX`;
  const safeTotal = escapeXml(input.total);
  const pills: Array<[string, number]> = [
    [escapeXml(walletLabel), 24 + escapeXml(walletLabel).length * 14.5],
    [escapeXml(chainLabel), 24 + escapeXml(chainLabel).length * 14.5],
    [escapeXml(cexLabel), 24 + escapeXml(cexLabel).length * 14.5],
  ];
  let cursor = 96;
  const pillTexts = pills
    .map(([label, width]) => {
      const x = cursor;
      cursor += width + 18;
      return `  <rect x="${Math.round(x)}" y="446" width="${Math.round(width)}" height="58" rx="29" fill="#0d131c" stroke="#22303f"/>\n  <text x="${Math.round(x + width / 2)}" y="484" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="25" font-weight="bold" fill="#c3cfda">${label}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0f14"/>
      <stop offset="1" stop-color="#101822"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.85" cy="0.12" r="0.55">
      <stop offset="0" stop-color="#4ade80" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#4ade80" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect width="1200" height="675" fill="url(#glow)"/>
  <rect x="24" y="24" width="1152" height="627" rx="28" fill="#0d131c" stroke="#22303f"/>
  <rect x="24" y="24" width="6" height="627" rx="3" fill="#4ade80" fill-opacity="0.55"/>
  <text x="96" y="122" font-family="DejaVu Sans, Arial, sans-serif" font-size="40" font-weight="bold" fill="#4ade80">WCORE</text>
  <text x="1104" y="120" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#8aa0b4">clean portfolio</text>
  <text x="96" y="252" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" font-weight="bold" fill="#8aa0b4" letter-spacing="4">MY CLEAN TOTAL</text>
  <text x="92" y="392" font-family="DejaVu Sans, Arial, sans-serif" font-size="148" font-weight="bold" fill="#e6edf3">${symbol}${safeTotal}</text>
${pillTexts}
  <circle cx="103" cy="561" r="6" fill="#f59e0b"/>
  <text x="122" y="569" font-family="DejaVu Sans, Arial, sans-serif" font-size="23" fill="#c3cfda">Scam tokens flagged &amp; excluded from this total</text>
  <text x="96" y="628" font-family="DejaVu Sans, Arial, sans-serif" font-size="21" fill="#8aa0b4">Read-only \u00b7 No wallet connection \u00b7 No seed phrase</text>
  <text x="1104" y="629" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="27" font-weight="bold" fill="#4ade80">wcore.xyz</text>
</svg>`;
}

export async function sharePlugin(app: FastifyInstance) {
  app.get("/api/share/clean-total-card.png", async (request, reply) => {
    const parsed = ShareCardQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });
    const svg = buildShareCardSvg(parsed.data);
    const { default: sharp } = await import("sharp");
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return reply.header("content-type", "image/png").header("cache-control", "public, max-age=3600").send(png);
  });
}
