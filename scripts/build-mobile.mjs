// scripts/build-mobile.mjs —— mobile PWA 构建入口(2026-09-26 手机捕获 spec §9):
// 检测 mobile/node_modules 缺失时先 install(贡献者 clone 后首个 build:all 免手动步骤),
// 然后在 mobile/ 内跑 build(tsc --noEmit + vite build)。产物 mobile/dist 由
// tauri.conf.json bundle.resources 映射为 resource_dir/mobile-dist,运行时 Rust 服务读取。
// node 实现同 build-release.mjs 先例(npm scripts 走 cmd.exe,链式命令语义脆弱)。
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const mobileDir = join(process.cwd(), 'mobile')

if (!existsSync(join(mobileDir, 'node_modules'))) {
  console.log('[build-mobile] mobile/node_modules 缺失,先安装依赖')
  const inst = spawnSync('npm', ['install'], { cwd: mobileDir, stdio: 'inherit', shell: true })
  // spawn 整体失败(如 npm 不在 PATH)时 status 为 null,不打印则只剩无痕退出
  if (inst.error) console.error('[build-mobile] install spawn 失败', inst.error)
  if (inst.status !== 0) process.exit(inst.status ?? 1)
}

const r = spawnSync('npm', ['run', 'build'], { cwd: mobileDir, stdio: 'inherit', shell: true })
if (r.error) console.error('[build-mobile] build spawn 失败', r.error)
process.exit(r.status ?? 1)
