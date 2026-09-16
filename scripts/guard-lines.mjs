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
//  让位 resize effect + body-open 挂类 + 保存前冲刷正文草稿（审查 I-2），+20；
//  面板本体在 BodyPanel.tsx、状态在 useBodyPanel.ts（均无护栏）——功能性增长，无腐化）。
// 2026-09（正文终审修复批）：480→490（doCopy 剥备注改树层接线 stripTreeNote +1；关闭
//  守卫 flushPending 冲刷口（终审 I2 关窗丢尾部草稿）+7——doCopy 改写超限升限，
//  功能性增长，无腐化）。
// 2026-09-06 备注合并：NoteDialog/useNoteEdit 接线退役，490→484（useNoteEdit 调用/互斥项/
//  砚栏两 props/对话框 note 槽接线全删，实测 479 + 5 行余量；卸载 Tiptap 系依赖，
//  面板主体换原生 textarea——拆除性收缩，非腐化）。
// 2026-09（节点标签批）：484→506（useTagPicker 接线 + NodeActions 钮 + tagPicker 槽
//  组装，实测 500 + 6 行余量；选择器本体在 TagPickerDialog.tsx、状态在 useTagPicker.ts
//  （均无护栏）——功能性增长，无腐化）。
// 2026-09-09（Shift+F2 悬停优先 + 无目标警告签批）：506→530（悬停 uid ref + 入口守卫
//  toggleBodyOrWarn + WarnStamp 渲染接线，实测 520 + 10 行余量；警告签本体在
//  WarnStamp.tsx（无护栏）、无目标判定在入口层（useBodyDialog 空态语义不动）——
//  功能性增长，无腐化）。
// 2026-09（AI Agent v1 Task11）：530→600（ChatPanel 右栏挂载：面板开合/拖宽两态 +
// 配置/落盘宽订阅 + 入口开关（未配置隐藏）+ onActiveChange 上下文上行 + 卸载 reset +
// 引擎 resize 补调 + canvas-host 让位接线，实测 588 + 12 行余量；面板本体在
// ChatPanel.tsx（无护栏）——功能性增长，非腐化）。
// 2026-09（AI Agent v1 Task12 锁定接线）：600→650（AI 回合锁：guardAiTurn 拦截 helper +
// 切图三处包装 + 关窗 blockClose/onBlocked 注入 + 状态签 AiTurnBadge 挂载 + aiPhase 订阅 +
// 多选浮条 deleteDisabled，实测 627 + 23 行余量；状态签本体在 AiTurnBadge.tsx、锁判定
// 在 chatStore（均无护栏）——功能性增长，非腐化）。
// 2026-09（看板模式 Task 7）：650→700（KanbanView 浮层挂载 + picker 显式 uid 桥接 +
// switchView/locateNode 组合（展开逻辑复用 statusOps.expandToUid，不重复实现）+ 砚栏
// 视图组两 props + 快捷键 toggleViewMode 接线，实测 697 + 3 行余量；浮层本体在
// KanbanView.tsx、视图态在 appStore、展开纯函数在 statusOps.ts（均无护栏）——功能性增长，非腐化）。
// 2026-09（看板模式 Task 8）：700→745（导图侧状态入口：statusPick 快照态 + applyStatus
// 组合（execOnRenderNode 寻址落 setIcon，复用 statusOps 三件套不重复实现）+ NodeActions
// 状态钮 + statusPicker 槽接线，实测 736 + 9 行余量；选择器本体在 StatusPickerDialog.tsx
// （无护栏）、命令落地在 statusOps.execOnRenderNode——功能性增长，非腐化）。
// 2026-09（工作台批 Task 9）：745→760（locateNode 首挂定位 miss 有限重试：引擎 render()
// 排 setTimeout 0，onCanvasReady 即时寻址必 miss、大图不居中，e2e 实锤——经
// node_tree_render_end 按 RENDER_RETRY_MAX 重试后居中，实测 750 + 10 行余量；
// 重试口径复用 statusOps 导出常量——功能性修复增长，无腐化）。
// 2026-09（工作台批）：WorkbenchView 初登 336（实测 326 + 10 余量）——聚合视图
// （看板/建议/最近/AI 浮层），子组件 WorkbenchCard 独立无护栏。
// 2026-09-14（工作台试用反馈批）：336→365（AI 浮层首 token 占位 + 停止钮 +
// Token 费用提示三件，实测 351 + 14 余量）——功能性增长，无腐化。
// 2026-09-14（AI 建议缓存批）：365→405（双条件缓存：askAi 命中短路 + aiTextRef
// 镜像 + 存档 + 再问一次钮，实测 393 + 12 余量）——功能性增长，无腐化。
// 2026-09（导航系统批）：405→420（头部设置齿轮：App 级设置对话框入口钮 +
//  imports，实测 408 + 12 余量；对话框渲染面在 AppDialogs——功能性增长，无腐化）。
import { readFileSync } from 'node:fs'

const FILES = [
  { path: '../src/views/EditorView.tsx', limit: 760 },
  { path: '../src/views/LibraryView.tsx', limit: 550 },
  { path: '../src/views/WorkbenchView.tsx', limit: 420 },
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
