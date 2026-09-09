// src/hooks/useEditorHotkeys.ts —— 编辑器全局快捷键（验收轮拆自 EditorView，行数护栏）：
// Ctrl+C 复制 / Ctrl+S 保存 / Ctrl+P 快速切换浮层 / Ctrl+Tab 切上一张（v2.5）/
// 正文面板开关 Shift+F2（2026-09-06 备注合并：原备注对话框快捷键改指面板，toggle 语义；
// 同入口 = 砚栏 btn-body 与浮条 node-action-body）。监听只绑一次（闭包取首渲染值），各入口
// 均走 refs（anyDialogRef）或稳定引用，无需重绑（M5a 收敛裁定）。
import { useEffect, type RefObject } from 'react'

/** 正文面板快捷键命中（spec §3）：Shift+F2 开/关面板；裸 F2 留给引擎原生文字编辑 */
const isBodyHotkey = (e: KeyboardEvent): boolean => e.shiftKey && e.key === 'F2'

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
}

export function useEditorHotkeys({ doCopy, explicitSave, toggleBodyDialog, anyDialogRef, openQuickSwitch, cycleStep }: Params): void {
  useEffect(() => {
    /** Ctrl/Cmd 命令族（v2.5 拆出：onKey 认知复杂度护栏）：按序匹配，命中返回 true 由 onKey 统一 preventDefault */
    const ctrlCommand = (e: KeyboardEvent): boolean => {
      const k = e.key.toLowerCase()
      // 裸 Ctrl/Cmd+C 复制 Markdown（对调：md 复制高频占裸键，原引擎 Control+c 节点复制在
      // Control+Shift+c）。输入域守卫：焦点在 input/textarea/contenteditable（节点编辑框、
      // 正文面板文本区）时放行原生复制选中文本，不截获成整图 md
      if (k === 'c' && !e.shiftKey) {
        const t = e.target
        if (!(t instanceof Element && t.closest('input, textarea, [contenteditable="true"]'))) {
          doCopy()
          return true
        }
      }
      if (k === 's') {
        explicitSave()
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 监听只绑一次（闭包取首渲染值），explicitSave/doCopy/toggleBodyDialog/切换族守卫均走 refs 或稳定引用无需重绑
  }, [])
}
