import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120000,
  expect: { timeout: 20000 },
  retries: 0,
  use: {
    baseURL: "http://localhost:3001",
    headless: true,
  },
  // No webServer — staging servers are already running on 3001/4001
});
