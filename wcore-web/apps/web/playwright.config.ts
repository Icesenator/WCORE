import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180000,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "powershell -Command \"$env:NODE_ENV='development'; pnpm --filter @wcore/api dev\"",
      port: 4000,
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: "pnpm --filter @wcore/web dev",
      port: 3000,
      reuseExistingServer: true,
      timeout: 60000,
    },
  ],
});
