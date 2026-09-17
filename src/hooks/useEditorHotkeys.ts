// src/hooks/useEditorHotkeys.ts —— 编辑器全局快捷键（验收轮拆自 EditorView，行数护栏）：
// Ctrl+C 复制 / Ctrl+S 保存 / Ctrl+P 快速切换浮层 / Ctrl+Tab 切上一张（v2.5）/
// Ctrl+1/2/3 三态直达 导图/Markdown/看板（2026-09 画布三态，经 getState 读现值无陈旧闭包）/
// 正文面板开关 Shift+F2（2026-09-06 备注合并：原备注对话框快捷键改指面板，toggle 语义；
// 同入口 = 砚栏 btn-body 与浮条 node-action-body）。监听只绑一次（闭包取首渲染值），各入口
// 均走 refs（anyDialogRef）或稳定引用，无需重绑（M5a 收敛裁定）。
import { useEffect, type RefObject } from 'react'
import type { ViewMode } from '../store/appStore'

/** 正文面板快捷键命中（spec §3）：Shift+F2 开/关面板；裸 F2 留给引擎原生文字编辑 */
const isBodyHotkey = (e: KeyboardEvent): boolean => e.shiftKey && e.key === 'F2'

/** 输入域守卫（Ctrl+C / 三态直达 / Alt+← 同族）：焦点在 input/textarea/contenteditable
 *  （节点编辑框/正文面板/AI 输入框/看板列底与过滤输入）时放行原生行为不截获——防丢草稿 */
const inEditable = (e: KeyboardEvent): boolean => {
  const t = e.target
  return t instanceof Element && t.closest('input, textarea, [contenteditable="true"]') !== null
}

/** 三态直达键位表（2026-09 画布三态）：Ctrl+1 导图 / Ctrl+2 Markdown / Ctrl+3 看板 */
const DIRECT_VIEW: Record<string, ViewMode | undefined> = { '1': 'mindmap', '2': 'markdown', '3': 'kanban' }

interface Params {
  /** 复制 Markdown（Ctrl+C 的快捷键路径；与引擎 Control+c 节点复制对调，后者挪 Control+Shift+c 见 MindMapCanvas） */
  doCopy(): void
  /** 显式保存链（Ctrl+S 的快捷键路径） */
  explicitSave(): void
  /** 开关正文弹窗（useBodyDialog.toggle；EditorView 装配悬停优先 uid——悬停预览在场编辑
   *  被预览节点，否则选中；无选中也开——弹窗出空态文案） */
  toggleBodyDialog(): void
  /** 任一对话框在开（EditorView 渲染期同步）：正文面板/切换快捷键互斥守卫 */
  anyDialogRef: RefObject<boolean>
  /** 呼出快速切换浮层（Ctrl+P；v2.5） */
  openQuickSwitch(): void
  /** Ctrl+Tab 步进（v2.5：呼出轮换浮层/循环移动高亮，Shift 反向；落定在 keyup Ctrl，见 useQuickSwitch） */
  cycleStep(reverse: boolean): void
  /** 视图模式直达（2026-09 画布三态）：Ctrl+1/2/3 → 导图/Markdown/看板（EditorView 组合，
   *  getState 读现值同值 no-op）；Ctrl+Shift+K 已退役（直达键覆盖翻转语义） */
  switchViewMode(v: ViewMode): void
  /** 返回来路（2026-09 导航系统 spec §7）：Alt+← 的快捷键路径（EditorView 组合 guardAiTurn+leaveTo） */
  goBack(): void
}

export function useEditorHotkeys({ doCopy, explicitSave, toggleBodyDialog, anyDialogRef, openQuickSwitch, cycleStep, switchViewMode, goBack }: Params): void {
  useEffect(() => {
    /** Ctrl/Cmd 命令族（v2.5 拆出：onKey 认知复杂度护栏）：按序匹配，命中返回 true 由 onKey 统一 preventDefault */
    const ctrlCommand = (e: KeyboardEvent): boolean => {
      const k = e.key.toLowerCase()
      // 裸 Ctrl/Cmd+C 复制 Markdown（对调：md 复制高频占裸键，原引擎 Control+c 节点复制在
      // Control+Shift+c）。输入域守卫：焦点在输入域时放行原生复制选中文本，不截获成整图 md
      if (k === 'c' && !e.shiftKey && !inEditable(e)) {
        doCopy()
        return true
      }
      if (k === 's') {
        explicitSave()
        return true
      }
      // 三态直达（2026-09 画布三态，DIRECT_VIEW 键位表）：刻意不进 anyDialog 互斥——
      // 视图模式不是对话框（浮层自带出路），从看板/Markdown 一键回导图任何时刻都应可达。
      // 输入域守卫同族（防切态丢草稿——正文面板/AI 输入框/看板列底与过滤输入）
      const direct = DIRECT_VIEW[k]
      if (direct !== undefined && !inEditable(e)) {
        switchViewMode(direct)
        return true
      }
      // 切换族（v2.5）：对话框互斥期 no-op。轮换浮层开着时 Tab 由 useQuickSwitch 的
      // 捕获监听接管（stopPropagation 截停，本监听收不到），不受此守卫影响
      if (e.key === 'Tab' && !anyDialogRef.current) {
        cycleStep(e.shiftKey)
        return true
      }
      if (k === 'p' && !anyDialogRef.current) {
        openQuickSwitch()
        return true
      }
      return false
    }

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ctrlCommand(e)) {
        e.preventDefault()
        return
      }
      if (isBodyHotkey(e)) {
        e.preventDefault()
        // 守卫同切换族：对话框互斥期 no-op（面板非对话框，但快捷键让位互斥总线）
        if (!anyDialogRef.current) toggleBodyDialog()
      }
      // 返回来路（2026-09 导航系统 spec §7）：Alt+←（浏览器回退惯例）。输入域守卫同
      // Ctrl+1/2/3——正文面板/AI 输入框/看板过滤输入中放行，防丢草稿；对话框互斥守卫
      // 同切换族（终审修复）——模态在开（含 App 级设置/历史框）时 no-op，不幕后保存并导航
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowLeft' && !anyDialogRef.current && !inEditable(e)) {
        e.preventDefault()
        goBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 监听只绑一次（闭包取首渲染值），explicitSave/doCopy/toggleBodyDialog/切换族守卫均走 refs 或稳定引用无需重绑
  }, [])
}
