// scripts/build-release.mjs —— release 打包入口（v2.5）：npm run build:release 一键出包。
// 唯一职责：自动定位 Windows SDK 的 rc.exe 并前置 PATH，再委托 tauri build——
// 改过 src-tauri/tauri.conf.json 或 capabilities/* 后 tauri-winres build script 会重跑，
// 需要 RC.EXE 而普通终端 PATH 没有（2026-09-01 实案：直接 build 报 panic
// "Are you sure you have RC.EXE in your $PATH"；平时吃编译缓存不触发，一触发才暴露）。
// node 实现（非 bash）：跟随 guard-lines.mjs 先例——.npmrc script-shell=bash 在
// PowerShell 下会路由到 WSL bash 导致脚本不可用。找不到 SDK 时警告放行（winres 有
// 缓存时不需要 RC，真缺会在下游报错里自说明）。参数原样透传（如 -- --no-bundle）
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SDK_BIN = join(
  process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
  'Windows Kits',
  '10',
  'bin',
)

/** 版本号最大的含 rc.exe 的 SDK x64 目录；无则 null（numeric collation 正确排
 *  '10.0.26100.0' 这类多段号；降序取首个） */
const findRcDir = () => {
  if (!existsSync(SDK_BIN)) return null
  const versions = readdirSync(SDK_BIN)
    .filter((d) => /^\d+(\.\d+)+$/.test(d))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  for (const v of versions) {
    const dir = join(SDK_BIN, v, 'x64')
    if (existsSync(join(dir, 'rc.exe'))) return dir
  }
  return null
}

const rcDir = findRcDir()
if (rcDir) {
  process.env.PATH = `${rcDir};${process.env.PATH}`
  console.log(`[build-release] SDK rc.exe：${rcDir}（已前置 PATH）`)
} else {
  console.warn('[build-release] 未找到 Windows SDK rc.exe——若本次触发了 winres 重编译会失败')
}

// 委托 tauri CLI：npx 在 Windows 是 .cmd，须 shell:true 才能拉起；退出码透传
const r = spawnSync('npx', ['tauri', 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
})
process.exit(r.status ?? 1)
