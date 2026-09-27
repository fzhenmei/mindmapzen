import type { CapacitorConfig } from '@capacitor/cli'

// App 化配置(spec §5):CapacitorHttp 把 fetch patch 为原生 OkHttp——绕过 WebView
// CORS,sync.ts 零改动;webDir 即 vite build 产物
const config: CapacitorConfig = {
  appId: 'com.mindmapzen.capture',
  appName: 'MZ 捕获',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: { enabled: true },
  },
}

export default config
