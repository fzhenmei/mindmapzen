import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// 手机捕获 App(spec 2026-09-27 Android 化):Capacitor WebView 加载本地 dist,
// SW/manifest 不再存在(vite-plugin-pwa 已随 PWA 退役移除)。
// defineConfig 取自 vitest/config(vite 8 + vitest 4 下 test 字段需要该类型),dev/build/单测共用
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5174 },
  test: { environment: 'jsdom' },
})
