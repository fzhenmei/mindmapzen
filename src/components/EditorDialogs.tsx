// src/components/EditorDialogs.tsx —— 对话框容器（M5b Task 1 拆自 EditorView，零行为变化）：
// 关闭守卫三态框与忽略块保存确认框的 JSX 原样迁入；后续 task 的对话框（备注/导出等）都进此容器。
// 互斥门闩留 EditorView：confirmingIgnored 传入前已 && !guarding（ZenDialog 互斥约定——每视图至多一个）。
// SaveStamp 不入容器——它是浮层非对话框。
import type { IgnoredBlock } from '../types/tree'
import CloseGuardDialog from './CloseGuardDialog'
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
}

export default function EditorDialogs({
  guarding,
  mapName,
  onGuardChoice,
  confirmingIgnored,
  ignored,
  onIgnoredConfirm,
  onIgnoredCancel,
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
    </>
  )
}
