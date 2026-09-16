// cm-x-search.cjs - recherche X read-only via CDP BRUT (nouvelle cible). Aucune publication.
// Helper CANONIQUE pour la discovery CM (remplace les scripts temp de discovery => cause de INC2).
// Usage : node scripts/cm-x-search.cjs "<requete X>" [f=top|live] [limit]
'use strict';
const VERSION_URL = 'http://127.0.0.1:9222/json/version';

function rpc(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch (_) { return; }
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result); }
  });
  return (method, params, sessionId, timeoutMs) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('TIMEOUT:' + method)); } }, timeoutMs || 30000);
    const payload = { id: mid, method, params: params || {} };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
  });
}

const EXPR = "Array.from(document.querySelectorAll('article')).slice(0,LIMIT).map(a=>{const t=(a.innerText||'').replace(/\\s+/g,' ').trim().slice(0,240);const l=a.querySelector('a[href*=\"/status/\"]');return {link:l?l.getAttribute('href'):null,text:t};})";

(async () => {
  const q = process.argv[2];
  if (!q) { console.error('USAGE: node scripts/cm-x-search.cjs "<requete>" [f=top|live] [limit]'); process.exit(2); }
  const f = process.argv[3] || 'top';
  const limit = Math.max(1, Math.min(20, parseInt(process.argv[4] || '12', 10)));
  const url = 'https://x.com/search?q=' + encodeURIComponent(q) + '&src=typed_query&f=' + encodeURIComponent(f);
  const v = await (await fetch(VERSION_URL)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('WS_ERROR'))); setTimeout(() => rej(new Error('WS_OPEN_TIMEOUT')), 15000); });
  const send = rpc(ws);
  const out = { ts: new Date().toISOString(), browser: v.Browser, query: q, f, read_only: true, publication: 'NONE' };
  let targetId;
  try {
    const t = await send('Target.createTarget', { url }, null, 20000);
    targetId = t.targetId;
    const a = await send('Target.attachToTarget', { targetId, flatten: true }, null, 20000);
    await send('Runtime.enable', {}, a.sessionId, 15000).catch(() => {});
    await new Promise((r) => setTimeout(r, 10000));
    const ev = await send('Runtime.evaluate', { expression: EXPR.replace('LIMIT', String(limit)), returnByValue: true }, a.sessionId, 25000);
    const items = (ev.result && ev.result.value) || [];
    out.count = items.length;
    out.items = items;
  } catch (e) { out.error = e.message; }
  finally { if (targetId) { try { await send('Target.closeTarget', { targetId }, null, 10000); } catch (_) {} } }
  ws.close();
  // P2-CM-DISCOVERY-RESULT-VALIDATION : classification INC5 (count>0 seul != succes ; incoherent => NON_CONCLUANT ;
  // fraicheur evaluee separement ; run invalide n epuise jamais une famille ; aucune action publique).
  try {
    const { classifyDiscoveryRun } = require('./cm-discovery-validate.cjs');
    out.validation = classifyDiscoveryRun(out, { maxAgeMs: 24 * 60 * 60 * 1000 });
  } catch (e) { out.validation = { verdict: 'NON_CONCLUANT', error: String(e.message) }; }
  // CONSOMMATEUR REEL : la validation devient une DECISION fail-closed (qualification / exhaustion / gate public).
  try {
    const { qualifyDiscovery } = require('./cm-discovery-qualify.cjs');
    out.decision = qualifyDiscovery(out);
  } catch (e) {
    out.decision = {
      decision: 'NON_CONCLUANT', run_valid: false,
      family_exhausted_allowed: false, public_gate_allowed: false, retryable: true,
      reasons: ['QUALIFIER_ERROR:' + String(e.message).slice(0, 80)],
    };
  }
  console.log(JSON.stringify(out, null, 1));
})().then(() => process.exit(0)).catch((e) => { console.error('ERR', e.message); process.exit(1); });
