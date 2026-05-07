import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the obelisk-dex e2e harness.
 *
 * Target selection (no rebuild needed):
 *   OBELISK_E2E_BASE_URL=http://localhost:3001   # default
 *   OBELISK_E2E_BASE_URL=https://obelisk.ar
 *
 * Reports + traces:
 *   - List reporter for live test progress.
 *   - HTML report at scripts/e2e/playwright-report/.
 *   - Trace + video are retained on failure so you can replay the
 *     browser timeline frame-by-frame: `npx playwright show-trace
 *     scripts/e2e/test-results/.../trace.zip`.
 */
const baseURL = process.env.OBELISK_E2E_BASE_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.ts$/,
  outputDir: './test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
  ],
  retries: 0,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Browser flags. Headless by default; set HEADED=1 to watch.
    headless: process.env.HEADED !== '1',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
