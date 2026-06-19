const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');
const PAGE_WS = 'ws://127.0.0.1:9222/devtools/page/50B08A82DBF396A311BA25640AD8F878';
let msgId = 0;
const pending = {};

const ws = new WebSocket(PAGE_WS);
ws.on('open', () => { send('Page.enable'); send('Runtime.enable'); });
ws.on('message', data => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending[msg.id]) pending[msg.id](msg);
});
ws.on('error', e => console.error('Error:', e.message));
ws.on('close', () => process.exit(0));

function send(m, p) { msgId++; ws.send(JSON.stringify({id:msgId,method:m,params:p||{}})); return new Promise(r => { pending[msgId] = r; }); }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

setTimeout(async () => {
  try {
    // Navigate to tweet
    await send('Page.navigate', { url: 'https://x.com/Amethisto/status/2053732741007462469' });
    await wait(6000);
    
    // Click reply button
    await send('Runtime.evaluate', { expression: `
      const a = document.querySelector('article[data-testid="tweet"]');
      const b = a?.querySelector('[data-testid="reply"]');
      if (b) b.click();
    `, returnByValue: true, awaitPromise: true });
    console.log('Reply clicked');
    await wait(4000);
    
    // Get editor coordinates and click it with mouse
    const edInfo = await send('Runtime.evaluate', { expression: `
      (() => {
        const eds = document.querySelectorAll('[contenteditable="true"]');
        if (!eds.length) return 'no editors:' + document.querySelectorAll('[role="dialog"]').length + ' dialogs';
        const ed = eds[eds.length - 1];
        const r = ed.getBoundingClientRect();
        ed.focus();
        return JSON.stringify({x: r.x + 20, y: r.y + 10, w: r.width});
      })()
    `, returnByValue: true, awaitPromise: true });
    console.log('Editor:', edInfo.result?.result?.value);
    
    let info;
    try { info = JSON.parse(edInfo.result?.result?.value); } catch(e) { info = null; }
    
    if (info && info.x) {
      // Click editor via CDP mouse
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.x, y: info.y, button: 'left', clickCount: 1 });
      await wait(30);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.x, y: info.y, button: 'left', clickCount: 1 });
      await wait(500);
      
      // Type text character by character
      const msg = "Same here. I've been using @wcorexyz for this. 116+ chains in one dashboard, real-time pricing, free.";
      console.log('Typing...');
      
      for (const char of msg) {
        await send('Input.dispatchKeyEvent', { type: 'char', text: char, unmodifiedText: char, key: char, code: 'Key' + char.toUpperCase() });
        await wait(20 + Math.random() * 30);
      }
      console.log('Done typing');
      await wait(3000);
      
      // Check button and click if enabled
      const btnState = await send('Runtime.evaluate', { expression: `
        const btns = document.querySelectorAll('[data-testid="tweetButton"]');
        if (btns.length > 0) {
          const b = btns[btns.length - 1];
          if (!b.disabled && b.offsetParent !== null) {
            b.click();
            return 'clicked';
          }
          return 'disabled';
        }
        return 'no btn';
      `, returnByValue: true, awaitPromise: true });
      console.log('Submit:', btnState.result?.result?.value);
      
      await wait(4000);
      const pub = await send('Runtime.evaluate', { expression: `document.body.innerText.includes('publié')`, returnByValue: true, awaitPromise: true });
      console.log(pub.result?.result?.value ? '✅ Published!' : '❌ Not published');
    } else {
      console.log('No editor found');
    }
    
  } catch(e) { console.error('Error:', e.message); }
  ws.close();
}, 1000);
