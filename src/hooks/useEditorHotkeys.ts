// src/hooks/useEditorHotkeys.ts —— 编辑器全局快捷键（验收轮拆自 EditorView，行数护栏）：
// Ctrl+Shift+C 复制 / 备注编辑 Shift+F2、Ctrl+. / Ctrl+S 保存。监听只绑一次（闭包取首渲染值），
// 各入口均走 refs（mmRef/activeUidRef/dirtyRef）或稳定引用，无需重绑（M5a 收敛裁定）。
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
  /** 任一对话框在开（EditorView 渲染期同步）：备注快捷键互斥守卫 */
  anyDialogRef: RefObject<boolean>
}

export function useEditorHotkeys({ doCopy, explicitSave, openNoteDialog, activeUidRef, anyDialogRef }: Params): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void doCopy()
        return
      }
      if (isNoteHotkey(e)) {
        e.preventDefault()
        if (activeUidRef.current && !anyDialogRef.current) openNoteDialog() // 守卫同 btn-note：无选中/对话框互斥期 no-op
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void explicitSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 监听只绑一次（闭包取首渲染值），explicitSave/doCopy/备注快捷键守卫均走 refs 无需重绑
  }, [])
}
