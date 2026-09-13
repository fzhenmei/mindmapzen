// src/components/StatusPickerDialog.tsx —— 节点状态选择器（2026-09 看板模式 Task 8）
// 导图侧状态入口（NodeActions 状态钮 → EditorView.statusPick）：六态单选 +
// 「转为普通节点」清除项（current 非 null 才显示）。确认走 EditorView.applyStatus
// （渲染节点 setIcon 重合成徽章 = SET_NODE_ICON 单命令可撤销，KanbanView.changeStatus
// 同款链路）；六态色点/文案与看板同源（STATUS_DOT / editor.kanban.status.*），
// 清除项复用 kanban.menu.toPlain——跨视图一套状态语言。
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { TASK_STATUSES, type TaskStatus } from '../services/statusMarkers'
import { STATUS_DOT } from './KanbanColumn'

interface Props {
  /** 当前节点文本（标题展示） */
  nodeText: string
  /** 现状态（null = 普通节点：无清除项、单选无高亮） */
  current: TaskStatus | null
  onCancel(): void
  /** 确认：所选状态（null = 转为普通节点，清除徽章） */
  onConfirm(status: TaskStatus | null): void
}

/** 选中态环/底色与 TagPickerDialog 已用项同口径（视觉语言一致） */
const PICKED_CLS = 'bg-secondary ring-2 ring-primary/60'
const UNPICKED_CLS = 'bg-muted/50'

export default function StatusPickerDialog({ nodeText, current, onCancel, onConfirm }: Readonly<Props>) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<TaskStatus | null>(current)

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent data-testid="status-dialog" aria-label={t('editor.statusPicker.title')} className="sm:max-w-md">
        <DialogTitle>{t('editor.statusPicker.title')}</DialogTitle>
        <p className="truncate text-xs text-muted-foreground" title={nodeText}>
          {nodeText}
        </p>
        {/* 六态单选（点选即选、确认才落；当前态高亮环）；dropped 删除线即「放弃」语义 */}
        <div data-testid="status-options" className="flex flex-col gap-1">
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`status-option-${s}`}
              onClick={() => setPicked(s)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent ${
                picked === s ? PICKED_CLS : UNPICKED_CLS
              }`}
            >
              <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[s]}`} aria-hidden="true" />
              <span className={s === 'dropped' ? 'text-muted-foreground line-through' : ''}>
                {t(`editor.kanban.status.${s}`)}
              </span>
            </button>
          ))}
          {/* 清除项（current 非 null 才显示）：选中后确认携带 null（转普通节点） */}
          {current !== null && (
            <button
              type="button"
              data-testid="status-toplain"
              onClick={() => setPicked(null)}
              className={`rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent ${
                picked === null ? PICKED_CLS : UNPICKED_CLS
              }`}
            >
              {t('editor.kanban.menu.toPlain')}
            </button>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" data-testid="status-cancel" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" data-testid="status-save" onClick={() => onConfirm(picked)}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
