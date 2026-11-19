import { defineConfig, devices } from "@playwright/test";

const customerAppUrl =
  process.env.PLAYWRIGHT_CUSTOMER_APP_URL ??
  "http://app.sovrack.localhost:13080";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results/artifacts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: customerAppUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
