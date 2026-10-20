import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
});
