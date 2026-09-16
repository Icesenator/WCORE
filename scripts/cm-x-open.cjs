// cm-x-open.cjs - lecture read-only d'une URL X precise (thread/profil) via CDP BRUT (nouvelle cible).
// Aucune publication, aucune interaction : Runtime.evaluate en lecture seule puis fermeture de la cible.
// Helper CANONIQUE pour la verification en source primaire d'un post cite (complement de cm-x-read/cm-x-search).
// Usage : node scripts/cm-x-open.cjs "<url x.com>" [limit]
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

const EXPR = "Array.from(document.querySelectorAll('article')).slice(0,LIMIT).map(a=>{const t=(a.innerText||'').replace(/\\s+/g,' ').trim().slice(0,700);const l=a.querySelector('a[href*=\"/status/\"]');return {link:l?l.getAttribute('href'):null,text:t};})";

(async () => {
  const url = process.argv[2];
  if (!url || !/^https:\/\/x\.com\//.test(url)) { console.error('USAGE: node scripts/cm-x-open.cjs "https://x.com/..." [limit]'); process.exit(2); }
  const limit = Math.max(1, Math.min(20, parseInt(process.argv[3] || '8', 10)));
  const v = await (await fetch(VERSION_URL)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('WS_ERROR'))); setTimeout(() => rej(new Error('WS_OPEN_TIMEOUT')), 15000); });
  const send = rpc(ws);
  const out = { ts: new Date().toISOString(), browser: v.Browser, url, read_only: true, publication: 'NONE' };
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
  console.log(JSON.stringify(out, null, 1));
})().then(() => process.exit(0)).catch((e) => { console.error('ERR', e.message); process.exit(1); });
