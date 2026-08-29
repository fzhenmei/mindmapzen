// 视图行数护栏（M5a 台账裁定，M5c 多文件化）：跨 shell 的 node 实现，替代 bash 单行脚本
// （.npmrc script-shell=bash 在 PowerShell 下会路由到 WSL bash 导致 node not found）。
// M5c：单文件 LIMIT 升级为配置数组——EditorView ≤300（M5a 旧限）+ LibraryView ≤520（M5d 终审欠账）。
import { readFileSync } from 'node:fs'

const FILES = [
  { path: '../src/views/EditorView.tsx', limit: 300 },
  { path: '../src/views/LibraryView.tsx', limit: 520 },
]

// 与 wc -l 口径一致：末行换行不计
const countLines = (rel) => {
  const rows = readFileSync(new URL(rel, import.meta.url), 'utf8').split('\n')
  if (rows[rows.length - 1] === '') rows.pop()
  return rows.length
}

let failed = false
for (const { path: rel, limit } of FILES) {
  const name = rel.split('/').pop()
  const lines = countLines(rel)
  if (lines > limit) {
    console.error(`${name} ${lines} exceeds ${limit}`)
    failed = true
  } else {
    console.log(`${name} ${lines}/${limit} OK`)
  }
}
if (failed) process.exit(1)
