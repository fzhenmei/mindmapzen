// src/hooks/useEditorHotkeys.ts —— 编辑器全局快捷键（验收轮拆自 EditorView，行数护栏）：
// Ctrl+Shift+C 复制 / Ctrl+S 保存 / Ctrl+P 快速切换浮层 / Ctrl+Tab 切上一张（v2.5）/
// 备注编辑 Shift+F2、Ctrl+.。监听只绑一次（闭包取首渲染值），各入口均走 refs
// （activeUidRef/anyDialogRef）或稳定引用，无需重绑（M5a 收敛裁定）。
import { useEffect, type RefObject } from 'react'

/** 备注编辑快捷键命中（spec §3）：Shift+F2 或 Ctrl/Cmd+.；裸 F2 留给引擎原生文字编辑 */
const isNoteHotkey = (e: KeyboardEvent): boolean =>
  (e.shiftKey && e.key === 'F2') || ((e.ctrlKey || e.metaKey) && e.key === '.')

interface Params {
  /** 复制 Markdown（Ctrl+Shift+C 的快捷键路径） */
  doCopy(): void
  /** 显式保存链（Ctrl+S 的快捷键路径） */
  explicitSave(): void
  /** 编辑选中节点备注（useNoteEdit.openNoteDialog） */
  openNoteDialog(): void
  /** 选中节点 uid ref（useActiveSelection） */
  activeUidRef: RefObject<string | null>
  /** 任一对话框在开（EditorView 渲染期同步）：备注/切换快捷键互斥守卫 */
  anyDialogRef: RefObject<boolean>
  /** 呼出快速切换浮层（Ctrl+P；v2.5） */
  openQuickSwitch(): void
  /** ping-pong 切上一张导图（Ctrl+Tab；v2.5） */
  pingPong(): void
}

export function useEditorHotkeys({ doCopy, explicitSave, openNoteDialog, activeUidRef, anyDialogRef, openQuickSwitch, pingPong }: Params): void {
  useEffect(() => {
    /** Ctrl/Cmd 命令族（v2.5 拆出：onKey 认知复杂度护栏）：按序匹配，命中返回 true 由 onKey 统一 preventDefault */
    const ctrlCommand = (e: KeyboardEvent): boolean => {
      const k = e.key.toLowerCase()
      if (e.shiftKey && k === 'c') {
        doCopy()
        return true
      }
      if (k === 's') {
        explicitSave()
        return true
      }
      // 切换族（v2.5）：浮层/对话框互斥期 no-op——浮层开着时 Tab 不抢其内部导航
      if (!anyDialogRef.current) {
        if (e.key === 'Tab') {
          pingPong()
          return true
        }
        if (k === 'p') {
          openQuickSwitch()
          return true
        }
      }
      return false
    }

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ctrlCommand(e)) {
        e.preventDefault()
        return
      }
      if (isNoteHotkey(e)) {
        e.preventDefault()
        // 守卫同 btn-note：无选中/对话框互斥期 no-op
        if (activeUidRef.current && !anyDialogRef.current) openNoteDialog()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 监听只绑一次（闭包取首渲染值），explicitSave/doCopy/切换族守卫均走 refs 无需重绑
  }, [])
}
