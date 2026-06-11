// playwright.config.js — визуальные/click-smoke тесты фронтенда EngiBoard.
// Гоняет РЕАЛЬНЫЙ dist/index.html (тот же, что встроен в десктоп-сборку) в
// браузерном движке. На Windows используем канал msedge — это тот же
// Chromium/WebView2-движок, что и в Tauri-сборке под Windows, поэтому
// CSS/JS-баги и работа кликов/тогглов воспроизводятся 1:1.
//
// Нативную оболочку (capture, fingerprint, tray, drag файлов) этот сьют не
// покрывает — только UI. Для нативного — отдельный tauri-driver E2E (TODO).

const { defineConfig, devices } = require('@playwright/test');

const PORT = 7788;

module.exports = defineConfig({
  testDir: './tests/ui',
  // визуальные тесты — последовательно, чтобы скриншоты были стабильны
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  timeout: 30000,
  expect: { timeout: 8000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // demo-аккаунт включается до загрузки → приложение само вызывает showApp()
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'eb_account', value: 'demo' }] }] },
  },
  // статически отдаём dist/ (тот же фронтенд, что и в десктопе)
  webServer: {
    command: `node tests/static-server.js`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  projects: [
    // Windows CI: реальный движок WebView2 (Edge)
    { name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    // локально на mac/linux — обычный chromium
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
