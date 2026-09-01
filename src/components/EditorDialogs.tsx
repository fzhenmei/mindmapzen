// src/components/EditorDialogs.tsx —— 对话框容器（M5b Task 1 拆自 EditorView，零行为变化）：
// 关闭守卫三态框与忽略块保存确认框的 JSX 原样迁入；后续 task 的对话框（备注/导出等）都进此容器。
// 互斥门闩留 EditorView：confirmingIgnored 传入前已 && !guarding（ui Dialog 互斥约定——每视图至多一个）。
// 2026-09（行数护栏）：图标/插图/快速切换三个浮动框亦迁入——槽 = 目标组件 props
// （ComponentProps 零复制），开态门闩同样由调用方组合为 null 关闭，模式与 exportActions 同构。
// SaveStamp 不入容器——它是浮层非对话框。M12b Task 5 切 ui/dialog + ui/button。
import { useState, type ComponentProps } from 'react'
import type { IgnoredBlock } from '../types/tree'
import type { ExportActions } from '../hooks/useExportFlow'
import CloseGuardDialog from './CloseGuardDialog'
import ExportDialog from './ExportDialog'
import IconPickerDialog from './IconPickerDialog'
import ImageDialog from './ImageDialog'
import QuickSwitchDialog from './QuickSwitchDialog'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

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
  /** 图标管理器（M18，2026-09 迁入）：槽 = 组件 props；null = 关（门闩在调用方） */
  iconPicker: ComponentProps<typeof IconPickerDialog> | null
  /** 插图（M19，2026-09 迁入）：同上 */
  imageEdit: ComponentProps<typeof ImageDialog> | null
  /** 快速切换浮层（v2.5，2026-09 迁入）：搜索/轮换两形态共用；同上 */
  quickSwitch: ComponentProps<typeof QuickSwitchDialog> | null
}

/** 备注对话框：textarea 本地受控（draft 仅为初值），保存回传编辑值（等宽文件声道） */
function NoteDialog({
  draft,
  onSave,
  onCancel,
}: Readonly<{ draft: string; onSave(value: string): void; onCancel(): void }>) {
  const [value, setValue] = useState(draft)
  const title = '编辑节点备注'
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      {/* M17b 验收：备注常承载大段文字与 mermaid 图源——对话框放大（宽 max-w-3xl，
          编辑区过半屏高，仍可 resize-y 微调），多利用屏幕空间 */}
      <DialogContent data-testid="note-dialog" aria-label={title} className="sm:max-w-3xl">
        <DialogTitle>{title}</DialogTitle>
        <textarea
          data-testid="note-text"
          rows={4}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          // Ctrl+Enter 即保存（2026-09）：备注常为大段文字，免鼠标/Tab 移到保存钮；
          // 裸 Enter 不拦截（多行换行照常），Cmd+Enter 同译（mac 习惯）
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              onSave(value)
            }
          }}
          className="min-h-[50vh] w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 font-mono text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="note-cancel" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" data-testid="note-save" onClick={() => onSave(value)}>
            保存（Ctrl+Enter）
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  iconPicker,
  imageEdit,
  quickSwitch,
}: Readonly<EditorDialogsProps>) {
  const ignoredTitle = `保存将丢弃 ${ignored.length} 个未映射的内容块`
  return (
    <>
      {guarding && <CloseGuardDialog mapName={mapName} onChoice={onGuardChoice} />}
      {confirmingIgnored && (
        <Dialog open onOpenChange={(o) => { if (!o) onIgnoredCancel() }}>
          <DialogContent aria-label={ignoredTitle}>
            <DialogTitle>{ignoredTitle}</DialogTitle>
            <DialogFooter>
              <Button variant="secondary" size="sm" data-testid="ignored-confirm-cancel" onClick={onIgnoredCancel}>
                取消
              </Button>
              <Button size="sm" data-testid="ignored-confirm-save" onClick={onIgnoredConfirm}>
                继续保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {noteDraft !== null && (
        <NoteDialog draft={noteDraft} onSave={onNoteSave} onCancel={onNoteCancel} />
      )}
      {exportActions !== null && <ExportDialog actions={exportActions} />}
      {iconPicker !== null && <IconPickerDialog {...iconPicker} />}
      {imageEdit !== null && <ImageDialog {...imageEdit} />}
      {quickSwitch !== null && <QuickSwitchDialog {...quickSwitch} />}
    </>
  )
}
