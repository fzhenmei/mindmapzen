import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // e2e 系统语言钉中文(2026-09 i18n):存量 spec 断言中文文案;语言切换行为由 language-switch.spec 显式覆盖
  use: { baseURL: 'http://localhost:5173', locale: 'zh-CN' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
