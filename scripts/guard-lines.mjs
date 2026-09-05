// 视图行数护栏（M5a 台账裁定，M5c 多文件化）：跨 shell 的 node 实现，替代 bash 单行脚本
// （.npmrc script-shell=bash 在 PowerShell 下会路由到 WSL bash 导致 node not found）。
// M5c：单文件 LIMIT 升级为配置数组——EditorView ≤300（M5a 旧限）+ LibraryView ≤520（M5d 终审欠账）。
// M18：EditorView 300→320（图标管理器接线：hook + NodeActions 钮 + 对话框渲染的功能性增长）。
// M19：EditorView 320→360（插图：打开链 imgMeta 构建 + useImageEdit 接线 + ImageDialog 渲染）。
// v2.5：EditorView 360→380（快速切换：逻辑已拆 useQuickSwitch，浮层渲染 + 砚栏钮 + 快捷键接线）。
// 2026-09（v2.6 UI 打磨批）：380→405（题签统计行 + 复制路径接线 + onSaved 组合；同批
// 拆 useOpenDocument/EditorErrorPanel、三浮动框迁 EditorDialogs，还掉 develop 既有超欠）。
// 2026-09（v2.7.0 修复批）：405→420（还清 f60b744「图片绝对路径」批 419 未升限的欠账 +
// 复制路径出口分隔符归一 +1）。
// 2026-09（v2.7 后续）：420→440（补记 161d9b0「画布砚栏新建导图入口」批 +20 漏账：
// newMapOpen 态 + anyDialog 互斥列 + 砚栏钮 + newMap 槽组装——功能性增长，无腐化）。
// 2026-09（圈选批量操作批）：440→450（多选浮条 MultiSelectBar 渲染接线 + import，+7；
// 选中镜像派生在 useActiveSelection，浮条本体在 MultiSelectBar.tsx——功能性增长，无腐化）。
// 2026-09（复制选项移入砚栏批）：450→460（copySettings 订阅 + 砚栏两 props 接线，+4；
// split button 本体在 ZenBar.tsx（无护栏）——功能性增长，无腐化）。
// 2026-09（收藏与排序批）：520→550（收藏行派生/排序适用 + 树四 props 接线 + 重命名
//  relocate + 详情星标钮两 props——收藏组与排序钮本体在 DirectoryTree.tsx（无护栏），
//  relocate 在 appStore/useTreeMoves——功能性增长，无腐化）。
// 2026-09（正文面板批）：460→480（useBodyPanel 接线 + 砚栏两 props + BodyPanel 渲染 +
//  让位 resize effect + body-open 挂类，+15；面板本体在 BodyPanel.tsx、状态在
//  useBodyPanel.ts（均无护栏）——功能性增长，无腐化）。
import { readFileSync } from 'node:fs'

const FILES = [
  { path: '../src/views/EditorView.tsx', limit: 480 },
  { path: '../src/views/LibraryView.tsx', limit: 550 },
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
