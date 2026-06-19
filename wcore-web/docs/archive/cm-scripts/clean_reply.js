const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');
const PAGE_WS = 'ws://127.0.0.1:9222/devtools/page/50B08A82DBF396A311BA25640AD8F878';
let msgId = 0;
const pending = {};

const ws = new WebSocket(PAGE_WS);
ws.on('open', () => main());
ws.on('message', data => {
  const msg = JSON.parse(data.toString());
  if (msg.method === 'Page.javascriptDialogOpening') {
    ws.send(JSON.stringify({ id: 99999, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
  }
  if (msg.id && pending[msg.id]) pending[msg.id](msg);
});
ws.on('error', e => console.error('Error:', e.message));
ws.on('close', () => process.exit(0));

function send(m, p) { msgId++; ws.send(JSON.stringify({id:msgId,method:m,params:p||{}})); return new Promise(r => { pending[msgId] = r; }); }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function postCleanReply(tweetId, message, label) {
  console.log(`\n=== ${label} ===`);
  const intentUrl = `https://x.com/intent/post?in_reply_to=${tweetId}&text=${encodeURIComponent(message)}`;
  
  // Navigate to intent URL
  await send('Page.navigate', { url: intentUrl });
  await wait(8000);
  
  // Clear the NON-dialog editor (Quoi de neuf?) - keep only the dialog one
  await send('Runtime.evaluate', { expression: `
    (() => {
      const eds = document.querySelectorAll('[contenteditable="true"]');
      for (const ed of eds) {
        if (!ed.closest('[role="dialog"]')) {
          ed.innerHTML = '';
          ed.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    })()
  `, returnByValue: true, awaitPromise: true });
  await wait(1000);
  
  // Verify only dialog editor has text
  const check = await send('Runtime.evaluate', { expression: `
    JSON.stringify([...document.querySelectorAll('[contenteditable="true"]')].map(e => ({
      inDialog: !!e.closest('[role="dialog"]'),
      len: e.textContent.length
    })))
  `, returnByValue: true, awaitPromise: true });
  console.log('  Editors:', check.result?.result?.value);
  
  // Click Reply button
  const btnResult = await send('Runtime.evaluate', { expression: `
    (() => {
      const b = document.querySelector('[data-testid="tweetButton"]');
      if (!b) return 'no btn';
      if (!b.disabled && b.offsetParent !== null) {
        b.click();
        return 'clicked';
      }
      return JSON.stringify({d: b.disabled, v: b.offsetParent !== null});
    })()
  `, returnByValue: true, awaitPromise: true });
  
  const r = btnResult.result?.result?.value;
  await wait(4000);
  const pub = await send('Runtime.evaluate', { expression: `document.body.innerText.includes('publié')`, returnByValue: true, awaitPromise: true });
  const isPub = pub.result?.result?.value;
  console.log(`  ${isPub ? '✅ Published!' : '❌ Failed'}`);
  
  // Navigate to home to clear any remaining drafts
  await send('Page.navigate', { url: 'https://x.com/home' });
  await wait(3000);
}

async function main() {
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await wait(1000);
    
    // Post 1 clean reply
    await postCleanReply(
      '2053823660755234828',
      "Nice, just checked it out. If you ever want to track across evm + solana + cosmos too, @wcorexyz does 116+ chains in one dashboard. Free, real-time pricing.",
      '@artifagose_lab'
    );
    
    console.log('\n✅ Done');
    
  } catch(e) { console.error('Error:', e.message); }
  ws.close();
}
