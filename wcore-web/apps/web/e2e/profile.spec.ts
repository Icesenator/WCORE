import { test, expect } from "@playwright/test";

const API = "http://127.0.0.1:4000";
const WEB = "http://localhost:3000";
const TEST_ADDRESS = "0x1234567890123456789012345678901234567890";
const _PLATFORM_OWNER = "0x17d518736ee9341dcdc0a2498e013d33cfcdd080";

test.describe("Profile Page E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Simulate wallet connection via localStorage before page scripts run
    await page.addInitScript((address: string) => {
      localStorage.setItem("wcore_address", address);
    }, TEST_ADDRESS);

    // Mock authenticated API endpoints
    await page.route(
      (url) => url.href.includes("/api/profile/"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            address: TEST_ADDRESS,
            score: 150,
            gmStreak: 3,
            longestStreak: 5,
            badges: [{ key: "first_scan", title: "Pioneer", icon: "🔍" }],
            wallets: [],
            recentScans: [],
          }),
        });
      }
    );

    await page.route(
      (url) => url.href.includes("/api/auth/me"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "test-user-id",
            address: TEST_ADDRESS,
            score: 150,
            gmStreak: 3,
            longestStreak: 5,
            lastGmDate: null,
            breakdown: {
              offChain: { days: 3, points: 30, detail: "3 days" },
              onChain: { count: 2, points: 40, detail: "2 txs" },
              perChain: [{ chain: "base", streak: 2 }],
              quests: [],
              questPts: 0,
            },
          }),
        });
      }
    );

    await page.route(
      (url) => url.href === `${API}/api/leaderboard`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            leaderboard: [{ address: TEST_ADDRESS, score: 150, gmStreak: 3 }],
          }),
        });
      }
    );

    await page.route(
      (url) => url.href === `${API}/api/wallets`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ wallets: [] }),
        });
      }
    );

    await page.route(
      (url) => url.href === `${API}/api/custom-tokens`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ tokens: [] }),
        });
      }
    );
  });

  test("profile loads with wallet connected", async ({ page }) => {
    await page.route(
      (url) => url.href === `${API}/api/gm/my-contracts`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ contracts: [] }),
        });
      }
    );

    await page.goto(`${WEB}/profile`);

    // Full wallet address should be visible in the profile card
    await expect(page.locator("text=" + TEST_ADDRESS)).toBeVisible();
    // Connect button should NOT be visible when already connected
    await expect(page.getByRole("button", { name: "Connect wallet" })).not.toBeVisible();
    // Score should be visible
    await expect(page.locator("text=150").first()).toBeVisible();
  });

  test("My GM Contracts section visible when contracts exist", async ({ page }) => {
    await page.route(
      (url) => url.href === `${API}/api/gm/my-contracts`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            contracts: [
              {
                id: "contract-1",
                chainKey: "base",
                contractAddress: "0xabc123def456abc123def456abc123def456abcd",
              },
            ],
          }),
        });
      }
    );

    await page.route(
      (url) =>
        url.href.includes("/api/gm/contracts/") && url.href.endsWith("/balance"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            creatorBalance: "1000000000000000", // 0.001 ETH
            platformBalance: "2000000000000000",
            chainKey: "base",
            contractAddress: "0xabc123def456abc123def456abc123def456abcd",
          }),
        });
      }
    );

    await page.goto(`${WEB}/profile`);
    await expect(page.locator("text=My GM Contracts")).toBeVisible();
    await expect(page.locator("text=0xabc123def456abc123def456abc123def456abcd")).toBeVisible();
  });

  test("Withdraw Creator button disabled when balance is 0", async ({ page }) => {
    await page.route(
      (url) => url.href === `${API}/api/gm/my-contracts`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            contracts: [
              {
                id: "contract-1",
                chainKey: "base",
                contractAddress: "0xabc123def456abc123def456abc123def456abcd",
              },
            ],
          }),
        });
      }
    );

    await page.route(
      (url) =>
        url.href.includes("/api/gm/contracts/") && url.href.endsWith("/balance"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            creatorBalance: "0",
            platformBalance: "0",
            chainKey: "base",
            contractAddress: "0xabc123def456abc123def456abc123def456abcd",
          }),
        });
      }
    );

    await page.goto(`${WEB}/profile`);
    const withdrawBtn = page.locator("button:has-text('Withdraw Creator')");
    await expect(withdrawBtn).toBeVisible();
    await expect(withdrawBtn).toBeDisabled();
  });

  test("Withdraw Platform button NOT visible for non-owner", async ({ page }) => {
    await page.route(
      (url) => url.href === `${API}/api/gm/my-contracts`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            contracts: [
              {
                id: "contract-1",
                chainKey: "base",
                contractAddress: "0xabc123def456abc123def456abc123def456abcd",
              },
            ],
          }),
        });
      }
    );

    await page.route(
      (url) =>
        url.href.includes("/api/gm/contracts/") && url.href.endsWith("/balance"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            creatorBalance: "1000000000000000",
            platformBalance: "2000000000000000",
            chainKey: "base",
            contractAddress: "0xabc123def456abc123def456abc123def456abcd",
          }),
        });
      }
    );

    await page.goto(`${WEB}/profile`);
    // TEST_ADDRESS is not the platform owner, so the button should not exist
    await expect(page.locator("button:has-text('Withdraw Platform')")).not.toBeVisible();
  });

  test("Points breakdown visible", async ({ page }) => {
    await page.route(
      (url) => url.href === `${API}/api/gm/my-contracts`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ contracts: [] }),
        });
      }
    );

    await page.goto(`${WEB}/profile`);
    await expect(page.locator("text=Points breakdown")).toBeVisible();
    await expect(page.locator("text=Off-chain GM")).toBeVisible();
    await expect(page.locator("text=On-chain GM")).toBeVisible();
  });
});
