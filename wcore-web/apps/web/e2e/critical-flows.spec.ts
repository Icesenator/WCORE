import { expect, test, type Page } from "@playwright/test";

// The Next.js standalone build inlines NEXT_PUBLIC_API_URL at build time.
// E2E_API_URL must match the baked-in value (default: http://127.0.0.1:4000).
// E2E_WEB_URL is the standalone web server URL.
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
const WEB = process.env.E2E_WEB_URL ?? "http://localhost:3000";
const USER_ADDRESS = "0x1234567890123456789012345678901234567890";
const PLATFORM_OWNER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";
const CONTRACT_ADDRESS = "0xabc123def456abc123def456abc123def456abcd";

async function installMockWallet(page: Page, opts: { address?: string; rejectSwitch?: boolean } = {}) {
  await page.addInitScript(({ address, rejectSwitch }) => {
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    const txs: Array<{ method: string; params?: unknown[] }> = [];
    const provider = {
      isMetaMask: true,
      chainId: "0x2105",
      selectedAddress: address,
      on(event: string, cb: (...args: unknown[]) => void) {
        listeners[event] = listeners[event] || [];
        listeners[event]!.push(cb);
      },
      removeListener(event: string, cb: (...args: unknown[]) => void) {
        listeners[event] = (listeners[event] || []).filter((fn) => fn !== cb);
      },
      async request(args: { method: string; params?: unknown[] }) {
        txs.push(args);
        if (args.method === "eth_chainId") return "0x2105";
        if (args.method === "eth_accounts" || args.method === "eth_requestAccounts") return [address];
        if (args.method === "personal_sign" || args.method === "eth_signTypedData_v4") return "0x" + "a".repeat(130);
        if (args.method === "wallet_switchEthereumChain") {
          if (rejectSwitch) throw new Error("User rejected chain switch");
          return null;
        }
        if (args.method === "eth_sendTransaction") {
          if (rejectSwitch) throw new Error("User rejected chain switch");
          return "0x" + "b".repeat(64);
        }
        if (args.method === "eth_getTransactionReceipt") return { status: "0x1", logs: [] };
        if (args.method === "eth_call") return "0x" + "0".repeat(63) + "1";
        return null;
      },
      __txs: txs,
    };
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: {
        info: {
          uuid: "wcore-e2e-wallet",
          name: "MetaMask E2E",
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
          rdns: "io.metamask.e2e",
        },
        provider,
      },
    }));
    window.addEventListener("eip6963:requestProvider", announce);
    queueMicrotask(announce);
  }, { address: opts.address ?? USER_ADDRESS, rejectSwitch: !!opts.rejectSwitch });
}

async function connectMockWallet(page: Page) {
  const connectButton = page.getByRole("button", { name: "Connect wallet" }).first();
  await expect(connectButton).toBeVisible();
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((candidate) => candidate.textContent?.trim().toLowerCase() === "connect wallet");
    (button as HTMLButtonElement | undefined)?.click();
  });
  const walletOption = page.getByRole("button", { name: /MetaMask E2E/ });
  if (await walletOption.isVisible({ timeout: 1000 }).catch(() => false)) {
    await walletOption.click();
  }
}

async function mockCommonApi(page: Page, address = USER_ADDRESS) {
  // Catch-all mock: intercept ALL API calls and respond based on path.
  // Using a single broad pattern avoids subtle route-matching issues on staging.
  await page.route(`${API}/**`, async (route) => {
    const url = route.request().url();
    if (url.includes("/api/auth/nonce")) {
      await route.fulfill({ json: { nonce: "nonce-e2e", message: `WCORE Login\n\nWallet: ${address}\nNonce: nonce-e2e` } });
    } else if (url.includes("/api/auth/login")) {
      // Must include `user` field — ConnectButton checks `data.user` to set authStep="authenticated"
      await route.fulfill({ json: { user: { id: "user-e2e", address } } });
    } else if (url.includes("/api/auth/me")) {
      await route.fulfill({ json: {
        id: "user-e2e",
        address,
        score: 185,
        gmStreak: 4,
        longestStreak: 8,
        lastGmDate: null,
        gmOffChainToday: false,
        gmOnChainToday: false,
        breakdown: {
          offChain: { days: 4, points: 40, detail: "4 days" },
          onChain: { count: 3, points: 75, detail: "3 txs" },
          perChain: [{ chain: "base", streak: 3 }],
          quests: [],
          questPts: 0,
        },
      } });
    } else if (url.includes("/api/profile")) {
      await route.fulfill({ json: {
        address,
        score: 185,
        gmStreak: 4,
        longestStreak: 8,
        badges: [{ key: "first_scan", title: "Pioneer", icon: "P" }],
        recentScans: [{ chains: ["BASE"], totalEur: 1234.56, tokenCount: 2, createdAt: "2026-05-06T12:00:00.000Z" }],
      } });
    } else if (url.includes("/api/leaderboard")) {
      await route.fulfill({ json: { leaderboard: [{ address, score: 185, gmStreak: 4 }] } });
    } else if (url.includes("/api/wallets")) {
      await route.fulfill({ json: { wallets: [{ id: "wallet-1", address, label: "Main E2E" }] } });
    } else if (url.includes("/api/custom-tokens")) {
      await route.fulfill({ json: { tokens: [] } });
    } else if (url.includes("/api/notifications/unread-count")) {
      await route.fulfill({ json: { count: 1 } });
    } else if (url.includes("/api/notifications/notif-1/read")) {
      await route.fulfill({ json: { success: true } });
    } else if (url.includes("/api/notifications")) {
      await route.fulfill({ json: { notifications: [{ id: "notif-1", type: "gm", title: "GM received", body: "Creator tip received", read: false, metadata: null, createdAt: "2026-05-06T12:00:00.000Z" }] } });
    } else if (url.includes("/api/gm/onchain")) {
      await route.fulfill({ json: { streak: 5, onChain: true, txVerified: true } });
    } else if (url.includes("/api/gm/contracts/contract-1/balance")) {
      await route.fulfill({ json: { creatorBalance: "1500000000000000", platformBalance: "2500000000000000", chainKey: "base", contractAddress: CONTRACT_ADDRESS } });
    } else if (url.includes("/api/gm/my-contracts")) {
      // Must include balances — GmContractsPanel renders GmWithdrawButton per contract
      await route.fulfill({ json: { contracts: [{ id: "contract-1", chainKey: "base", contractAddress: CONTRACT_ADDRESS, creatorBalance: "1500000000000000", platformBalance: "2500000000000000" }] } });
    } else if (url.includes("/api/gm/status")) {
      // Per-chain GM status — the ChainCard's useGmChain reads this to see if deployed
      await route.fulfill({ json: { base: { deployed: true, gmDone: false } } });
    } else if (url.includes("/api/gm/has-deployed")) {
      // useGmChain fallback to check deployment for specific chain+wallet
      await route.fulfill({ json: { hasDeployed: true } });
    } else if (url.includes("/api/gm/random")) {
      await route.fulfill({ json: { chainKey: "base", contractAddress: CONTRACT_ADDRESS } });
    } else if (url.includes("/api/gm/contracts")) {
      await route.fulfill({ json: { contracts: [{ chainKey: "base", contractAddress: CONTRACT_ADDRESS }] } });
    } else if (url.includes("/api/price/native")) {
      await route.fulfill({ json: { price: 3000 } });
    } else if (url.includes("/api/price/eth")) {
      await route.fulfill({ json: { price: 3000, source: "e2e" } });
    } else if (url.includes("/api/chains")) {
      await route.fulfill({ json: { chains: [
        { key: "BASE", name: "Base", vm: "EVM" },
        { key: "ETHEREUM", name: "Ethereum", vm: "EVM" },
      ] } });
    } else if (url.includes("/api/scan")) {
      const body = route.request().postDataJSON() as { chains?: string[]; address?: string; addresses?: string[] } | null;
      const reqChains = body?.chains || ["BASE"];
      const now = "2026-05-06T12:00:00.000Z";
      const chains = reqChains.map((chainKey) => ({
        chainKey,
        chainName: chainKey === "ETHEREUM" ? "Ethereum" : "Base",
        vm: "EVM",
        native: {
          contract: "native", symbol: "ETH", name: "Ether", decimals: 18,
          balance: chainKey === "ETHEREUM" ? 0.25 : 1.5,
          priceEur: 3000, priceSource: "e2e",
          valueEur: chainKey === "ETHEREUM" ? 750 : 4500,
          flags: [],
        },
        tokens: [{
          contract: "0x1111111111111111111111111111111111111111",
          symbol: chainKey === "ETHEREUM" ? "USDC" : "WCORE",
          name: chainKey === "ETHEREUM" ? "USD Coin" : "WCORE Token",
          decimals: 6, balance: 100, priceEur: 1, priceSource: "e2e", valueEur: 100, flags: [],
        }],
        totals: { valueEur: chainKey === "ETHEREUM" ? 850 : 4600, tokenCount: 2, pricedCount: 2 },
        errors: [], degraded: false, fxRate: 0.92, scanMs: 42, cachedAt: now, scriptVersion: "e2e",
      }));
      const totals = { valueEur: chains.reduce((sum, c) => sum + c.totals.valueEur, 0), tokenCount: chains.length * 2, pricedCount: chains.length * 2, chainsWithErrors: 0 };
      const response = url.includes("/api/scan/batch")
        ? { wallets: (body?.addresses ?? []).map((walletAddress) => ({ address: walletAddress, chains, totals })) }
        : {
        address: body?.address,
        requestedChains: reqChains,
        chains,
        totals,
        generatedAt: now,
      };
      await route.fulfill({ json: response });
    } else {
      // Fallback: return empty success for any unmocked endpoint
      await route.fulfill({ json: {} });
    }
  });
}

async function connectFromProfile(page: Page, address = USER_ADDRESS, opts: { rejectSwitch?: boolean } = {}) {
  await installMockWallet(page, { address, rejectSwitch: opts.rejectSwitch });
  await page.addInitScript(() => {
    window.alert = (message?: unknown) => {
      window.localStorage.setItem("e2e:last-alert", String(message));
    };
  });
  await mockCommonApi(page, address);
  await page.goto(`${WEB}/profile`);
  await connectMockWallet(page);
  // Use dynamic regex based on actual address (not hardcoded)
  await expect(page.getByText(new RegExp(`${address.slice(0, 6)}.*${address.slice(-4)}`, "i")).first()).toBeVisible();

  // Some connector paths stop at "ready". Trigger SIWE directly through the
  // rendered control, then wait until authenticated-only UI is available.
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button"))
      .find((candidate) => candidate.textContent?.trim() === "Sign In");
    (button as HTMLButtonElement | undefined)?.click();
  });
  const signInWalletOption = page.getByRole("button", { name: /MetaMask E2E/ });
  if (await signInWalletOption.isVisible({ timeout: 1000 }).catch(() => false)) {
    await signInWalletOption.click();
  }
  await expect(page.getByRole("button", { name: /Sign In|Sign in your wallet/i })).toHaveCount(0);
}

async function mockScanApi(_page: Page) {
  // All scan/chains routes are now handled by mockCommonApi's catch-all
}

async function mockGmApi(_page: Page) {
  // All GM routes are now handled by mockCommonApi's catch-all
}

test.describe("critical mocked E2E flows", () => {
  test("connects with a mocked EIP-1193 wallet", async ({ page }) => {
    await installMockWallet(page);
    await mockCommonApi(page);

    await page.goto(WEB);
    await connectMockWallet(page);

    await expect(page.getByText(/0x1234\.\.\.7890/i)).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("wcore_address"))).toBe("0x1234567890123456789012345678901234567890");
  });

  test("renders a mocked multi-chain scan result", async ({ page }) => {
    await mockCommonApi(page);
    await mockScanApi(page);

    await page.goto(`${WEB}/wallet/${USER_ADDRESS}?chains=BASE,ETHEREUM&deep=0`);

    await expect(page.getByText("Base", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Ethereum", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("WCORE", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("USDC", { exact: true })).toBeVisible();
    await expect(page.locator("main").getByText(/2 chains/).first()).toBeVisible();
  });

  test("sends an on-chain GM through the mocked wallet", async ({ page }) => {
    await mockGmApi(page);
    await connectFromProfile(page);
    const today = new Date().toISOString().slice(0, 10);

    await page.getByRole("button", { name: /Say GM/i }).click();
    await expect(page.getByRole("button", { name: /On-chain/i })).toBeVisible();
    await page.getByRole("button", { name: /On-chain/i }).click();

    // sendGm() sets wc_gm_onchain_chains as JSON: { [chainKey]: today }
    // It does NOT set legacy keys like wc_gm_onchain_tx / wc_gm_onchain_date / wc_gm_onchain_chain
    await expect.poll(async () => {
      const raw = await page.evaluate(() => localStorage.getItem("wc_gm_onchain_chains"));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, string>;
      return {
        baseDate: parsed["base"],
        alert: await page.evaluate(() => localStorage.getItem("e2e:last-alert")),
      };
    }).toMatchObject({
      baseDate: today,
      alert: null,
    });
  });

  test("off-chain GM date alone does not block per-chain ChainCard GM", async ({ page }) => {
    await mockGmApi(page);
    await mockScanApi(page);
    await connectFromProfile(page);
    const today = new Date().toISOString().slice(0, 10);
    await page.evaluate((date) => {
      localStorage.setItem("wc_gm_date", date);
      localStorage.removeItem("wc_gm_onchain_date");
      localStorage.removeItem("wc_gm_onchain_chain");
    }, today);

    await page.goto(`${WEB}/wallet/${USER_ADDRESS}?chains=BASE&deep=0`);

    await expect(page.getByText("Base", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel(/Send on-chain GM/i)).toBeEnabled();
    await expect(page.getByLabel(/GM already done today/i)).toHaveCount(0);
  });

  test("shows creator and platform contract balances by role", async ({ page }) => {
    await mockGmApi(page);
    await connectFromProfile(page, PLATFORM_OWNER);

    await page.getByRole("button", { name: "GM Contracts" }).click();

    // When contracts exist, GmContractsPanel renders contract cards (no "My GM Contracts" header)
    // Look for the withdrawable tip banner + contract address
    await expect(page.getByText(/contract with withdrawable tips/)).toBeVisible();
    await expect(page.getByText(CONTRACT_ADDRESS)).toBeVisible();
    // GmWithdrawButton renders "💸 Fees Earned: 0.001500 ETH" (not "Creator: ...")
    await expect(page.getByText(/Fees Earned: 0\.001500/)).toBeVisible();
    // Platform balance renders "💸 Fees Platform: 0.002500 ETH"
    await expect(page.getByText(/Fees Platform: 0\.002500/)).toBeVisible();
    // The platform withdraw button exists
    await expect(page.getByRole("button", { name: /Fees Platform/ })).toBeVisible();
  });

  test("opens notifications and marks one as read", async ({ page }) => {
    await mockGmApi(page);
    await connectFromProfile(page);

    await page.getByRole("button", { name: "Notifications" }).click();

    await expect(page.getByText("GM received")).toBeVisible();
    await page.getByText("GM received").click();
    await expect(page.getByText("1 unread")).not.toBeVisible();
  });

  test("surfaces a wallet rejection when on-chain GM cannot send", async ({ page }) => {
    await mockGmApi(page);
    await connectFromProfile(page, USER_ADDRESS, { rejectSwitch: true });

    await page.getByRole("button", { name: /Say GM/i }).click();
    await expect(page.getByRole("button", { name: /On-chain/i })).toBeVisible();
    await page.getByRole("button", { name: /On-chain/i }).click();

    await expect.poll(() => page.evaluate(() => localStorage.getItem("e2e:last-alert"))).toBeTruthy();
  });
});
