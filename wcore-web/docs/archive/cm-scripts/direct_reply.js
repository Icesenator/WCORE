const WebSocket = require('C:/Users/strau/wcore-web/node_modules/.pnpm/ws@8.18.3/node_modules/ws');
const http = require('http');

// Get all pages first
http.get('http://127.0.0.1:9222/json', res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    const pages = JSON.parse(b);
    const xPage = pages.find(p => p.type === 'page' && p.url && p.url.includes('x.com'));
    if (!xPage) { console.log('No X page found'); return; }
    
    console.log('Using page:', xPage.id);
    main(xPage.webSocketDebuggerUrl);
  });
});

async function main(pageWS) {
  const ws = new WebSocket(pageWS);
  let msgId = 0;
  const pending = {};

  ws.on('message', data => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending[msg.id]) pending[msg.id](msg);
  });
  ws.on('error', e => console.error('Error:', e.message));
  ws.on('close', () => process.exit(0));

  function send(method, params) {
    msgId++;
    ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
    return new Promise(r => { pending[msgId] = r; });
  }

  async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function replyToTweet(tweetUrl, message, label) {
    console.log(`\n=== ${label} ===`);
    
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: tweetUrl });
    await wait(6000);
    
    // Verify page loaded
    const title = await (async () => {
      const r = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true, awaitPromise: true });
      return r.result?.result?.value;
    })();
    console.log('  Page:', (title || '').substring(0, 80));
    
    // Click reply on the main tweet
    const clicked = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const article = document.querySelector('article[data-testid="tweet"]');
          if (!article) return 'no article';
          article.scrollIntoView({block:'center'});
          const btn = article.querySelector('[data-testid="reply"]');
          if (!btn) return 'no reply btn';
          btn.click();
          return 'reply clicked';
        })()
      `,
      returnByValue: true, awaitPromise: true
    });
    console.log('  ' + clicked.result?.result?.value);
    await wait(4000);
    
    // Check if reply dialog appeared
    const hasDialog = await send('Runtime.evaluate', {
      expression: `document.querySelectorAll('[role="dialog"]').length`,
      returnByValue: true, awaitPromise: true
    });
    console.log('  Dialogs:', hasDialog.result?.result?.value);
    
    // Insert text
    const inserted = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const eds = document.querySelectorAll('[contenteditable="true"]');
          if (!eds.length) return 'no editors';
          // Use the LAST editor (should be the reply compose)
          const ed = eds[eds.length - 1];
          ed.focus();
          ed.click();
          ed.innerHTML = '';
          const sel = window.getSelection();
          sel.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(ed);
          sel.addRange(range);
          document.execCommand('insertText', false, ${JSON.stringify(message)});
          
          // Also dispatch input event for React
          ed.dispatchEvent(new Event('input', { bubbles: true }));
          
          return 'inserted: ' + ed.textContent.length + ' chars';
        })()
      `,
      returnByValue: true, awaitPromise: true
    });
    console.log('  ' + inserted.result?.result?.value);
    await wait(3000);
    
    // Find and click the submit button
    const btnInfo = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = document.querySelectorAll('[data-testid="tweetButton"]');
          for (let i = btns.length - 1; i >= 0; i--) {
            const b = btns[i];
            if (b.offsetParent !== null) {
              return JSON.stringify({ disabled: b.disabled, text: b.innerText, idx: i });
            }
          }
          return 'no visible btn';
        })()
      `,
      returnByValue: true, awaitPromise: true
    });
    console.log('  Btn:', btnInfo.result?.result?.value);
    
    const info = JSON.parse(btnInfo.result?.result?.value || '{}');
    if (!info.disabled && info.text) {
      await send('Runtime.evaluate', {
        expression: `document.querySelectorAll('[data-testid="tweetButton"]')[${info.idx}]?.click()`,
        returnByValue: true, awaitPromise: true
      });
      await wait(4000);
      const pub = await send('Runtime.evaluate', {
        expression: `document.body.innerText.includes('publié')`,
        returnByValue: true, awaitPromise: true
      });
      console.log(`  ${pub.result?.result?.value ? '✅ Published!' : '❌ Not published'}`);
    } else if (info.disabled) {
      console.log('  ❌ Button disabled - text not registered by Draft.js');
    }
  }

  // First reply to a tweet
  await replyToTweet(
    'https://x.com/Amethisto/status/2053732741007462469',
    "Same here. I've been using @wcorexyz for this. 116+ chains (evm, solana, cosmos) in one dashboard, real-time pricing, free. Was tired of juggling 5 different explorers.",
    '@Amethisto'
  );
  
  await wait(3000);
  
  ws.close();
}

setTimeout(() => {}, 1000);
