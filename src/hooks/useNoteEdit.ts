// src/hooks/useNoteEdit.ts —— 节点备注编辑（M5b Task 2）：对话框开闭状态与保存命令，
// 自 EditorView 拆出（EditorView 行数护栏 ≤300）。选中定位复用 useActiveSelection 的 uid ref，
// 节点实例经 findNodeByUid 取得后随对话框存续（保存时作为 SET_NODE_DATA 参数）。
import { useRef, useState, type MutableRefObject } from 'react'
import type { MindMapHandle } from '../types/engine'

export interface NoteEdit {
  /** 备注编辑框预填文本；null = 对话框关闭 */
  noteDraft: string | null
  /** 砚栏 btn-note 点击：定位选中节点实例，预填其现有 data.note（无选中/未命中静默放弃） */
  openNoteDialog(): void
  /** 对话框保存：SET_NODE_DATA 写 data.note（空串置 undefined——引擎以 truthy 判定角标，即清除） */
  saveNote(value: string): void
  /** 对话框取消/Esc：仅关闭 */
  cancelNote(): void
}

export function useNoteEdit(
  mmRef: MutableRefObject<MindMapHandle | null>,
  activeUidRef: MutableRefObject<string | null>,
): NoteEdit {
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  // 对话框打开期间持节点实例：保存命令的第二参（引擎命令按实例寻址，见引擎核验 M3 (4)）
  const noteNodeRef = useRef<unknown>(null)

  const openNoteDialog = (): void => {
    const uid = activeUidRef.current
    const node = uid ? mmRef.current?.renderer?.findNodeByUid(uid) : null
    if (!node) return
    noteNodeRef.current = node
    const cur = (node as { getData?(key: string): unknown }).getData?.('note')
    setNoteDraft(typeof cur === 'string' ? cur : '')
  }

  const saveNote = (value: string): void => {
    const mm = mmRef.current
    const node = noteNodeRef.current
    if (!mm || !node) return
    mm.execCommand('SET_NODE_DATA', node, { note: value || undefined })
    // 裸 SET_NODE_DATA 不重渲染（引擎核验 M5b (13)）：补一次按需重渲，角标即时增删
    mm.renderer?.reRenderNodeCheckChange(node)
    setNoteDraft(null)
  }

  const cancelNote = (): void => setNoteDraft(null)

  return { noteDraft, openNoteDialog, saveNote, cancelNote }
}
