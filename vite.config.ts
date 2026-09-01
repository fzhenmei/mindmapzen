import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { gitShortHash } from './scripts/appMeta.mjs'

/** 构建期版本信息（2026-09 关于页）：版本号自 package.json、commit 短哈希自 git
 *  （计算在 scripts/appMeta.mjs）。dev/build/单测共用本 define（vitest 同吃此配置） */
const appVersion = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')).version as string
const gitCommit = gitShortHash()

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __GIT_COMMIT__: JSON.stringify(gitCommit),
  },
  // Tauri 固定端口，避免每次变更
  server: {
    port: 5173,
    strictPort: true,
    // 不监视 Rust 构建目录：cargo 编译时会锁定其中的 .exe，vite 监视会 EBUSY 崩溃
    watch: { ignored: ['**/src-tauri/**'] },
  },
  // mermaid 动态 import 预优化（M17 验收修复）：不预声明则 dev 首次动态 import 触发
  // 运行时 re-optimize + full-reload，旧页面持有的模块图过期 → Failed to fetch
  // dynamically imported module；预优化消灭该窗口
  optimizeDeps: { include: ['mermaid'] },
  // Vitest（e2e/ 下的 Playwright spec 不归 Vitest 管，交给 npm run e2e）
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
