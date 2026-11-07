import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests: real API + real database + real Next.js app, driven in a browser.
 * Requires PostgreSQL with the test database (see README). Run: pnpm e2e
 */
const DB = process.env.TEST_DATABASE_URL ?? 'postgres://nuriva_dev:nuriva_dev_local_only@localhost:5432/nuriva_test';
const KEY = 'e2e1:' + Buffer.alloc(32, 7).toString('base64'); // fixed throwaway key for the disposable test DB

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 860 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @nuriva/db migrate && pnpm --filter @nuriva/api start',
      url: 'http://localhost:4100/health',
      env: { NURIVA_ENV: 'test', PORT: '4100', DATABASE_URL: DB, NURIVA_DATA_KEYS: KEY, AUTH_RATE_LIMIT: '1000' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @nuriva/admin exec next start -p 3200',
      url: 'http://localhost:3200/en/login',
      env: { API_ORIGIN: 'http://localhost:4100' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @nuriva/web exec next start -p 3100',
      url: 'http://localhost:3100/en',
      env: { API_ORIGIN: 'http://localhost:4100' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
