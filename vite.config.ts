import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { gitShortHash } from './scripts/appMeta.mjs'
import { viteStaticCopy } from 'vite-plugin-static-copy'

/** 构建期版本信息（2026-09 关于页）：版本号自 package.json、commit 短哈希自 git
 *  （计算在 scripts/appMeta.mjs）。dev/build/单测共用本 define（vitest 同吃此配置） */
const appVersion = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')).version as string
const gitCommit = gitShortHash()

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // vditor 子资源本地化(2026-09 渲染统一):VDitor 动态加载 lute/mermaid/css 等
    // dist 子资源,默认走 unpkg CDN——离线 Tauri 必须本地化。VDitor 内部拼
    // `${cdn}/dist/js|css/...`,故拷 dist 内容到 vendor/vditor/dist、cdn 设 'vendor/vditor'。
    // rename.stripBase 3 剥掉 glob 匹配保留的 node_modules/vditor/dist 路径前缀——
    // 不剥则 dest 全部嵌套成 vendor/vditor/dist/node_modules/...(Task 2 e2e 实测 404)
    viteStaticCopy({
      targets: [
        { src: 'node_modules/vditor/dist/**/*', dest: 'vendor/vditor/dist', rename: { stripBase: 3 } },
      ],
    }),
  ],
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
  // Vitest（e2e/ 下的 Playwright spec 不归 Vitest 管，交给 npm run e2e）
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
