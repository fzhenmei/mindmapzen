// src/components/EditorDialogs.tsx —— 对话框容器（M5b Task 1 拆自 EditorView，零行为变化）：
// 关闭守卫三态框与忽略块保存确认框的 JSX 原样迁入；后续 task 的对话框（导出等）都进此容器。
// 互斥门闩留 EditorView：confirmingIgnored 传入前已 && !guarding（ui Dialog 互斥约定——每视图至多一个）。
// 2026-09（行数护栏）：图标/插图/快速切换三个浮动框亦迁入——槽 = 目标组件 props
// （ComponentProps 零复制），开态门闩同样由调用方组合为 null 关闭，模式与 exportActions 同构。
// SaveStamp 不入容器——它是浮层非对话框。M12b Task 5 切 ui/dialog + ui/button。
// 2026-09-06 备注合并：NoteDialog 与 note 槽退役（正文唯一入口为右侧正文面板）。
import type { ComponentProps } from 'react'
import type { IgnoredBlock } from '../types/tree'
import type { ExportActions } from '../hooks/useExportFlow'
import CloseGuardDialog from './CloseGuardDialog'
import ConflictDialog from './ConflictDialog'
import ExportDialog from './ExportDialog'
import IconPickerDialog from './IconPickerDialog'
import ImageDialog from './ImageDialog'
import NewMapDialog from './NewMapDialog'
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
  /** 导出对话框（M5b Task 5）：非 null 时打开（开态与互斥门闩由调用方组合传入） */
  exportActions: ExportActions | null
  /** 图标管理器（M18，2026-09 迁入）：槽 = 组件 props；null = 关（门闩在调用方） */
  iconPicker: ComponentProps<typeof IconPickerDialog> | null
  /** 插图（M19，2026-09 迁入）：同上 */
  imageEdit: ComponentProps<typeof ImageDialog> | null
  /** 快速切换浮层（v2.5，2026-09 迁入）：搜索/轮换两形态共用；同上 */
  quickSwitch: ComponentProps<typeof QuickSwitchDialog> | null
  /** 新建导图对话框（2026-09 画布内入口）：复用案头 NewMapDialog；同上 */
  newMap: ComponentProps<typeof NewMapDialog> | null
  /** 冲突裁决框（外部变更防护）：非 null 时打开（保存链挂起等待三态决策） */
  conflict: { mapName: string; onChoice(c: 'overwrite' | 'reload' | 'cancel'): void } | null
}

export default function EditorDialogs({
  guarding,
  mapName,
  onGuardChoice,
  confirmingIgnored,
  ignored,
  onIgnoredConfirm,
  onIgnoredCancel,
  exportActions,
  iconPicker,
  imageEdit,
  quickSwitch,
  newMap,
  conflict,
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
      {exportActions !== null && <ExportDialog actions={exportActions} />}
      {iconPicker !== null && <IconPickerDialog {...iconPicker} />}
      {imageEdit !== null && <ImageDialog {...imageEdit} />}
      {quickSwitch !== null && <QuickSwitchDialog {...quickSwitch} />}
      {newMap !== null && <NewMapDialog {...newMap} />}
      {conflict !== null && <ConflictDialog mapName={conflict.mapName} onChoice={conflict.onChoice} />}
    </>
  )
}
