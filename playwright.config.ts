import { defineConfig, devices } from "@playwright/test";

/**
 * Browser checks against the *static export* (out/), served the way a CDN
 * would serve it. Run `npm run build` first.
 *
 * Tests run serially in one worker: they use real RainViewer data, and the
 * provider allows ~100 requests per IP per minute.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "node scripts/serve-out.mjs",
    url: "http://localhost:4173",
    reuseExistingServer: true,
  },
});
