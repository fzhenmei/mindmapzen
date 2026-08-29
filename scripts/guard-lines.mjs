// EditorView 行数护栏（M5a 台账裁定）：跨 shell 的 node 实现，替代 bash 单行脚本
// （.npmrc script-shell=bash 在 PowerShell 下会路由到 WSL bash 导致 node not found）
import { readFileSync } from 'node:fs'

const LIMIT = 300
const path = new URL('../src/views/EditorView.tsx', import.meta.url)
const rows = readFileSync(path, 'utf8').split('\n')
if (rows[rows.length - 1] === '') rows.pop() // 与 wc -l 口径一致：末行换行不计
const lines = rows.length
if (lines > LIMIT) {
  console.error(`EditorView ${lines} exceeds ${LIMIT}`)
  process.exit(1)
}
console.log(`EditorView ${lines}/${LIMIT} OK`)
