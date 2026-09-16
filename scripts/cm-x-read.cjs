// cm-x-read.cjs - lecteur read-only X via CDP BRUT (nouvelle cible). Aucune publication. Helper CANONIQUE (remplace les scripts temp detruits => cause de INC4).
// Regle INC4 : verifier la fraicheur (ts) de la sortie avant usage ; un run sans sortie fraiche = run NON execute.
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

const EXPR = "Array.from(document.querySelectorAll('article')).slice(0,5).map(a=>{const t=(a.innerText||'').replace(/\\s+/g,' ').trim().slice(0,220);const l=a.querySelector('a[href*=\"/status/\"]');return {link:l?l.getAttribute('href'):null,text:t};})";

async function readOne(send, url, waitMs) {
  let targetId, sessionId;
  try {
    const t = await send('Target.createTarget', { url }, null, 20000);
    targetId = t.targetId;
    const a = await send('Target.attachToTarget', { targetId, flatten: true }, null, 20000);
    sessionId = a.sessionId;
    await send('Runtime.enable', {}, sessionId, 15000).catch(() => {});
    await new Promise((r) => setTimeout(r, waitMs || 9000));
    const ev = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true }, sessionId, 25000);
    const items = (ev.result && ev.result.value) || [];
    return { url, count: items.length, items };
  } finally {
    if (targetId) { try { await send('Target.closeTarget', { targetId }, null, 10000); } catch (_) {} }
  }
}

(async () => {
  const v = await (await fetch(VERSION_URL)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error('WS_ERROR'))); setTimeout(() => rej(new Error('WS_OPEN_TIMEOUT')), 15000); });
  const send = rpc(ws);
  const out = { ts: new Date().toISOString(), browser: v.Browser, read_only: true, publication: 'NONE' };
  try {
    out.mentions = await readOne(send, 'https://x.com/notifications/mentions');
    out.notifications = await readOne(send, 'https://x.com/notifications');
    out.with_replies = await readOne(send, 'https://x.com/WCORExyz/with_replies');
    out.entrants = await readOne(send, 'https://x.com/search?q=%40WCORExyz%20-from%3AWCORExyz&src=typed_query&f=live');
  } catch (e) { out.error = e.message; }
  ws.close();
  console.log(JSON.stringify(out, null, 1));
})().then(() => process.exit(0)).catch((e) => { console.error('ERR', e.message); process.exit(1); });
