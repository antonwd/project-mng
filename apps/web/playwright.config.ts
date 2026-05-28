import { defineConfig } from "@playwright/test";

const MOCK_API_PORT = process.env.MOCK_API_PORT ?? "3001";
const WEB_PORT = process.env.WEB_PORT ?? "3002";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: `node tests/e2e/mock-api.mjs`,
      env: { MOCK_API_PORT },
      port: Number(MOCK_API_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `next dev --port ${WEB_PORT}`,
      env: {
        PM_API_URL: `http://localhost:${MOCK_API_PORT}`,
        NEXT_PUBLIC_WEBAUTHN_RP_ID: "localhost",
      },
      port: Number(WEB_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
  ],
});
