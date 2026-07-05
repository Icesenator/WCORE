// Parity check: GSheet Recap Portfolio totals vs Web (DB + Redis)
// Usage: node scripts/parity-gsheet-vs-web.cjs
const { JWT } = require("google-auth-library");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SPREADSHEET_ID = "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4";
const SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE || process.env.HOME, ".config/gsheets-mcp/service-account.json"), "utf8"));
let PrismaClient;
try {
  ({ PrismaClient } = require("@prisma/client"));
} catch { /* not in standard path */ }

function resolvePrisma() {
  const base = path.join(ROOT, "node_modules/.pnpm");
  try {
    const dirs = fs.readdirSync(base);
    const pkg = dirs.find(d => d.startsWith("@prisma+client"));
    if (pkg) return require(path.join(base, pkg, "node_modules/@prisma/client"));
  } catch { /* nop */ }
  try {
    return require(path.join(ROOT, "node_modules/@prisma/client"));
  } catch { return null; }
}

const prismaMod = resolvePrisma();
if (!prismaMod) { console.error("PrismaClient not found. Run from wcore-web root."); process.exit(1); }
const { PrismaClient: PC } = prismaMod;

function loadDbUrl() {
  const bkp = path.join(ROOT, "scripts/.env.backup");
  if (fs.existsSync(bkp)) {
    const content = fs.readFileSync(bkp, "utf8");
    const m = content.match(/DATABASE_URL=(.+)/);
    if (m) return m[1].trim();
  }
  return process.env.DATABASE_URL || "";
}

const DB = loadDbUrl();
if (!DB) { console.error("DATABASE_URL not found (set scripts/.env.backup or env)."); process.exit(1); }

(async () => {
  let gsheetTotal = 0;
  const gsheetRows = [];
  let webCexTotal = 0;
  let webOnchainTotal = 0;
  const discrepancies = [];

  // ── 1. Read GSheet Recap Portfolio ──
  const auth = new JWT({ email: SERVICE_ACCOUNT.client_email, key: SERVICE_ACCOUNT.private_key, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  await auth.authorize();
  const sheetReq = await auth.request({ url: `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent("Recap Portfolio!A1:F200")}` });
  const sheetValues = (sheetReq.data.values || []);
  for (const row of sheetValues.slice(1)) {
    const name = String(row[0] || "").trim();
    if (!name) continue;
    const raw = String(row[1] || "0 €").replace(/\s/g, "").replace("€", "").replace(",", ".");
    const val = parseFloat(raw);
    if (isNaN(val)) continue;
    gsheetRows.push({ name, valueEur: val });
    gsheetTotal += val;
  }

  // ── 2. Read Web CEX holdings ──
  process.env.DATABASE_URL = DB;
  const p = new PC();
  const cexRows = await p.$queryRawUnsafe(`
    SELECT a.provider, h.bucket, SUM(h."valueEur") as total FROM cex_holdings h
    JOIN cex_accounts a ON a.id = h."accountId" GROUP BY a.provider, h.bucket ORDER BY a.provider, h.bucket`);
  for (const r of cexRows) webCexTotal += Number(r.total);
  await p.$disconnect();

  // ── 3. Estimate on-chain web total from GSheet naming ──
  // The GSheet lists individual wallet-chain rows. We sum them excluding CEX rows.
  let gsheetCex = 0;
  let gsheetOnChain = 0;
  for (const row of gsheetRows) {
    if (row.name.startsWith("CEX -")) gsheetCex += row.valueEur;
    else gsheetOnChain += row.valueEur;
  }
  webOnchainTotal = gsheetTotal - gsheetCex; // approximate from GSheet; real web total needs API scan cache

  // ── 4. Report ──
  console.log("═══════════════════════════════════════");
  console.log("  GSheet vs Web — Parity Report");
  console.log("═══════════════════════════════════════\n");
  console.log(`GSheet TOTAL:     ${gsheetTotal.toFixed(2)} EUR`);
  console.log(`  ─ CEX:          ${gsheetCex.toFixed(2)} EUR`);
  console.log(`  ─ On-chain:     ${gsheetOnChain.toFixed(2)} EUR\n`);
  console.log(`Web CEX TOTAL:    ${webCexTotal.toFixed(2)} EUR (DB)`);
  console.log(`Web On-chain:     ?? EUR (API not queried — run from browser)\n`);

  const cexDelta = webCexTotal - gsheetCex;
  console.log(`${"─".repeat(42)}`);
  console.log(`CEX delta (web − gsheet): ${cexDelta > 0 ? "+" : ""}${cexDelta.toFixed(2)} EUR`);
  if (Math.abs(cexDelta) > 5) {
    console.log("  ⚠  SIGNIFICANT — check bitpanda stocks/fiat, OKX");
  } else {
    console.log("  ✓  Acceptable");
  }

  // ── 5. Key rows comparison ──
  console.log(`\n${"─".repeat(42)}`);
  console.log("Top rows by absolute value (GSheet):\n");
  const top = gsheetRows.filter(r => !r.name.startsWith("CEX -")).sort((a, b) => b.valueEur - a.valueEur).slice(0, 15);
  console.log("Name".padEnd(45) + "GSheet (EUR)");
  for (const r of top) {
    console.log(r.name.padEnd(45) + r.valueEur.toFixed(2));
  }

  console.log(`\n${"─".repeat(42)}`);
  console.log("CEX rows:\n");
  for (const r of gsheetRows) {
    if (r.name.startsWith("CEX -")) console.log(r.name.padEnd(35) + r.valueEur.toFixed(2).padStart(10) + " EUR");
  }

  console.log(`\n⚠  Web on-chain total not computed.`);
  console.log("   Rescan all wallets on web then compare the per-chain totals.");
  console.log("   GSheet columns I1/J1 show web scan status per chain.");
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
