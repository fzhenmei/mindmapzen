import type { CapacitorConfig } from '@capacitor/cli'

// App 化配置(spec §5):CapacitorHttp 把 fetch patch 为原生 OkHttp——绕过 WebView
// CORS,sync.ts 零改动;webDir 即 vite build 产物
const config: CapacitorConfig = {
  appId: 'com.mindmapzen.capture',
  appName: 'Mind Map Zen 捕获',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: { enabled: true },
    // 沉浸式系统栏(2026-09-27):App 界面恒浅色,状态栏/手势栏固定深色图标;
    // 不配则跟随系统深浅色,深色系统下白图标浮在 #faf9f7 上看不清
    SystemBars: { style: 'LIGHT' },
  },
}

export default config
