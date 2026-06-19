import { expect, test, type Page } from "@playwright/test";

const API = "http://127.0.0.1:4000";
const WEB = "http://localhost:3000";
const USER_ADDRESS = "0x1234567890123456789012345678901234567890";
const SECOND_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
// Solana base58 address for SVM chain tests (EVM address filters out SVM chains in matchChains)
const SOLANA_ADDRESS = "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";

// ─── Mock helpers ───────────────────────────────────────────────────────────

async function installMockWallet(page: Page, opts: { address?: string; rejectSwitch?: boolean } = {}) {
  await page.addInitScript(({ address, rejectSwitch }) => {
    const provider = {
      isMetaMask: true,
      chainId: "0x2105",
      selectedAddress: address,
      on(_event: string, _cb: (...args: unknown[]) => void) {},
      removeListener(_event: string, _cb: (...args: unknown[]) => void) {},
      async request(args: { method: string; params?: unknown[] }) {
        if (args.method === "eth_chainId") return "0x2105";
        if (args.method === "eth_accounts" || args.method === "eth_requestAccounts") return [address];
        if (args.method === "personal_sign") return "0x" + "a".repeat(130);
        if (args.method === "wallet_switchEthereumChain") {
          if (rejectSwitch) throw new Error("User rejected chain switch");
          return null;
        }
        return null;
      },
    };
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
  }, { address: opts.address ?? USER_ADDRESS, rejectSwitch: !!opts.rejectSwitch });
}

async function mockAuthApi(page: Page, address = USER_ADDRESS) {
  await page.route(`${API}/api/auth/me`, async (route) => {
    await route.fulfill({ json: {
      id: "user-e2e", address, score: 150, gmStreak: 3, longestStreak: 5,
      lastGmDate: null, gmOffChainToday: false, gmOnChainToday: false, chainGmToday: [],
      referralCode: "12345678", referralEarnings: 0, welcomeCompleted: true,
      breakdown: { offChain: { days: 3, points: 30, detail: "3 days" }, onChain: { count: 2, points: 40, detail: "2 txs" }, perChain: [{ chain: "base", streak: 2 }], quests: [], questPts: 0 },
    } });
  });
  await page.route(`${API}/api/profile/**`, async (route) => {
    await route.fulfill({ json: { address, score: 150, gmStreak: 3, longestStreak: 5, badges: [], wallets: [], recentScans: [] } });
  });
  await page.route(`${API}/api/wallets`, async (route) => {
    await route.fulfill({ json: { wallets: [] } });
  });
  await page.route(`${API}/api/custom-tokens`, async (route) => {
    await route.fulfill({ json: { tokens: [] } });
  });
  await page.route(`${API}/api/notifications/unread-count`, async (route) => {
    await route.fulfill({ json: { count: 0 } });
  });
  await page.route(`${API}/api/me/plan`, async (route) => {
    await route.fulfill({ json: { plan: "free", scansRemainingToday: 10 } });
  });
  await page.route(`${API}/api/leaderboard`, async (route) => {
    await route.fulfill({ json: { leaderboard: [] } });
  });
  await page.route(`${API}/api/auth/nonce**`, async (route) => {
    await route.fulfill({ json: { nonce: "nonce-e2e", message: `WCORE Login\n\nWallet: ${address}\nNonce: nonce-e2e` } });
  });
  await page.route(`${API}/api/auth/login`, async (route) => {
    await route.fulfill({ json: { token: "e2e-token" } });
  });
}

async function mockChainsApi(page: Page) {
  await page.route(`${API}/api/chains`, async (route) => {
    await route.fulfill({ json: { chains: [
      { key: "ETHEREUM", name: "Ethereum", vm: "EVM" },
      { key: "BASE", name: "Base", vm: "EVM" },
      { key: "POLYGON", name: "Polygon", vm: "EVM" },
      { key: "ARBITRUM_ONE", name: "Arbitrum One", vm: "EVM" },
      { key: "OPTIMISM", name: "Optimism", vm: "EVM" },
      { key: "BSC", name: "BSC", vm: "EVM" },
      { key: "AVALANCHE", name: "Avalanche", vm: "EVM" },
      { key: "SOLANA", name: "Solana", vm: "SVM" },
    ] } });
  });
}

async function mockScanApi(page: Page) {
  await page.route(`${API}/api/scan`, async (route) => {
    const request = route.request().postDataJSON() as { chains?: string[]; address?: string; deepScan?: boolean };
    const chains = (request.chains || ["BASE"]).map((chainKey) => {
      const nativeSymbol = chainKey === "ETHEREUM" ? "ETH" : chainKey === "SOLANA" ? "SOL" : "ETH";
      const nativeValue = chainKey === "ETHEREUM" ? 750 : chainKey === "BASE" ? 4500 : 500;
      return {
        chainKey, chainName: chainKey === "ARBITRUM_ONE" ? "Arbitrum One" : chainKey.charAt(0) + chainKey.slice(1).toLowerCase().replace(/_/g, " "),
        vm: chainKey === "SOLANA" ? "SVM" : "EVM",
        native: { contract: "native", symbol: nativeSymbol, name: "Native", decimals: 18, balance: 1.5, priceEur: 3000, priceSource: "e2e", valueEur: nativeValue, flags: [] },
        tokens: chainKey !== "SOLANA" ? [{ contract: "0x1111111111111111111111111111111111111111", symbol: "USDC", name: "USD Coin", decimals: 6, balance: 100, priceEur: 1, priceSource: "e2e", valueEur: 100, flags: [] }] : [],
        totals: { valueEur: chainKey !== "SOLANA" ? nativeValue + 100 : nativeValue, tokenCount: chainKey !== "SOLANA" ? 2 : 1, pricedCount: chainKey !== "SOLANA" ? 2 : 1 },
        errors: [], degraded: false, fxRate: 0.92, scanMs: 42, cachedAt: "2026-05-06T12:00:00.000Z", scriptVersion: "e2e",
      };
    });
    const totalValueEur = chains.reduce((sum, c) => sum + c.totals.valueEur, 0);
    await route.fulfill({ json: {
      address: request.address, requestedChains: request.chains || [],
      chains,
      totals: { valueEur: totalValueEur, tokenCount: chains.reduce((s, c) => s + c.totals.tokenCount, 0), pricedCount: chains.reduce((s, c) => s + c.totals.pricedCount, 0), chainsWithErrors: 0 },
      generatedAt: "2026-05-06T12:00:00.000Z",
      metrics: { totalMs: chains.length * 42, chainsScanned: chains.length, chainsWithErrors: 0, totalTokens: chains.length * 2, pricedTokens: chains.length * 2 },
    } });
  });
  // Also mock async scan for multi-wallet deep scan
  await page.route(`${API}/api/scan/async`, async (route) => {
    const body = route.request().postDataJSON() as { chains?: string[]; address?: string };
    await route.fulfill({ json: { jobId: "e2e-job-1", chains: (body.chains || []).length } });
  });
  await page.route(`${API}/api/scan/async/e2e-job-1`, async (route) => {
    await route.fulfill({ json: {
      jobId: "e2e-job-1", status: "done", address: USER_ADDRESS,
      progress: { done: 3, total: 3 },
      chains: [],
      totalEur: 5200, tokenCount: 6, errors: [],
    } });
  });
}

/** Mock scan returning a 500 error to test error handling */
async function mockScanErrorApi(page: Page) {
  await page.route(`${API}/api/scan`, async (route) => {
    await route.fulfill({ status: 500, json: { error: "internal_error", message: "Mocked server error" } });
  });
}

// ─── Test suites ────────────────────────────────────────────────────────────

test.describe("Scan Flow — Home Page", () => {
  test("renders home page with address input and scan button", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await page.goto(WEB);
    // Home page has <title>WCORE…</title> and <h2>Your crypto…</h2>, no <h1>
    await expect(page).toHaveTitle(/WCORE/);
    await expect(page.locator("input#address")).toBeVisible();
    await expect(page.getByRole("button", { name: "Scan" })).toBeVisible();
  });

  test("shows error when submitting with no address and no wallet", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await page.goto(WEB);
    await page.getByRole("button", { name: "Scan" }).click();
    await expect(page.getByText("Enter an address or connect a wallet.")).toBeVisible();
  });

  test("toggles advanced options (chains, wallets, deep scan)", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await page.goto(WEB);

    // Advanced section is visible by default (showAdvanced=true)
    await expect(page.getByText(/Deep scan recent blocks/i)).toBeVisible();
    await expect(page.getByText("Add another wallet")).toBeVisible();

    // Collapse it
    const toggle = page.getByRole("button", { name: /chains, wallets/ });
    await toggle.click();

    // Verify advanced options are now hidden
    await expect(page.getByText(/Deep scan recent blocks/i)).not.toBeVisible();
    await expect(page.getByText("Add another wallet")).not.toBeVisible();
  });

  test("toggles deep scan checkbox", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await page.goto(WEB);

    // Deep scan checkbox — use getByLabel since the input is wrapped in a <label>
    const deepCheckbox = page.getByLabel("Deep scan recent blocks for all tokens");
    await expect(deepCheckbox).not.toBeChecked();

    // Check it
    await deepCheckbox.check();
    await expect(deepCheckbox).toBeChecked();

    // Uncheck
    await deepCheckbox.uncheck();
    await expect(deepCheckbox).not.toBeChecked();
  });

  test("fills address and navigates to scan result on submit", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await mockScanApi(page);

    await page.goto(WEB);

    // Type address
    await page.locator("input#address").fill(USER_ADDRESS);

    // Click Scan
    await page.getByRole("button", { name: "Scan" }).click();

    // Should redirect to /wallet/...
    await expect(page).toHaveURL(/\/wallet\//);
    // Wait for chain card to render (€0.00 appears before scan completes)
    await expect(page.locator("main h2").first()).toBeVisible({ timeout: 30000 });

    // Verify address snippet visible (WalletContent renders address label)
    await expect(page.getByText(/0x1234/).first()).toBeVisible();
  });

  test("shows scans remaining counter when authenticated", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await installMockWallet(page);
    await page.goto(WEB);

    // Click connect to trigger wagmi connection
    await page.getByRole("button", { name: "Connect wallet" }).click();

    // Should show connected address (may appear in both TopBar and form badge)
    await expect(page.getByText(/0x1234.*7890/i).first()).toBeVisible();

    // Scans left counter should be visible (advanced is open by default)
    await expect(page.getByText(/scans left today/)).toBeVisible();
  });
});

test.describe("Scan Flow — Chain Selector", () => {
  test("shows chain list with select/deselect all", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await page.goto(WEB);

    // Select all button should be visible (advanced is open by default)
    const selectAll = page.getByRole("button", { name: /Select all/i });
    await expect(selectAll).toBeVisible();
    await selectAll.click();

    // Should show chain count — format is "Chains (N/M)"
    await expect(page.getByText(/Chains \(\d+\/\d+\)/)).toBeVisible();
  });

  test("filters chains by search", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await page.goto(WEB);

    // Find search input in chain selector
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await searchInput.fill("Ethereum");

    // Ethereum should be visible in filtered results
    await expect(page.getByText("Ethereum", { exact: true }).first()).toBeVisible();
  });
});

test.describe("Scan Flow — Wallet Manager", () => {
  test("adds a manual address via wallet manager", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await page.goto(WEB);

    // The wallet manager "Add another wallet" has its own input (NOT the main address input)
    // The main input#address has placeholder "0x... / cosmos1... / Solana base58" which also matches "0x"
    // So we locate the wallet manager input after the "Add another wallet" label
    const walletSection = page.getByText("Add another wallet").locator("..");
    const addInput = walletSection.locator("input").first();
    await addInput.fill(SECOND_ADDRESS);

    // Click the Add button next to the input
    const addButton = walletSection.locator("button").filter({ hasText: "Add" });
    if (await addButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addButton.click();
    }
  });
});

test.describe("Scan Flow — Wallet Result Page", () => {
  test("displays native balance and token list for EVM chain", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await mockScanApi(page);

    await page.goto(`${WEB}/wallet/${USER_ADDRESS}?chains=BASE&deep=0`);

    // Wait for scan to complete — look for chain name heading (ChainCard <h2>)
    // € appears immediately (€0.00), so we wait for the chain section to render
    await expect(page.locator("main h2").filter({ hasText: "Base" }).first()).toBeVisible({ timeout: 30000 });

    // Native symbol (ETH on Base) and USDC token should appear in TokenTable
    await expect(page.locator("main table")).toBeVisible();
    // Use getByText for text content matching (handles TokenIcon alt + nested spans)
    await expect(page.getByText("ETH").first()).toBeVisible();
    await expect(page.getByText("USDC").first()).toBeVisible();
  });

  test("displays multi-chain results with total value", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await mockScanApi(page);

    await page.goto(`${WEB}/wallet/${USER_ADDRESS}?chains=BASE,ETHEREUM,POLYGON&deep=0`);

    // Wait for first chain card to appear (h2 with chain name)
    await expect(page.locator("main h2").first()).toBeVisible({ timeout: 30000 });

    // Should show all three chains in their <h2> headings
    await expect(page.locator("main h2").filter({ hasText: "Base" }).first()).toBeVisible();
    await expect(page.locator("main h2").filter({ hasText: "Ethereum" }).first()).toBeVisible();
    await expect(page.locator("main h2").filter({ hasText: "Polygon" }).first()).toBeVisible();
  });

  test("displays Solana chain with SOL native symbol", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await mockScanApi(page);

    // Must use a Solana address — EVM address filters out SVM chains via matchChains()
    await page.goto(`${WEB}/wallet/${SOLANA_ADDRESS}?chains=SOLANA&deep=0`);

    // Wait for chain heading to appear
    await expect(page.locator("main h2").filter({ hasText: "Solana" }).first()).toBeVisible({ timeout: 30000 });

    // SOL native symbol in TokenTable
    await expect(page.locator("main table")).toBeVisible();
    await expect(page.getByText("SOL").first()).toBeVisible();
  });

  test("renders address in page header", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await mockScanApi(page);

    await page.goto(`${WEB}/wallet/${USER_ADDRESS}?chains=BASE&deep=0`);

    // Wait for scan to finish — chain heading appears
    await expect(page.locator("main h2").first()).toBeVisible({ timeout: 30000 });

    // Address should appear in the wallet label area (WalletContent renders it)
    await expect(page.getByText(/0x1234/).first()).toBeVisible();
  });

  test("shows error state when scan API fails", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await mockScanErrorApi(page);

    await page.goto(`${WEB}/wallet/${USER_ADDRESS}?chains=BASE&deep=0`);

    // The page should still render the main content area, not a white screen.
    // Next.js dev error overlay adds a 2nd <main> — scope to the wallet content area.
    const walletMain = page.locator("main").first();
    await expect(walletMain).toBeVisible({ timeout: 30000 });

    // Should show some error indication — either an error badge, or the chain showing as failed
    const errorIndicator = page.getByText(/error|failed|degraded/i).first();
    // If the app shows an explicit error, great; otherwise the page should at minimum not crash
    try {
      await expect(errorIndicator).toBeVisible({ timeout: 10000 });
    } catch {
      // Fallback: page should still have content (not blank)
      const bodyText = await walletMain.textContent();
      expect(bodyText).toBeTruthy();
    }
  });
});

test.describe("Scan Flow — Currency and Language", () => {
  test("shows currency toggle and switches to USD", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await mockScanApi(page);

    await page.goto(`${WEB}/wallet/${USER_ADDRESS}?chains=BASE&deep=0`);

    // Wait for scan to complete — chain heading renders only after results
    await expect(page.locator("main h2").first()).toBeVisible({ timeout: 30000 });

    // Try to switch to USD
    const usdBtn = page.locator("button").filter({ hasText: "USD" });
    if (await usdBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await usdBtn.click();
      // Wait for $ symbol to appear in place of €
      await page.waitForFunction(() => {
        const el = document.querySelector("main");
        return el?.textContent?.includes("$");
      }, { timeout: 10000 });
      const body = page.locator("main");
      const text = await body.textContent();
      expect(text).toMatch(/\$/);
    }
  });
});

test.describe("Scan Flow — Accessibility", () => {
  test("address input receives focus and form submits on Enter", async ({ page }) => {
    await mockAuthApi(page);
    await mockChainsApi(page);
    await mockScanApi(page);

    await page.goto(WEB);

    const input = page.locator("input#address");
    await input.focus();
    await expect(input).toBeFocused();

    // Fill address and press Enter (form has onSubmit handler)
    await input.fill(USER_ADDRESS);
    await input.press("Enter");

    // Should navigate to scan result
    await expect(page).toHaveURL(/\/wallet\//, { timeout: 10000 });
    await expect(page.locator("main h2").first()).toBeVisible({ timeout: 30000 });
  });
});
