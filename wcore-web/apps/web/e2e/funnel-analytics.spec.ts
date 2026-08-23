import { test, expect } from "@playwright/test";

const TEST_ADDRESS = "0x1111111111111111111111111111111111111111";

test("One portfolio funnel never sends wallet data", async ({ page }) => {
  const payloads: unknown[] = [];
  await page.route("**/api/analytics/events", async (route) => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.route("**/api/chains", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ chains: [{ key: "BASE", vm: "EVM" }] }) });
  });
  await page.route("**/api/scan/batch", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ wallets: [{ address: TEST_ADDRESS, chains: [{ chainKey: "BASE", chainName: "Base", native: null, tokens: [], positions: [], totals: { valueEur: 0, tokenCount: 0 }, errors: [], scanMs: 5 }] }] }),
    });
  });

  await page.goto("/?campaign=one_portfolio");
  await page.locator("#address").fill(TEST_ADDRESS);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.waitForURL(/\/wallet\//);
  await expect.poll(() => payloads.length).toBeGreaterThan(1);

  const serialized = JSON.stringify(payloads);
  expect(serialized).toContain("campaign_landing_viewed");
  expect(serialized).toContain("scan_started");
  expect(serialized).not.toContain(TEST_ADDRESS);
  expect(serialized).not.toContain("/wallet/");
});

test("analytics outage does not block scan navigation", async ({ page }) => {
  await page.route("**/api/analytics/events", async (route) => {
    await route.abort("failed");
  });

  await page.goto("/?campaign=one_portfolio");
  await page.locator("#address").fill(TEST_ADDRESS);
  await page.getByRole("button", { name: "Scan", exact: true }).click();
  await page.waitForURL(/\/wallet\//);
});
