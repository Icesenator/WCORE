/* QA locale isolée : vrai Next, profil Playwright éphémère, extensions désactivées.
 * Session et provider EIP-1193 entièrement synthétiques ; aucune signature, aucun
 * envoi de transaction, aucun RPC distant. Toutes les /api/* sont des fixtures ;
 * toute origine autre que la base locale est bloquée.
 * Usage : node gm-superseed-browser.cjs <red|green>
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const root = 'D:/ProjetIA/WCORE';
const dir = path.join(root, '.tmp', 'gm-browser');
const runtime = JSON.parse(fs.readFileSync(path.join(dir, 'runtime.json')));
const base = `http://127.0.0.1:${runtime.port}`;
const address = '0x00000000000000000000000000000000000000a1';
const contract = '0x00000000000000000000000000000000000000b2';
const phase = process.argv[2] || 'green';
const red = phase === 'red';
const report = {
  objective: 'GM_SUPERSEED_BROWSER_ACCEPTANCE',
  phase,
  startedAt: new Date().toISOString(),
  base,
  server: { command: runtime.command.join(' '), port: runtime.port, envKeys: runtime.envKeys },
  syntheticOnly: true,
  browser: 'Playwright Chromium (installed Chrome channel), ephemeral profile, extensions disabled',
  checks: [],
  walletRequests: [],
  apiRequests: [],
  externalBlocked: [],
  errors: [],
  screenshots: [],
};
const apiSeen = new Map();
function record(name, details) { report.checks.push({ name, status: 'PASS', ...details }); }
function noteApi(viewport, stage, p, method) {
  const key = `${viewport} ${stage} ${method} ${p}`;
  const entry = apiSeen.get(key) || { viewport, stage, path: p, method, count: 0 };
  entry.count += 1; apiSeen.set(key, entry);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-extensions', '--disable-background-networking'] });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      let stage = 'bootstrap';
      const wallet = [];
      await context.exposeBinding('qaWalletRequest', (_, method) => { const item = { viewport: viewport.width, stage, method }; wallet.push(item); report.walletRequests.push(item); });
      await context.addInitScript(({ address }) => {
        localStorage.setItem('wcore_address', address);
        window.__gmEvents = []; window.addEventListener('wcore-gm-done', e => window.__gmEvents.push(e.detail));
        const provider = {
          request: async ({ method }) => {
            await window.qaWalletRequest(method);
            if (method === 'eth_accounts') return [address];
            if (method === 'eth_chainId') return '0x1';
            if (method === 'eth_getCode') return '0x6000';
            throw new Error('QA_WALLET_REQUEST_FORBIDDEN: ' + method);
          },
          on() {}, removeListener() {},
        };
        window.ethereum = provider;
        const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: '00000000-0000-4000-8000-000000000001', name: 'QA synthetic provider', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'qa.invalid' }, provider } }));
        window.addEventListener('eip6963:requestProvider', announce); announce();
      }, { address });
      await context.route('**/*', async route => {
        const req = route.request(); const u = new URL(req.url());
        if (u.pathname.startsWith('/api/')) {
          noteApi(viewport.width, stage, u.pathname, req.method());
          let data = {};
          if (u.pathname === '/api/auth/me') data = { address, gmStreak: 0, gmOffChainToday: false, gmOnChainToday: false };
          else if (u.pathname === '/api/gm/status') data = { chains: [] };
          else if (u.pathname === '/api/gm/my-contracts') data = { contracts: [] };
          else if (u.pathname === '/api/gm/historical-contracts') data = [{ id: 'qa-historical', chainKey: 'superposition', contractAddress: contract, creatorAddress: address, createdAt: '2026-01-01T00:00:00.000Z', isHistorical: true }];
          else if (u.pathname === '/api/gm/has-deployed') data = { deployed: false };
          else if (u.pathname === '/api/gm/random') data = { chainKey: 'superseed', chainId: 5330, contractAddress: contract };
          return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true' }, body: JSON.stringify(data) });
        }
        if (u.pathname === '/build.json') return route.fulfill({ json: { GmOnChain: { bin: '0x6000', abi: [] }, GmFactory: { bin: '0x6000', abi: [] } } });
        if (u.origin === base) return route.continue();
        report.externalBlocked.push({ viewport: viewport.width, origin: u.origin, type: req.resourceType() });
        return route.abort('blockedbyclient');
      });
      await context.routeWebSocket('**/*', ws => { if (!ws.url().startsWith(base.replace('http:', 'ws:'))) ws.close(); else ws.connectToServer(); });
      const page = await context.newPage();
      page.on('pageerror', e => report.errors.push({ viewport: viewport.width, error: e.message }));

      // ---- /gm : Superseed absent du catalogue, même dans une recherche explicite ----
      await page.goto(base + '/gm', { waitUntil: 'domcontentloaded', timeout: 180000 });
      const search = page.getByRole('searchbox', { name: 'Search chains' });
      await search.waitFor({ timeout: 180000 });
      await search.fill('superseed');
      await page.waitForTimeout(1000);
      stage = 'actions';
      assert.equal(await page.getByText('Superseed', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'GM', exact: true }).count(), 0);
      assert.equal(await page.getByText('✅ GM Done', { exact: true }).count(), 0);
      record('Superseed : aucune carte active ni action GM', { viewport: viewport.width });
      report.screenshots.push(path.relative(root, path.join(dir, `gm-superseed-${viewport.width}.png`)));
      await page.screenshot({ path: path.join(dir, `gm-superseed-${viewport.width}.png`), fullPage: true });

      await search.fill('');
      const historical = page.getByText('Retired chain — read-only', { exact: true });
      await historical.waitFor({ state: 'attached' });
      await historical.scrollIntoViewIfNeeded();
      const historicalCard = historical.locator('..');
      assert.equal(await historicalCard.getByRole('button').count(), 0);
      assert.equal(await page.getByText('Superposition', { exact: true }).count(), 1);
      record('Superposition : uniquement historique read-only (fixture), pas de carte active', { viewport: viewport.width });
      await page.screenshot({ path: path.join(dir, `gm-historical-${viewport.width}.png`), fullPage: true });
      report.screenshots.push(path.relative(root, path.join(dir, `gm-historical-${viewport.width}.png`)));

      if (viewport.width < 640) await page.getByRole('button', { name: 'More options', exact: true }).click();
      await page.getByRole('button', { name: 'Say GM', exact: true }).click();
      let dialogMessage = '';
      page.once('dialog', async dialog => { dialogMessage = dialog.message(); await dialog.dismiss(); });
      await page.getByRole('button', { name: /On-chain/ }).click();
      await page.waitForTimeout(300);
      assert.match(dialogMessage, /Superseed.*removed/);
      record('GM global : tirage Superseed refusé, message affiché avant tout wallet', { viewport: viewport.width, message: dialogMessage });
      assert.equal(await page.getByText('✅ GM', { exact: true }).count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__gmEvents), []);
      assert.equal(wallet.filter(x => x.stage === 'actions').length, 0);

      // ---- /dev/deploy : guard avant wallet (clé, customChainId, contrôle positif) ----
      const deployCases = [
        { name: 'customChainId 0x14d2 via clé lisk', key: 'lisk', custom: '0x14d2', guarded: true },
        { name: 'contrôle positif lisk sans custom', key: 'lisk', custom: '', guarded: false },
      ];
      for (const c of deployCases) {
        const tag = `deploy:${c.name}`;
        stage = `bootstrap-${tag}`;
        await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('gm_impl_')) localStorage.removeItem(k); });
        await page.goto(base + '/dev/deploy', { waitUntil: 'domcontentloaded', timeout: 180000 });
        const select = page.locator('main select');
        await select.waitFor({ timeout: 180000 });
        assert.equal(await select.locator('option[value="superseed"]').count(), 0);
        await select.selectOption(c.key);
        if (c.custom) await page.getByPlaceholder(/Custom chainId/).fill(c.custom);
        stage = tag;
        const before = wallet.length;
        await page.getByRole('button', { name: 'Deploy GmOnChain', exact: true }).click();
        await page.waitForTimeout(500);
        const touched = wallet.length > before;
        const body = await page.locator('main').innerText();
        if (red) {
          assert(touched, `RED attendu : wallet appelé pour ${c.name}`);
          assert.match(body, /QA_WALLET_REQUEST_FORBIDDEN/);
        } else if (c.guarded) {
          assert.match(body, /Superseed.*removed/);
          assert.equal(touched, false, `aucun wallet attendu pour ${c.name}`);
        } else {
          assert.equal(touched, true, `le guard ne doit pas bloquer ${c.name}`);
          assert.doesNotMatch(body, /Superseed.*removed/);
        }
        record(`/dev/deploy implémentation — ${c.name} → ${c.guarded ? 'refus affiché avant wallet' : 'non bloqué (guard ciblé)'} (${red ? 'RED' : 'GREEN'})`, { viewport: viewport.width, walletTouched: touched });
        if (c.guarded || red) {
          await page.getByRole('textbox', { name: 'Implementation', exact: true }).fill(contract);
          const beforeF = wallet.length;
          await page.getByRole('button', { name: 'Deploy GmFactory', exact: true }).click();
          await page.waitForTimeout(500);
          const touchedF = wallet.length > beforeF;
          const bodyF = await page.locator('main').innerText();
          if (red) { assert(touchedF, `RED attendu : wallet factory appelé pour ${c.name}`); assert.match(bodyF, /QA_WALLET_REQUEST_FORBIDDEN/); }
          else { assert.match(bodyF, /Superseed.*removed/); assert.equal(touchedF, false, `aucun wallet factory attendu pour ${c.name}`); }
          record(`/dev/deploy factory — ${c.name} → ${red ? 'wallet appelé sans guard (RED)' : 'refus affiché avant wallet'}`, { viewport: viewport.width, walletTouched: touchedF });
        }
        await page.screenshot({ path: path.join(dir, `devdeploy-${phase}-${viewport.width}-${c.key}${c.custom ? '-custom' : ''}.png`), fullPage: true });
        report.screenshots.push(path.relative(root, path.join(dir, `devdeploy-${phase}-${viewport.width}-${c.key}${c.custom ? '-custom' : ''}.png`)));
      }

      assert.equal(wallet.filter(x => /sign|sendTransaction|switchChain|addEthereumChain|personal_sign|eth_sendTransaction/i.test(x.method)).length, 0);
      await context.close();
    }
    report.status = red ? 'RED_REPRODUCED' : 'PASS';
    report.BROWSER_E2E = 'EXECUTED';
  } finally { await browser.close(); }
})().catch(e => { report.status = 'FAIL'; report.failure = e.stack; process.exitCode = 1; })
  .finally(() => {
    report.finishedAt = new Date().toISOString();
    report.walletRequestSummary = report.walletRequests.reduce((acc, r) => { const k = `${r.viewport} ${r.stage} ${r.method}`; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    report.apiRequests = [...apiSeen.values()];
    // sépare bootstrap (connexion/rehydratation) et actions, objectif zéro après setup
    report.walletRequestsByStage = report.walletRequests.reduce((acc, r) => { const t = r.stage.startsWith('bootstrap') ? 'bootstrap' : 'actions'; acc[t] = (acc[t] || 0) + 1; return acc; }, {});
    fs.writeFileSync(path.join(dir, `result-${phase}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, walletByStage: report.walletRequestsByStage, failure: report.failure }, null, 2));
  });
