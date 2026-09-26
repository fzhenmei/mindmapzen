import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// 手机捕获 PWA(spec §4):dev 手机直连 5174(host:true);产物经 tauri resources 打包
// defineConfig 取自 vitest/config(vite 8 + vitest 4 下 test 字段需要该类型),dev/build/单测共用
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mind Map Zen 捕获',
        short_name: 'MZ 捕获',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#b3403a',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-256.png', sizes: '256x256', type: 'image/png' },
        ],
      },
    }),
  ],
  server: { host: true, port: 5174 },
  test: { environment: 'jsdom' },
})
