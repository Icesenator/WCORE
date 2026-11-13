#!/usr/bin/env node
'use strict';
// Controle des problemes techniques du classeur Invest 2.0, sans modele.
//
// Meme regles que la tache planifiee « wcore-controle-strat-d1 » (et que le rouge du classeur) :
//   - Strat!BK1 = X : un onglet du Recap est en erreur (colonne CA qui commence par « Erreur ») ;
//   - Strat!BQ1 = X : ecart dans les onglets Details ;
//   - Strat!AZ1 (Portefeuille Crypto) ou Strat!BF1 (Portefeuille Action) plus vieux que 2 h, ou illisible ;
//   - Strat!BL1 (scan le plus ancien du Recap) plus vieux que 8 h, ou illisible.
// Une valeur de BK1 ou BQ1 qui n'est ni V ni X compte aussi comme un probleme (lecture impossible).
//
// Lecture seule : le script lit 5 cellules de Strat et les colonnes A et CA du Recap (nom d'onglet et
// etat), jamais un montant. Il n'ecrit rien dans le classeur, ne lance aucune fonction Apps Script,
// n'envoie aucun mail ni aucune notification. Quand un probleme est nouveau, il depose un signal dans
// la boite de la session WCORE et imprime le message a relayer.
//
// Le signal ne porte que des valeurs validees : un nom d'onglet nettoye, dont tout ce qui ressemble a
// une donnee (lien, adresse, identifiant long, nombre) est masque ; un etat reduit a « Erreur » et a
// son code s'il a la forme d'un code ; une date relue chiffre par chiffre, sinon « illisible ».
//
// Ecarts avec la tache planifiee : (1) sa ligne « Extension coupee », tiree d'une recherche Gmail des
// mails du classeur, n'est pas reprise (le script n'a pas acces a Gmail) ; (2) le script n'envoie
// rien : il depose le signal et imprime le message, que l'appelant relaie.
//
// Configuration (rien n'est inscrit dans le depot) :
//   - identifiant du classeur : variable WCORE_SHEET_ID, ou cle « sheetId » de ~/.config/projetia/wcore.json ;
//   - jeton Google : ~/.clasprc.json (celui de clasp, deja utilise pour lire le classeur).
//
// Usage : node scripts/strat-tech-check.cjs [--dry-run] [--state <fichier>] [--inbox <dossier>]
// Codes de sortie : 0 aucun probleme ; 2 deja signale (moins de 24 h) ; 3 nouveau signal depose ;
//                   1 controle impossible (configuration, jeton, reseau).

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TASK_ID = 'task-wcore-controle-strat-d1';
const DEFAULT_STATE = path.join(os.homedir(), '.claude', 'scheduled-tasks', 'wcore-controle-strat-d1', 'state.json');
const DEFAULT_INBOX = 'D:\\ProjetIA\\Supervision\\data\\codex-supervisor\\inbox\\wcoreRoot';
const RANGES = ['Strat!BK1', 'Strat!BQ1', 'Strat!AZ1', 'Strat!BF1', 'Strat!BL1', "'Recap Portfolio'!A2:A200", "'Recap Portfolio'!CA2:CA200"];
const H = 3600 * 1000;
const REPEAT_AFTER_MS = 24 * H;

// Heure murale de Paris « AAAA-MM-JJ HH:MM:SS » -> instant UTC (ms), en tenant compte de l'heure d'ete.
// Rend null pour une valeur illisible.
const WALL_RE = /^\s*(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*$/;
function parisWallToUtcMs(text) {
  const m = WALL_RE.exec(String(text == null ? '' : text));
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v || 0));
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  // Jour qui n'existe pas (30 fevrier, 31 avril) : Date.UTC le reporterait sur le mois suivant.
  const cal = new Date(wall);
  if (cal.getUTCFullYear() !== y || cal.getUTCMonth() !== mo - 1 || cal.getUTCDate() !== d) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const wallOf = (ms) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  };
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = guess - (wallOf(guess) - wall);
  if (wallOf(guess) !== wall) return null; // heure qui n'existe pas (passage a l'heure d'ete)
  return guess;
}

// Texte venu d'une cellule : une ligne, caracteres simples, longueur bornee. Il sera relaye a une autre
// session : rien d'autre qu'un nom d'onglet ou un etat lisible ne doit passer.
function cleanCell(value, max = 80) {
  const oneLine = String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
  const safe = oneLine.replace(/[^\p{L}\p{N} _\-().:/'&+#,%]/gu, '?');
  return safe.length > max ? `${safe.slice(0, max - 1)}…` : safe;
}

// Nom d'onglet relaye : texte nettoye, puis tout ce qui ressemble a une donnee est masque sur le texte
// complet, et seulement ensuite tronque (tronquer d'abord laisserait le debut d'un identifiant long).
function safeTab(value, max = 60) {
  const masked = cleanCell(value, Number.MAX_SAFE_INTEGER)
    .replace(/https?:\/\/\S*|www\.\S*/gi, '[lien]')
    .replace(/0x[0-9a-f]{4,}/gi, '[adresse]')
    .replace(/[\p{L}\p{N}_]{20,}/gu, '[identifiant]')
    .replace(/\d[\d .,']{2,}\d/g, '[nombre]');
  return masked.length > max ? `${masked.slice(0, max - 1)}…` : masked;
}

// Etats d'erreur que le Recap ecrit en colonne CA (wcore-gsheet/src/17_LISTING.gs). Seuls ceux-la sont
// relayes, sous leur forme exacte ; tout autre texte devient « Erreur (detail non relaye) ».
const KNOWN_ERROR_STATES = ['Erreur', 'Erreur (0 V)', 'Erreur (SOURCE_UNAVAILABLE)', 'Erreur (X présent)'];
function safeState(value) {
  const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
  return KNOWN_ERROR_STATES.find((k) => k.toLowerCase() === s) || 'Erreur (détail non relayé)';
}

// Date relayee : relue chiffre par chiffre si elle est valide, sinon « illisible » (ou « (vide) »).
function wallText(value) {
  const raw = String(value == null ? '' : value);
  if (!raw.trim()) return '(vide)';
  const m = WALL_RE.exec(raw);
  return m && parisWallToUtcMs(raw) !== null ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] || '00'}` : 'illisible';
}

function flag(value) {
  const v = String(value == null ? '' : value).trim().toUpperCase();
  return v === 'V' || v === 'X' ? v : null;
}

// Rend la liste des problemes (une chaine par probleme, sans heure) et les dates lues.
function evaluate({ strat, recap, nowMs }) {
  const problems = [];
  const bk1 = flag(strat.BK1);
  if (bk1 === null) problems.push('BK1: valeur illisible');
  if (bk1 === 'X') {
    const bad = recap.filter((r) => /^Erreur/i.test(String(r.state == null ? '' : r.state).trim()));
    if (!bad.length) problems.push("BK1: X sans onglet en erreur dans le Recap");
    for (const r of bad) problems.push(`BK1: ${safeTab(r.tab)} : ${safeState(r.state)}`);
  }
  const bq1 = flag(strat.BQ1);
  if (bq1 === null) problems.push('BQ1: valeur illisible');
  if (bq1 === 'X') problems.push('BQ1: écart dans les onglets Détails');
  const dates = {};
  for (const [cell, maxMs, label] of [['AZ1', 2 * H, 'plus de 2 h'], ['BF1', 2 * H, 'plus de 2 h'], ['BL1', 8 * H, 'plus de 8 h']]) {
    dates[cell] = wallText(strat[cell]);
    const t = parisWallToUtcMs(strat[cell]);
    if (t === null) problems.push(`${cell}: illisible`);
    else if (nowMs - t > maxMs) problems.push(`${cell}: ${label}`);
  }
  return { problems, dates };
}

function sameList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const x = [...a].sort(), y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

// Decide : rien a signaler, deja signale (meme liste depuis moins de 24 h), ou nouveau signal.
function decide(problems, state, nowMs) {
  if (!problems.length) return { action: 'none', state: { lastAlertAt: null, lastTabs: [] } };
  const last = state && state.lastAlertAt ? Date.parse(state.lastAlertAt) : NaN;
  if (sameList(problems, state && state.lastTabs) && Number.isFinite(last) && nowMs - last < REPEAT_AFTER_MS && nowMs >= last) {
    return { action: 'already', state };
  }
  return { action: 'alert', state: { lastAlertAt: new Date(nowMs).toISOString(), lastTabs: problems } };
}

function stampUtc(nowMs) {
  return new Date(nowMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function renderSignal(problems, dates, nowMs) {
  const iso = stampUtc(nowMs);
  return [
    '---',
    'type: codex-supervisor-signal',
    `from: ${TASK_ID}`,
    'to: wcoreRoot',
    `date: ${iso}`,
    'status: NEW',
    '---',
    '',
    `# ${problems.length} problème(s) technique(s) dans le classeur`,
    '',
    ...problems.map((p) => `- ${p}`),
    '',
    `Dates lues (heure de Paris) : AZ1 = ${dates.AZ1} ; BF1 = ${dates.BF1} ; BL1 = ${dates.BL1}.`,
    '',
    'Contrôle fait par scripts/strat-tech-check.cjs, sans modèle : lecture de 5 cellules de Strat et des colonnes A et CA du Recap, aucun montant.',
    '',
  ].join('\n');
}

function renderMessage(problems, signalPath) {
  return [`WCORE : ${problems.length} problème(s) technique(s) dans le classeur`, ...problems.map((p) => `- ${p}`), `Signal : ${signalPath}`].join('\n');
}

function readSheetId(env = process.env, home = os.homedir()) {
  if (env.WCORE_SHEET_ID && env.WCORE_SHEET_ID.trim()) return env.WCORE_SHEET_ID.trim();
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(home, '.config', 'projetia', 'wcore.json'), 'utf8'));
    if (cfg && typeof cfg.sheetId === 'string' && cfg.sheetId.trim()) return cfg.sheetId.trim();
  } catch { /* absent ou illisible */ }
  return null;
}

async function googleAccessToken(fetchImpl, home = os.homedir()) {
  const rc = JSON.parse(fs.readFileSync(path.join(home, '.clasprc.json'), 'utf8'));
  const c = rc && rc.tokens && rc.tokens.default;
  if (!c || !c.refresh_token) throw new Error('jeton clasp introuvable dans ~/.clasprc.json');
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`jeton Google refusé (HTTP ${res.status})`);
  return j.access_token;
}

// Lit les plages et rend { strat, recap }. Une reponse incomplete leve : jamais de « aucun probleme » par defaut.
async function readSheet({ fetchImpl, sheetId, token }) {
  const qs = RANGES.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet?${qs}&valueRenderOption=FORMATTED_VALUE`;
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`lecture du classeur refusée (HTTP ${res.status})`);
  const vr = Array.isArray(j.valueRanges) ? j.valueRanges : [];
  if (vr.length !== RANGES.length) throw new Error(`lecture du classeur incomplète (${vr.length} plages sur ${RANGES.length})`);
  const cell = (i) => (vr[i].values && vr[i].values[0] && vr[i].values[0][0]) || '';
  const col = (i) => (vr[i].values || []).map((row) => (row && row[0]) || '');
  const tabs = col(5), states = col(6);
  const recap = tabs.map((tab, i) => ({ tab, state: states[i] || '' })).filter((r) => String(r.tab).trim());
  return { strat: { BK1: cell(0), BQ1: cell(1), AZ1: cell(2), BF1: cell(3), BL1: cell(4) }, recap };
}

async function run({
  fetchImpl = globalThis.fetch, nowMs = Date.now(), env = process.env, home = os.homedir(),
  statePath = DEFAULT_STATE, inboxDir = DEFAULT_INBOX, dryRun = false, log = console.log,
} = {}) {
  const sheetId = readSheetId(env, home);
  if (!sheetId) throw new Error('identifiant du classeur absent : WCORE_SHEET_ID ou ~/.config/projetia/wcore.json');
  const token = await googleAccessToken(fetchImpl, home);
  const data = await readSheet({ fetchImpl, sheetId, token });
  const { problems, dates } = evaluate({ ...data, nowMs });
  let state = null;
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { state = null; }
  const d = decide(problems, state, nowMs);
  if (d.action === 'none') {
    if (!dryRun) fs.writeFileSync(statePath, JSON.stringify(d.state));
    log('Aucun problème technique');
    return { code: 0, problems, action: d.action };
  }
  if (d.action === 'already') {
    log(`déjà signalé (${problems.length} problème(s))`);
    return { code: 2, problems, action: d.action };
  }
  const signalPath = path.join(inboxDir, `${stampUtc(nowMs).replace(/:/g, '-')}-from-${TASK_ID}.md`);
  const signal = renderSignal(problems, dates, nowMs);
  if (dryRun) {
    log(`[dry-run] signal qui serait déposé : ${signalPath}`);
    log(signal);
  } else {
    fs.writeFileSync(signalPath, signal, { flag: 'wx' });
    fs.writeFileSync(statePath, JSON.stringify(d.state));
  }
  log(renderMessage(problems, signalPath));
  return { code: 3, problems, action: d.action, signalPath };
}

module.exports = { parisWallToUtcMs, cleanCell, safeTab, safeState, wallText, evaluate, decide, renderSignal, renderMessage, readSheetId, readSheet, run, RANGES };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  run({ dryRun: argv.includes('--dry-run'), statePath: opt('--state') || DEFAULT_STATE, inboxDir: opt('--inbox') || DEFAULT_INBOX })
    .then((r) => process.exit(r.code))
    .catch((e) => { console.log(`ERREUR : contrôle impossible : ${e.message}`); process.exit(1); });
}
