const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');
const PAGE_WS = 'ws://127.0.0.1:9222/devtools/page/50B08A82DBF396A311BA25640AD8F878';
let msgId = 0;
const pending = {};

const ws = new WebSocket(PAGE_WS);
ws.on('open', () => main());
ws.on('message', data => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending[msg.id]) pending[msg.id](msg);
});
ws.on('error', e => console.error('Error:', e.message));
ws.on('close', () => process.exit(0));

function send(m, p) { msgId++; ws.send(JSON.stringify({id:msgId,method:m,params:p||{}})); return new Promise(r => { pending[msgId] = r; }); }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await wait(1000);
    
    // Post to @assetfeel
    const intentUrl = 'https://x.com/intent/post?in_reply_to=2053697871329866123&text=Cold%20data%20beats%20gut%20feelings%20every%20time.%20%40wcorexyz%20tracks%20116%2B%20chains%20with%20real-time%20pricing%2C%20no%20paywall.%20Free%20to%20start%20if%20you%20want%20a%20data-driven%20view%20without%20the%20noise.';
    console.log('Navigating to intent URL...');
    await send('Page.navigate', { url: intentUrl });
    await wait(8000);
    
    // Check button and click
    const btnInfo = await send('Runtime.evaluate', { expression: `
      (() => {
        const b = document.querySelector('[data-testid="tweetButton"]');
        if (!b) return JSON.stringify({error: 'no button'});
        const r = b.getBoundingClientRect();
        return JSON.stringify({d: b.disabled, v: b.offsetParent !== null, x: r.x + r.width/2, y: r.y + r.height/2, t: b.innerText});
      })()
    `, returnByValue: true, awaitPromise: true });
    const btn = JSON.parse(btnInfo.result?.result?.value || '{}');
    console.log('Button:', JSON.stringify(btn));
    
    if (btn.x && !btn.d) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
      await wait(50);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
      console.log('Clicked');
      await wait(4000);
      const pub = await send('Runtime.evaluate', { expression: `document.body.innerText.includes('publié')`, returnByValue: true, awaitPromise: true });
      console.log(pub.result?.result?.value ? '✅ Published!' : '❌ Not published');
    }
    
    ws.close();
  } catch(e) { console.error('Error:', e.message); ws.close(); }
}
