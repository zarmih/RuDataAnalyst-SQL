import { defineConfig, devices } from "@playwright/test";

const port = process.env.RUDATA_E2E_PORT || "8765";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "bash scripts/e2e_server.sh",
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      RUDATA_E2E_PORT: port,
      MOCK_MODEL: "true",
    },
  },
});
