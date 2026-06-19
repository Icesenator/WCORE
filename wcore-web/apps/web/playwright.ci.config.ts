import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120000,
  expect: { timeout: 20000 },
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node .next/standalone/apps/web/server.js",
    port: 3000,
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      PORT: "3000",
      HOSTNAME: "localhost",
    },
  },
});
