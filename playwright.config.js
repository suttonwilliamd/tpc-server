import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://playwright.dev/docs/test-configuration#environment-variables
 */
function getEnvVar(name) {
  let value = process.env[name];
  if (value === undefined) {
    const envFile = `.env.${process.env.NODE_ENV}`;
    const env = require('fs').readFileSync(envFile, 'utf8');
    const vars = env.split('\n').reduce((acc, line) => {
      const [key, ...rest] = line.split('=');
      if (key) acc[key.trim()] = rest.join('=').trim();
      return acc;
    }, {});
    value = vars[name];
  }
  return value;
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

});