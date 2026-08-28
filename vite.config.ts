import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Tauri 固定端口，避免每次变更
  server: {
    port: 5173,
    strictPort: true,
    // 不监视 Rust 构建目录：cargo 编译时会锁定其中的 .exe，vite 监视会 EBUSY 崩溃
    watch: { ignored: ['**/src-tauri/**'] },
  },
  // Vitest（e2e/ 下的 Playwright spec 不归 Vitest 管，交给 npm run e2e）
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
