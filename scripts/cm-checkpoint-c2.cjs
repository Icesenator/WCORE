// cm-checkpoint-c2.cjs — RUNNER READ-ONLY pour le checkpoint officiel C2 (72h apres publication).
// CM-only. Lecture seule sur X. AUCUN chemin publish / reply / submit / follow / unfollow.
// Persistance officielle durable uniquement sous _vault/RAW/CM/checkpoints, et seulement si garde passee + collecte reussie (auth true, C2 rendered, incidents vides). Le dry-run n'est JAMAIS un checkpoint officiel et n'ecrit jamais sous RAW.
//
// Modes:
//   node scripts/cm-checkpoint-c2.cjs --mode=dryrun                 (autorise avant le checkpoint; OFFICIAL_CHECKPOINT=false; artefact hors RAW)
//   node scripts/cm-checkpoint-c2.cjs --mode=checkpoint             (garde horaire obligatoire, sinon refus fail-closed; persistance durable seulement si collecte reussie)
//   node scripts/cm-checkpoint-c2.cjs --mode=checkpoint --guard-only --now=<ISO>  (valide la logique horaire SANS collecte ni CDP)
// Options:
//   --now=<ISO>     horloge forcee (exige --guard-only; jamais pour simuler un vrai relevé)
//   --guard-only    evalue la condition temporelle puis s'arrete (aucune navigation, aucune collecte, aucune ecriture)
//   --out=<file>    chemin artefact dryrun (defaut: <TEMP>/cm-checkpoint-c2-<stamp>.json; tout chemin sous _vault/RAW est refuse)
'use strict';
const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('node:crypto');
const os = require('node:os');

// --- Constantes internes (IDs runtime: autorises ICI, jamais recopies dans review-context.md) ---
const C2_URL = 'https://x.com/WCORExyz/status/2098333345469939847';
const PUBLISHED = { y: 2026, mo: 9, d: 11, h: 10, mi: 50, s: 29 };            // 11/09 10:50:29 Europe/Paris
const CHECKPOINT_START = { y: 2026, mo: 9, d: 14, h: 10, mi: 50, s: 29 };     // checkpoint officiel >= cette heure
const TZ = 'Europe/Paris';
const RAW_ROOT = path.resolve(__dirname, '../_vault/RAW');
const CHECKPOINT_DIR = path.join(RAW_ROOT, 'CM', 'checkpoints');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const a = { mode: 'dryrun', now: null, guardOnly: false, out: null };
  for (const t of argv.slice(2)) {
    if (t.startsWith('--mode=')) a.mode = t.slice(7);
    else if (t.startsWith('--now=')) a.now = t.slice(6);
    else if (t === '--guard-only') a.guardOnly = true;
    else if (t.startsWith('--out=')) a.out = t.slice(6);
  }
  return a;
}

function tzOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const m = {}; for (const p of dtf.formatToParts(date)) m[p.type] = p.value;
  const hour = parseInt(m.hour, 10) % 24;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, hour, +m.minute, +m.second);
  const base = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUTC - base) / 60000);
}
function wallToEpochSec(w, timeZone) {
  let guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) / 1000 - 2 * 3600;
  for (let i = 0; i < 3; i++) {
    const off = tzOffsetMinutes(new Date(guess * 1000), timeZone);
    guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) / 1000 - off * 60;
  }
  return guess;
}
function nowParis(date) {
  const dtf = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
  const m = {}; for (const p of dtf.formatToParts(date)) m[p.type] = p.value;
  return { iso: `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}:${m.second} ${TZ} (${m.weekday})`, epoch: Math.floor(date.getTime() / 1000) };
}

// Lecture d'un post : collecte uniquement ce qui est reellement rendu; sinon UNKNOWN.
function num(str) {
  if (!str) return null;
  const g = String(str).replace(/\u00a0/g, ' ').match(/(\d[\d\s.,]*)/);
  if (!g) return null;
  const digits = g[1].replace(/[^\d]/g, '');
  return digits === '' ? null : parseInt(digits, 10);
}
function pick(parsed, exists) { return parsed !== null ? parsed : (exists ? 'UNKNOWN' : 'UNKNOWN'); }

function resolvedPath(p) {
  let parent = path.resolve(p);
  const suffix = [];
  while (!fs.existsSync(parent)) {
    const next = path.dirname(parent);
    if (next === parent) throw new Error('Parent introuvable');
    suffix.unshift(path.basename(parent));
    parent = next;
  }
  return path.join(fs.realpathSync(parent), ...suffix);
}

function within(p, root) {
  const rel = path.relative(root.toLowerCase(), p.toLowerCase());
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

function assertNotRaw(p) {
  const abs = path.resolve(p);
  const real = resolvedPath(abs);
  if ([abs, real].some((v) => /(?:^|[\\/])_vault[\\/]raw(?:[\\/]|$)/i.test(v) || within(v, resolvedPath(RAW_ROOT)))) {
    throw new Error('REFUSED: chemin artefact sous _vault/RAW (interdit).');
  }
  return real;
}

function artifactName(date = new Date()) {
  return `cm-checkpoint-c2-${date.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;
}

function atomicWrite(outPath, out) {
  const staging = path.join(path.dirname(outPath), `.${path.basename(outPath)}.${randomUUID()}.staging`);
  const data = JSON.stringify(out, null, 2);
  let fd;
  let created = false;
  try {
    fd = fs.openSync(staging, 'wx', 0o600);
    created = true;
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.linkSync(staging, outPath);
    return { path: outPath, sha256: createHash('sha256').update(fs.readFileSync(outPath)).digest('hex') };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (created) fs.unlinkSync(staging);
  }
}

function writeTestArtifact(outPath, out) {
  if (out.official_checkpoint !== false) throw new Error('TEST exige official_checkpoint=false');
  return atomicWrite(assertNotRaw(outPath), out);
}

function collectionSucceeded(out) {
  return out.auth_authenticated_read === true && out.surfaces?.C2?.rendered === true &&
    Array.isArray(out.incidents) && out.incidents.length === 0 &&
    ['CHECKPOINT_COLLECTED', 'DRYRUN_COLLECTED'].includes(out.status);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.now !== null && !args.guardOnly) { console.error('REFUSED: --now exige --guard-only'); return 7; }
  if (args.mode !== 'dryrun' && args.mode !== 'checkpoint') { console.error('Mode inconnu:', args.mode); return 8; }
  const nowDate = args.now !== null ? new Date(args.now) : new Date();
  if (isNaN(nowDate.getTime())) { console.error('ERR --now invalide:', args.now); return 7; }

  const nowSec = Math.floor(nowDate.getTime() / 1000);
  const thrSec = wallToEpochSec(CHECKPOINT_START, TZ);
  const pubSec = wallToEpochSec(PUBLISHED, TZ);
  const ageHours = +(((nowSec - pubSec) / 3600).toFixed(2));
  const reached = nowSec >= thrSec;
  const np = nowParis(nowDate);

  // ===== Garde temporelle : le mode CHECKPOINT est fail-closed avant l'heure officielle =====
  if (args.mode === 'checkpoint' && !reached) {
    console.log(JSON.stringify({
      mode: 'checkpoint', status: 'EARLY_CHECKPOINT_REFUSED', fail_closed: true,
      now_paris: np.iso, checkpoint_start_paris: nowParis(new Date(thrSec * 1000)).iso,
      official_checkpoint: false, note: 'Aucune navigation, aucune collecte, aucune ecriture. Checkpoint >= 2026-09-14 10:50:29 Europe/Paris.',
    }, null, 1));
    return 4; // refus anticipé -> code non nul
  }
  if (args.guardOnly) {
    console.log(JSON.stringify({
      mode: args.mode, status: 'GUARD_WOULD_PASS', guard_only: true, official_checkpoint: false,
      checkpoint_reached: reached, now_paris: np.iso, age_C2_hours: ageHours,
      checkpoint_start_paris: nowParis(new Date(thrSec * 1000)).iso,
      note: 'Garde temporelle evaluee, collecte intentionnellement desactivee (--guard-only). Aucune navigation, aucune ecriture.',
    }, null, 1));
    return 0;
  }

  const official = args.mode === 'checkpoint'; // dryrun => false, toujours
  const outPath = official
    ? path.join(CHECKPOINT_DIR, artifactName(nowDate))
    : assertNotRaw(args.out || path.join(os.tmpdir(), artifactName(nowDate)));

  const out = { schema_version: 'cm-c2-checkpoint/1', runner_version: '1.1.0', mode: args.mode, official_checkpoint: official, collected_at_paris: np.iso, collected_at_utc: nowDate.toISOString(), age_C2_hours: ageHours, checkpoint_start_paris: nowParis(new Date(thrSec * 1000)).iso, surfaces: {}, incidents: [] };

  let browser = null;
  try {
    const { chromium } = require('K:/ProjetIA/WCORE/node_modules/playwright');
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 30000 });
    const ctxs = browser.contexts();
    if (!ctxs.length) { out.status = 'CDP_NO_CONTEXT'; out.incidents.push('no browser context'); console.log(JSON.stringify(out, null, 1)); return 2; }
    const p = await ctxs[0].newPage();

    await p.goto('https://x.com/home', { waitUntil: 'domcontentloaded' }); await sleep(7000);
    out.auth_authenticated_read = await p.evaluate(() => !!document.querySelector('[data-testid=SideNav_AccountSwitcher_Button]'));

    await p.goto('https://x.com/WCORExyz', { waitUntil: 'domcontentloaded' }); await sleep(6500);
    const prof = await p.evaluate(() => { const r = {}; for (const el of document.querySelectorAll('a[href*="/WCORExyz/"]')) { const t = (el.textContent || '').split('\n')[0]; const h = el.getAttribute('href') || ''; if (/\/following$/.test(h)) r.following = t; if (/followers$/.test(h)) r.followers = t; } return r; });
    out.surfaces.profile = { followers: num(prof.followers) ?? 'UNKNOWN', following: num(prof.following) ?? 'UNKNOWN' };

    const readPost = async (url, matchText) => {
      try {
        await p.goto(url, { waitUntil: 'domcontentloaded' }); await sleep(7000);
        return await p.evaluate((mt) => {
          const arts = [...document.querySelectorAll('article[data-testid=tweet]')];
          const a = mt ? arts.find((x) => (x.querySelector('[data-testid=tweetText]')?.innerText || '').includes(mt)) : arts[0];
          if (!a) return { rendered: false };
          const gv = (sel) => a.querySelector(sel);
          const viewsEl = [...a.querySelectorAll('a[href*="/analytics"]')].map((x) => x.textContent.trim());
          const like = gv('[data-testid=like]'); const rp = gv('[data-testid=reply]'); const rt = gv('[data-testid=retweet]'); const bm = gv('[data-testid=bBookmark]'); const bw = gv('[data-testid=blue-verification]');
          return {
            rendered: true,
            views: viewsEl.length ? viewsEl : ['UNKNOWN'],
            likes_raw: like?.getAttribute('aria-label') || null, likes_exists: !!like,
            replies_raw: rp?.getAttribute('aria-label') || null, replies_exists: !!rp,
            reposts_raw: rt?.getAttribute('aria-label') || null, reposts_exists: !!rt,
            bookmark_raw: bm?.getAttribute('aria-label') || null, bookmark_exists: !!bm,
            time: a.querySelector('time')?.dateTime || null,
            text_head: (a.querySelector('[data-testid=tweetText]')?.innerText || '').replace(/\s+/g, ' ').slice(0, 60),
          };
        }, matchText || null);
      } catch (e) { out.incidents.push('readPost err: ' + e.message); return { rendered: false }; }
    };
    const finalize = (r) => ({
      rendered: !!r.rendered,
      views: (r.rendered && r.views && r.views[0] !== 'UNKNOWN') ? (num(r.views[0]) ?? 'UNKNOWN') : 'UNKNOWN',
      likes: r.rendered ? pick(num(r.likes_raw), r.likes_exists) : 'UNKNOWN',
      replies_rendered: r.rendered ? pick(num(r.replies_raw), r.replies_exists) : 'UNKNOWN',
      reposts: r.rendered ? pick(num(r.reposts_raw), r.reposts_exists) : 'UNKNOWN',
      bookmarks: r.rendered ? pick(num(r.bookmark_raw), r.bookmark_exists) : 'UNKNOWN',
      time: r.time || 'UNKNOWN', text_head: r.text_head || 'UNKNOWN',
    });

    out.surfaces.C2 = finalize(await readPost(C2_URL));
    out.surfaces.LIQUID_PARENT = finalize(await readPost('https://x.com/BlockWatchdog/status/2096852721315754354'));
    out.surfaces.LIQUID_REPLY_WCORE = finalize(await readPost('https://x.com/WCORExyz/status/2097034209164706043', 'oldest oracle'));

    for (const [k, u] of [['notifications', 'https://x.com/notifications'], ['mentions', 'https://x.com/notifications/mentions']]) {
      try { await p.goto(u, { waitUntil: 'domcontentloaded' }); await sleep(6000); out.surfaces[k] = await p.evaluate(() => [...document.querySelectorAll('article[data-testid=tweet], [data-testid=cellInnerDiv]')].slice(0, 9).map((c) => (c.innerText || '').replace(/\n+/g, ' | ').slice(0, 130)).filter(Boolean)); }
      catch (e) { out.surfaces[k] = 'UNKNOWN'; out.incidents.push(k + ' err: ' + e.message); }
    }

    try {
      await p.goto('https://x.com/lanternwallet/status/2097706594213773690', { waitUntil: 'domcontentloaded' }); await sleep(6500);
      for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, 1400); await sleep(1500); }
      out.surfaces.LANTERN_THREAD = await p.evaluate(() => [...document.querySelectorAll('article[data-testid=tweet]')].map((a) => ({ user: (a.querySelector('[data-testid=User-Name]')?.innerText || '').split('\n')[0], time: a.querySelector('time')?.dateTime || '', text: (a.querySelector('[data-testid=tweetText]')?.innerText || '').replace(/\n+/g, ' ').slice(0, 70) })));
    } catch (e) { out.surfaces.LANTERN_THREAD = 'UNKNOWN'; out.incidents.push('lantern err: ' + e.message); }

    await p.close();
    out.status = official ? 'CHECKPOINT_COLLECTED' : 'DRYRUN_COLLECTED';
  } catch (e) {
    out.status = 'CDP_OR_RUNTIME_ERROR'; out.incidents.push('fatal: ' + e.message);
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
  }

  console.log(JSON.stringify(out, null, 1));

  if (official) {
    if (!reached) { console.error('REFUSED: checkpoint sans garde temporelle passee.'); return 4; }
    if (!collectionSucceeded(out)) {
      console.error('REFUSED: persistance officielle refusee (auth/C2 rendered/incidents).');
      console.log('OFFICIAL_CHECKPOINT=false PERSISTED=false');
      return 3;
    }
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
    const written = atomicWrite(outPath, out);
    console.log('\nOFFICIAL_CHECKPOINT=true ARTIFACT=' + written.path + ' SHA256=' + written.sha256);
    return 0;
  }

  let hash = null;
  if (out.status !== 'CDP_OR_RUNTIME_ERROR' && out.status !== 'CDP_NO_CONTEXT') {
    hash = atomicWrite(outPath, out).sha256;
  }
  console.log('\nARTIFACT=' + outPath + ' SHA256=' + (hash || 'NOT_WRITTEN') + ' OFFICIAL_CHECKPOINT=false');
  return out.status && out.status.includes('ERROR') || out.status === 'CDP_NO_CONTEXT' ? 3 : 0;
}

module.exports = { main, parseArgs, wallToEpochSec, nowParis, num, pick, resolvedPath, within, assertNotRaw, artifactName, atomicWrite, writeTestArtifact, collectionSucceeded };

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((e) => { console.error('ERR', e.message); process.exit(1); });
}
