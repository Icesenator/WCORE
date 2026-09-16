'use strict';
// Frontiere WCORE ROOT / WCORE CM — proprietaire : WCORE_CM (voir CM/OWNERSHIP-MANIFEST.md).
// Objectif : le CM ne selectionne QUE du travail CM. Le ROADMAP ROOT n'est jamais une file de travail CM.
const fs = require('fs');
const path = require('path');

const CM_PROJECT_ROOT = path.join(__dirname, '..', 'CM');
const CM_ROADMAP = path.join(CM_PROJECT_ROOT, 'ROADMAP.md');
const CM_REVIEW_CONTEXT = path.join(CM_PROJECT_ROOT, 'review-context.md');
const ROOT_ROADMAP = path.join(__dirname, '..', 'ROADMAP.md');

// Domaines CM : workstream X @WCORExyz + gouvernance/technique CM + discovery/editorial.
const CM_ACCEPT = [
  /^WC-01$/,
  /^P[0-3]-CM-/,
  /^P[0-3]-GOV-CM-/,
  /^P[0-3]-EDITORIAL-/,
  /^P[0-3]-DISCOVERY-/,
];

// Domaines ROOT : produit, runtime, operations, observabilite produit, release, chaine, deploiement.
const ROOT_REJECT = [
  /^WC-(?!01$)\d+$/,                 // WC-10, WC-11, WC-12... (produit) — WC-01 exclu
  /^P[0-3]-OBS-/,                    // observabilite produit (dont GSheet HTTP)
  /^P[0-3]-REL-/,                    // release (dont Kraken)
  /^P[0-3]-CHAIN-/,                  // chaines / RPC
  /^P[0-3]-PROD-/,                   // production
  /^P[0-3]-WEB-/,                    // web produit
  /^P[0-3]-DATA-/,                   // donnees produit
  /^P[0-3]-FX-/,
  /^P[0-3]-ARCH-WCORE-CM-DEDICATED-AGENT$/, // architecture ROOT/CM = workstream concurrent (autre agent)
];

function classifyWorkItem(id) {
  const s = String(id || '').trim();
  if (!s) return { id: s, owner: 'UNKNOWN', accepted: false, reason: 'EMPTY_ID' };
  if (CM_ACCEPT.some((r) => r.test(s))) return { id: s, owner: 'CM', accepted: true, reason: 'CM_DOMAIN' };
  if (ROOT_REJECT.some((r) => r.test(s))) return { id: s, owner: 'ROOT', accepted: false, reason: 'ROOT_PRODUCT_TASK' };
  return { id: s, owner: 'UNKNOWN', accepted: false, reason: 'UNCLASSIFIED_FAIL_CLOSED' };
}

function isCmWorkItem(id) {
  return classifyWorkItem(id).accepted;
}

// Une ligne du ROADMAP ROOT n'est une tache CM que si son ID est CM ET qu'elle n'est pas un pointeur.
function isRootPointerRow(row) {
  const s = typeof row === 'string' ? row : JSON.stringify(row || {});
  return /POINTEUR|pointeur|entree de coordination|entrée de coordination|CANONICAL_OWNER=WCORE_CM/i.test(s);
}

// Une ligne du ROADMAP ROOT n'est selectionnable comme travail CM que si :
//   (1) ce n'est PAS un pointeur de coordination, ET (2) son ID est un domaine CM.
function rootRowIsCmSelectable(row) {
  if (isRootPointerRow(row)) return false;
  return isCmWorkItem(extractId(row));
}

function rootPointerIsNotCmWorkItem(row) {
  if (!isRootPointerRow(row)) return true;
  return rootRowIsCmSelectable(row) === false;
}

function extractId(row) {
  if (row && typeof row === 'object') return row.id || row.priority_id || '';
  const m = String(row || '').match(/^\|\s*([A-Za-z0-9][A-Za-z0-9\-]*)\s*\|/);
  if (m) return m[1];
  const m2 = String(row || '').match(/\b(WC-\d+|P[0-3]-[A-Z0-9\-]+)\b/);
  return m2 ? m2[1] : '';
}

// File de travail CM canonique : CM/ROADMAP.md + items CM declares dans CM/review-context.md.
function readCmQueue() {
  const items = [];
  const seen = new Set();
  for (const f of [CM_ROADMAP, CM_REVIEW_CONTEXT]) {
    let t = '';
    try { t = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    for (const line of t.split(/\r?\n/)) {
      const m = line.match(/^\|\s*(WC-\d+|P[0-3]-[A-Z0-9\-]+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/);
      if (!m) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      // Le statut est la 1re cellule qui est un jeton de statut connu : les layouts different
      // (ROOT : |ID|P|Statut|Preuve| ; CM : |ID|Tache|P|Statut|Preuve|).
      const cells = m.slice(2).map((c) => String(c || '').trim().toUpperCase());
      const stTok = cells.map((c) => (c.match(/IN_PROGRESS|TODO|DONE|BLOCKED/) || [])[0]).find(Boolean) || 'TODO';
      const cls = classifyWorkItem(id);
      if (!cls.accepted) continue;
      seen.add(id);
      items.push({ id, status: stTok, owner: 'CM', source: path.relative(path.join(__dirname, '..'), f) });
    }
  }
  return items;
}

// Filtre une liste d'items ROOT : ne conserve que le travail CM (fail-closed).
function filterToCmWork(items) {
  const rows = Array.isArray(items) ? items : [];
  const accepted = [];
  const rejected = [];
  for (const it of rows) {
    const id = extractId(it);
    const cls = classifyWorkItem(id);
    if (cls.accepted) accepted.push({ id, owner: 'CM', status: (it && it.status) || 'TODO' });
    else rejected.push({ id, owner: cls.owner, reason: cls.reason });
  }
  return { accepted, rejected, root_product_selection_count: rejected.filter((r) => r.owner === 'ROOT').length };
}

module.exports = {
  CM_PROJECT_ROOT, CM_ROADMAP, CM_REVIEW_CONTEXT, ROOT_ROADMAP,
  CM_ACCEPT, ROOT_REJECT,
  classifyWorkItem, isCmWorkItem, readCmQueue, filterToCmWork,
  isRootPointerRow, rootRowIsCmSelectable, rootPointerIsNotCmWorkItem, extractId,
  ROOT_ROADMAP_IS_WORK_QUEUE: false,
  ROOT_PRODUCT_TASK_SELECTION_ALLOWED: false,
};
