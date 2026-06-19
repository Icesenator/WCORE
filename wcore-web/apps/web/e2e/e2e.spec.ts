import { test, expect } from "@playwright/test";

const _API = "http://127.0.0.1:4000";
const WEB = "http://localhost:3000";
const TEST_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

test.describe("WCORE E2E", () => {

  // 1. Home page loads
  test("home page loads with title and form", async ({ page }) => {
    await page.goto(WEB);
    await expect(page).toHaveTitle(/WCORE/);
    // Home page uses h2, not h1 ("Your crypto. Every chain. One view.")
    await expect(page.locator("h2")).toContainText("Your crypto");
    await expect(page.locator('input#address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scan' })).toBeVisible();
  });

  // 2. Chain selector opens/search
  test("chain selector opens and searches", async ({ page }) => {
    await page.goto(WEB);
    await page.click("text=Show all chains");
    const input = page.locator('input[placeholder*="Search"]');
    await expect(input).toBeVisible();
    // Verify search filters the extended list
    await input.fill("Moonbeam");
    await expect(page.locator('div:has(> input[placeholder*="Search"])').getByText('Moonbeam', { exact: true })).toBeVisible();
  });

  // 3. Scan wallet EVM standard (requires live API with DB — skipped in local dev)
  test.skip("scan EVM wallet returns results", async ({ page }) => {
    await page.goto(`${WEB}/wallet/${TEST_ADDRESS}?chains=BASE&deep=0`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const el = document.querySelector("main");
      return el?.textContent?.includes("€") && !el.textContent.includes("0,00 €");
    }, { timeout: 120000 });
    await expect(page.getByText('Base', { exact: true }).first()).toBeVisible();
    await expect(page.locator('main').getByText('ETH', { exact: true }).first()).toBeVisible();
    const total = page.locator("text=Portefeuille").locator("..").locator("p.text-2xl, p.text-3xl");
    const text = await total.first().textContent();
    expect(text).toMatch(/[\d.,]+.€/);
  });

  // 4. Wallet with zero-value is visible (requires live API — skipped in local dev)
  test.skip("degraded chain visible with DEGRADED badge", async ({ page }) => {
    await page.goto(`${WEB}/wallet/0x0000000000000000000000000000000000000000?chains=BASE&deep=0`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const el = document.querySelector("main");
      return el?.textContent?.includes("Base") || el?.textContent?.includes("DEGRADED") || el?.textContent?.includes("Failed");
    }, { timeout: 120000 });
    const body = page.locator("main");
    await expect(body).toBeVisible();
  });

  // 5. Collapsible diagnostics visible (requires live API — skipped in local dev)
  test.skip("chain diagnostics expand/collapse", async ({ page }) => {
    await page.goto(`${WEB}/wallet/${TEST_ADDRESS}?chains=BASE&deep=0`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("€"), { timeout: 120000 });
    const errBtn = page.locator("button:has-text('error')").first();
    if (await errBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await errBtn.click();
      await expect(page.locator("text=RPC").or(page.locator("text=Pricing")).or(page.locator("text=Other"))).toBeVisible();
    }
  });

  // 6. Leaderboard loads
  test("leaderboard page loads", async ({ page }) => {
    await page.goto(`${WEB}/leaderboard`);
    await expect(page.locator("h1")).toContainText("Leaderboard");
    // Loads even if empty
    await expect(page.locator("main")).toBeVisible();
  });

  // 7. Profile shows connect prompt when not connected
  test("profile page shows connect prompt when unauthenticated", async ({ page }) => {
    await page.goto(`${WEB}/profile`);
    await expect(page.locator("h1")).toContainText(/Profil|Profile/);
    await expect(page.getByRole('button', { name: 'Connect wallet' }).first()).toBeVisible();
  });

  // 8. Language switch FR/EN
  test("language switch toggles translations", async ({ page }) => {
    await page.goto(WEB);
    // Check for Scan button (present in both FR and EN)
    await expect(page.getByRole('button', { name: 'Scan' })).toBeVisible();

    // Click EN button if visible
    const enBtn = page.locator("button:has-text('EN')");
    if (await enBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await enBtn.click();
      await page.waitForTimeout(500);
      // After switching to EN, verify some EN text is visible
      await expect(page.getByText(/Your crypto/i)).toBeVisible();
    }
  });

  // 9. Currency switch impacts amounts (requires live API — skipped in local dev)
  test.skip("currency switch changes displayed values", async ({ page }) => {
    await page.goto(`${WEB}/wallet/${TEST_ADDRESS}?chains=BASE&deep=0`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("main")?.textContent?.includes("€"), { timeout: 120000 });
    const usdBtn = page.locator("button:has-text('USD')");
    if (await usdBtn.isVisible()) {
      await usdBtn.click();
      await page.waitForTimeout(1000);
      const body = page.locator("main");
      const text = await body.textContent();
      expect(text).toMatch(/\$/);
    }
  });

  // 10. Deep scan checkbox visible on home
  test("deep scan toggle visible on home page", async ({ page }) => {
    await page.goto(WEB);
    const deepLabel = page.locator("text=Deep scan").or(page.locator("text=Scan profond"));
    await expect(deepLabel).toBeVisible();
  });
});
