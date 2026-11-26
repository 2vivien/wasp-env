import { defineConfig, devices } from '@playwright/test'

const port = 3100
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    navigationTimeout: 60_000,
    expect: { timeout: 10_000 },
    trace: 'on-first-retry',
    extraHTTPHeaders: { 'Cache-Control': 'no-cache' },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `next dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://user:password@127.0.0.1:5432/wasp?sslmode=require',
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? 'dummy-secret-of-at-least-32-characters',
      BETTER_AUTH_URL: baseURL,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? 'dummy-client',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? 'dummy-secret',
    },
  },
})
