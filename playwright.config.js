import { defineConfig, devices } from '@playwright/test';

// The site is static, so the suite serves the repo root itself. Port 8766 is
// used deliberately, to stay clear of any hand-started dev server on 8765.
const PORT = 8766;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    // The coverage checklist copies samples to the clipboard, and the tests
    // read them back to prove the copied text is exact.
    permissions: ['clipboard-read', 'clipboard-write']
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],

  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'ignore'
  }
});
