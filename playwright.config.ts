import { defineConfig, devices } from '@playwright/test'

const port = 4175

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  expect: {
    timeout: process.env.CI ? 15_000 : 5_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${port}/salah-pwa/`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/sw-update.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testIgnore: '**/sw-update.spec.ts',
      testMatch: ['**/cross-browser.spec.ts', '**/timezones.spec.ts'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testIgnore: '**/sw-update.spec.ts',
      testMatch: ['**/cross-browser.spec.ts', '**/timezones.spec.ts'],
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-safari-portrait',
      testIgnore: '**/sw-update.spec.ts',
      testMatch: ['**/cross-browser.spec.ts', '**/timezones.spec.ts'],
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'mobile-safari-landscape',
      testIgnore: '**/sw-update.spec.ts',
      testMatch: ['**/cross-browser.spec.ts', '**/timezones.spec.ts'],
      use: { ...devices['iPhone 13 landscape'] },
    },
    {
      name: 'chromium-sw',
      testMatch: '**/sw-update.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/salah-pwa/`,
    reuseExistingServer: !process.env.CI,
  },
})
