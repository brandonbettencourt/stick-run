import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const systemChromePath = '/usr/bin/google-chrome';
const useSystemChrome =
  !process.env.PW_BUNDLED_CHROMIUM && existsSync(systemChromePath);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1280, height: 720 },
    ...(useSystemChrome ? { channel: 'chrome' } : {}),
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
