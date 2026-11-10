#!/usr/bin/env node
// Repère les détentions des onglets « Ledger - * » qui n'ont pas de ligne dans « Portefeuille Crypto
// Details » (colonne Vérif = « X »), et les ajoute en recopiant les formules d'une ligne Details
// existante qui porte le même ticker (le symbole C est repris de ce modèle : USDC -> USDT, etc.).
// Sans modèle, la détention est signalée et rien n'est écrit pour elle. Aucun montant n'est saisi.
//
//   node scripts/details-missing-rows.cjs          # simulation (par défaut)
//   node scripts/details-missing-rows.cjs --apply  # écrit les lignes en fin de Details
//
// Jeton : ~/.clasprc.json (portée spreadsheets). N'affiche jamais d'adresse de portefeuille.
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SPREADSHEET_ID = "1kxidZZoEM6fXubFpp54fKvzJeXFCSCWCfyMTPNwYRB4";
const DETAILS = "Portefeuille Crypto Details";
const COLS = 17; // A..Q
const CONST_COLS = new Set([2, 4, 6]); // C symbole, E onglet, G contrat

/** Déplace les références relatives à la ligne `from` vers la ligne `to` (les $ ancrés restent). */
function shiftFormula(formula, from, to) {
  if (typeof formula !== "string" || !formula.startsWith("=")) return formula;
  return formula.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)\b/g, (m, d1, col, d2, row) =>
    d2 === "" && Number(row) === from ? `${d1}${col}${to}` : m);
}

/**
 * Plan pur. ledgerRows : [{ tab, ticker, contract, verif }] ; details : lignes C:G (FORMATTED_VALUE)
 * indexées à partir de la ligne 1 ; templates(row) -> formules A:Q de cette ligne Details.
 */
function planMissingRows(ledgerRows, details) {
  const have = new Set(details.map((r) => `${r[2] || ""}|${String(r[4] || "").toLowerCase()}`));
  const byTicker = new Map();
  details.forEach((r, i) => {
    const ticker = String(r[3] || "").trim(); // F = ticker du Ledger (formule)
    if (i > 0 && ticker && /^Ledger - /.test(r[2] || "") && !byTicker.has(ticker)) byTicker.set(ticker, { row: i + 1, symbol: r[0] });
  });
  const plan = [], unmatched = [];
  for (const h of ledgerRows) {
    if (h.verif !== "X" || !h.ticker || !h.contract) continue;
    if (h.ticker.startsWith("INFO_") || h.ticker === "META" || h.ticker === "ERROR") continue;
    if (have.has(`${h.tab}|${String(h.contract).toLowerCase()}`)) continue;
    const tpl = byTicker.get(h.ticker);
    if (!tpl) { unmatched.push(h); continue; }
    plan.push({ ...h, templateRow: tpl.row, symbol: tpl.symbol });
  }
  return { plan, unmatched };
}

function buildRow(templateFormulas, from, to, symbol, tab, contract) {
  const row = Array.from({ length: COLS }, (_, i) => shiftFormula(templateFormulas[i] ?? "", from, to));
  row[2] = symbol; row[4] = tab; row[6] = contract;
  for (let i = 0; i < COLS; i++) if (!CONST_COLS.has(i) && row[i] !== "" && !String(row[i]).startsWith("=")) row[i] = "";
  return row;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".clasprc.json"), "utf8")).tokens.default;
  const tok = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: "refresh_token" }) })).json();
  const H = { authorization: "Bearer " + tok.access_token, "content-type": "application/json" };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
  const meta = await (await fetch(`${base}?fields=sheets.properties.title`, { headers: H })).json();
  const tabs = meta.sheets.map((s) => s.properties.title).filter((t) => /^Ledger - /.test(t));
  const q = (r) => "ranges=" + encodeURIComponent(r);
  const ledgerRows = [];
  for (let i = 0; i < tabs.length; i += 40) {
    const part = tabs.slice(i, i + 40);
    const res = await (await fetch(`${base}/values:batchGet?${part.map((t) => q(`'${t}'!A3:H400`)).join("&")}&valueRenderOption=FORMATTED_VALUE`, { headers: H })).json();
    (res.valueRanges || []).forEach((vr, k) => (vr.values || []).forEach((r) => {
      if (r[0] === part[k]) ledgerRows.push({ tab: part[k], ticker: String(r[1] || "").trim(), contract: String(r[3] || "").trim(), verif: String(r[7] || "").trim() });
    }));
  }
  const details = (await (await fetch(`${base}/values/${encodeURIComponent(`'${DETAILS}'!C1:G3000`)}?valueRenderOption=FORMATTED_VALUE`, { headers: H })).json()).values || [];
  const { plan, unmatched } = planMissingRows(ledgerRows, details);
  const mask = (s) => (/^0x[0-9a-f]{40}$/i.test(s) ? `${s.slice(0, 6)}…${s.slice(-4)}` : s);
  console.log(`onglets=${tabs.length} lignes_ledger=${ledgerRows.length} a_ajouter=${plan.length} sans_modele=${unmatched.length}`);
  for (const p of plan) console.log(`  + ${p.tab} | ${p.ticker} -> ${p.symbol} | ${mask(p.contract)} (modèle ligne ${p.templateRow})`);
  for (const u of unmatched) console.log(`  ? ${u.tab} | ${u.ticker} | ${mask(u.contract)} : aucun modèle, à traiter à la main`);
  if (!apply || plan.length === 0) return;
  let next = details.length + 1;
  const rows = [];
  for (const p of plan) {
    const f = (await (await fetch(`${base}/values/${encodeURIComponent(`'${DETAILS}'!A${p.templateRow}:Q${p.templateRow}`)}?valueRenderOption=FORMULA`, { headers: H })).json()).values?.[0] || [];
    rows.push(buildRow(f, p.templateRow, next, p.symbol, p.tab, p.contract));
    next++;
  }
  const first = details.length + 1, last = first + rows.length - 1;
  const res = await fetch(`${base}/values/${encodeURIComponent(`'${DETAILS}'!A${first}:Q${last}`)}?valueInputOption=USER_ENTERED`, { method: "PUT", headers: H, body: JSON.stringify({ values: rows }) });
  console.log(`écriture lignes ${first}:${last} -> HTTP ${res.status}`);
}

module.exports = { shiftFormula, planMissingRows, buildRow };
if (require.main === module) main().catch((e) => { console.error("ERREUR", e.message); process.exitCode = 1; });
