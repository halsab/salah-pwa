import { defineConfig, devices } from '@playwright/test'

const port = 4175

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  expect: {
    timeout: process.env.CI ? 15_000 : 5_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${port}/salah-pwa/`,
    trace: 'retain-on-failure',
  },
  projects: [
    // Release gate: основной сценарий, offline, privacy и CSP.
    {
      name: 'chromium',
      testMatch: [
        '**/smoke.spec.ts',
        '**/offline.spec.ts',
        '**/privacy.spec.ts',
        '**/security.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
    },
    // Критические сценарии мобильного WebKit (portrait).
    {
      name: 'mobile-safari-portrait',
      testMatch: '**/mobile.spec.ts',
      use: { ...devices['iPhone 13'] },
    },
    // Обновление service worker меняет dist/sw.js; запускается строго после остальных.
    {
      name: 'chromium-sw',
      testMatch: '**/sw-update.spec.ts',
      dependencies: ['chromium', 'mobile-safari-portrait'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/salah-pwa/`,
    reuseExistingServer: !process.env.CI,
  },
})
