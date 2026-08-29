// src/components/EditorDialogs.tsx —— 对话框容器（M5b Task 1 拆自 EditorView，零行为变化）：
// 关闭守卫三态框与忽略块保存确认框的 JSX 原样迁入；后续 task 的对话框（备注/导出等）都进此容器。
// 互斥门闩留 EditorView：confirmingIgnored 传入前已 && !guarding（ZenDialog 互斥约定——每视图至多一个）。
// SaveStamp 不入容器——它是浮层非对话框。
import { useState } from 'react'
import type { IgnoredBlock } from '../types/tree'
import type { ExportActions } from '../hooks/useExportFlow'
import CloseGuardDialog from './CloseGuardDialog'
import ExportDialog from './ExportDialog'
import ZenDialog from './ZenDialog'

interface EditorDialogsProps {
  // 对话框的全部外部依赖，经 props 传入：
  guarding: boolean
  mapName: string
  onGuardChoice(c: 'save' | 'discard' | 'cancel'): void
  /** 已过互斥门闩（调用方保证 confirming && !guarding 语义） */
  confirmingIgnored: boolean
  ignored: IgnoredBlock[]
  onIgnoredConfirm(): void
  onIgnoredCancel(): void
  /** 节点备注对话框（M5b Task 2）：非 null 时打开；draft 为预填文本（保存值经 onNoteSave 回传） */
  noteDraft: string | null
  onNoteSave(value: string): void
  onNoteCancel(): void
  /** 导出对话框（M5b Task 5）：非 null 时打开（开态与互斥门闩由调用方组合传入） */
  exportActions: ExportActions | null
}

/** 备注对话框：textarea 本地受控（draft 仅为初值），保存回传编辑值 */
function NoteDialog({
  draft,
  onSave,
  onCancel,
}: Readonly<{ draft: string; onSave(value: string): void; onCancel(): void }>) {
  const [value, setValue] = useState(draft)
  return (
    <ZenDialog
      testid="note-dialog"
      title="编辑节点备注"
      onClose={onCancel}
      actions={
        <>
          <button type="button" data-testid="note-cancel" onClick={onCancel}>
            取消
          </button>
          <button type="button" data-testid="note-save" onClick={() => onSave(value)}>
            保存
          </button>
        </>
      }
    >
      <textarea
        data-testid="note-text"
        className="note-textarea"
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </ZenDialog>
  )
}

export default function EditorDialogs({
  guarding,
  mapName,
  onGuardChoice,
  confirmingIgnored,
  ignored,
  onIgnoredConfirm,
  onIgnoredCancel,
  noteDraft,
  onNoteSave,
  onNoteCancel,
  exportActions,
}: Readonly<EditorDialogsProps>) {
  return (
    <>
      {guarding && <CloseGuardDialog mapName={mapName} onChoice={onGuardChoice} />}
      {confirmingIgnored && (
        <ZenDialog
          title={`保存将丢弃 ${ignored.length} 个未映射的内容块`}
          onClose={onIgnoredCancel}
          actions={
            <>
              <button type="button" data-testid="ignored-confirm-cancel" onClick={onIgnoredCancel}>
                取消
              </button>
              <button type="button" data-testid="ignored-confirm-save" onClick={onIgnoredConfirm}>
                继续保存
              </button>
            </>
          }
        />
      )}
      {noteDraft !== null && (
        <NoteDialog draft={noteDraft} onSave={onNoteSave} onCancel={onNoteCancel} />
      )}
      {exportActions !== null && <ExportDialog actions={exportActions} />}
    </>
  )
}
