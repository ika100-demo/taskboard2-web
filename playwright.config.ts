import { defineConfig } from "@playwright/test";

// SMOKE_BASE_URL points the tests at a running deployment (devbox run smoke); without it they start the app locally
// together with a stub of taskboard2-api (the stub state is global, hence one worker).
const smokeBaseUrl = process.env.SMOKE_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  ...(smokeBaseUrl
    ? {}
    : {
        workers: 1,
        webServer: [
          {
            command: "node e2e/support/stub-api.mjs",
            url: "http://127.0.0.1:4010/__stub/health",
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
          },
          {
            command: "pnpm build && pnpm start",
            url: "http://localhost:3000/api/health",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: { TASKBOARD2_API_URL: "http://127.0.0.1:4010" },
          },
        ],
      }),
  use: { baseURL: smokeBaseUrl || "http://localhost:3000" },
});
