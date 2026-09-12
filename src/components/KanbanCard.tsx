// src/components/KanbanCard.tsx —— 看板卡片（2026-09 看板模式 Task 6）
// 纯展示 + 本地编辑态：命令编排全部在 KanbanView（每操作 = 恰一条引擎命令 +
// onDataChanged）。交互：拖拽（dataTransfer 载荷 text/kanban-uid）、双击文本内联
// 编辑、DropdownMenu 收纳改状态/转普通/图标/标签/删除；单击主体 = 延迟定位回导图
// （与双击编辑共存：真实浏览器 click 先于 dblclick 派生，双击在判定窗内清除定时器）。
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KanbanCard as KanbanCardData } from '../services/kanban'
import { TASK_STATUSES, type TaskStatus } from '../services/statusMarkers'
import { CURATED_ICONS } from '../editor/zenIcons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { IconMore } from './icons'

/** 单击定位 vs 双击编辑判定窗（ms）：略大于浏览器 click→dblclick 派生间隔 */
const LOCATE_DELAY_MS = 220
/** 删除二次确认回退窗（ms）：3 秒不点恢复普通态（零新组件的确认交互） */
const DELETE_CONFIRM_MS = 3000

export interface KanbanCardProps {
  card: KanbanCardData
  onStatusChange(uid: string, status: TaskStatus | null): void
  onTextChange(uid: string, text: string): void
  onDelete(uid: string): void
  onOpenBody(uid: string): void
  /** 打开图标选择器（iconPick.openPicker 同款入参） */
  onEditIcons(card: { text: string; icons: string[] }): void
  /** 打开标签选择器（used 全集由 KanbanView 补齐后上行） */
  onEditTags(card: { text: string; tags: string[] }): void
  onLocate(uid: string): void
}

export default function KanbanCard({
  card, onStatusChange, onTextChange, onDelete, onOpenBody, onEditIcons, onEditTags, onLocate,
}: Readonly<KanbanCardProps>) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmingDel, setConfirmingDel] = useState(false)
  const locateTimerRef = useRef<number>(0)
  const delTimerRef = useRef<number>(0)

  // 卸载清定时器：定位回调触发时看板可能已关（切视图），确认回退窗不得越界 setState
  useEffect(
    () => () => {
      window.clearTimeout(locateTimerRef.current)
      window.clearTimeout(delTimerRef.current)
    },
    [],
  )

  const scheduleLocate = (): void => {
    window.clearTimeout(locateTimerRef.current)
    locateTimerRef.current = window.setTimeout(() => onLocate(card.uid), LOCATE_DELAY_MS)
  }
  const cancelLocate = (): void => window.clearTimeout(locateTimerRef.current)

  const beginEdit = (): void => {
    cancelLocate()
    setDraft(card.text)
    setEditing(true)
  }
  /** 提交内联编辑：空串/未变更不产生命令（恰一条引擎命令纪律的 no-op 分支） */
  const commitEdit = (): void => {
    setEditing(false)
    const text = draft.trim()
    if (text !== '' && text !== card.text) onTextChange(card.uid, text)
  }

  /** 删除二次确认：首点武装（3 秒回退），再点执行——零新组件 */
  const requestDelete = (): void => {
    if (confirmingDel) {
      window.clearTimeout(delTimerRef.current)
      setConfirmingDel(false)
      onDelete(card.uid)
    } else {
      setConfirmingDel(true)
      delTimerRef.current = window.setTimeout(() => setConfirmingDel(false), DELETE_CONFIRM_MS)
    }
  }

  return (
    <div
      data-testid={`kanban-card-${card.uid}`}
      draggable={!editing}
      onDragStart={(e) => e.dataTransfer.setData('text/kanban-uid', card.uid)}
      onClick={scheduleLocate}
      title={t('editor.kanban.locate')}
      className="cursor-grab rounded-md border bg-card p-2 text-sm shadow-sm active:cursor-grabbing"
    >
      {/* 父链（根下直挂 = 未分组）：卡片同名任务的归属线索 */}
      <p className="truncate text-[10px] leading-tight text-muted-foreground">
        {card.path.length > 0 ? card.path.join(' / ') : t('editor.kanban.ungrouped')}
      </p>
      <div className="mt-0.5 flex items-start gap-1">
        <div className="min-w-0 flex-1" onDoubleClick={editing ? undefined : beginEdit}>
          {editing ? (
            <input
              data-testid={`kanban-edit-${card.uid}`}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                else if (e.key === 'Escape') setEditing(false)
              }}
              onBlur={commitEdit}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="w-full rounded border bg-background px-1 py-0.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          ) : (
            <p className="truncate font-medium leading-snug">{card.text}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid={`kanban-menu-${card.uid}`}
              aria-label={t('editor.nodeMenu.label')}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <IconMore size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('editor.kanban.menu.toStatus')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={card.status}
              onValueChange={(v) => onStatusChange(card.uid, v as TaskStatus)}
            >
              {TASK_STATUSES.map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {t(`editor.kanban.status.${s}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid={`kanban-toplain-${card.uid}`}
              onSelect={() => onStatusChange(card.uid, null)}
            >
              {t('editor.kanban.menu.toPlain')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEditIcons({ text: card.text, icons: card.icons })}>
              {t('editor.nodeActions.icon')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEditTags({ text: card.text, tags: card.tags })}>
              {t('editor.nodeActions.tag')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* preventDefault 保持菜单开着——确认点击落在同一菜单项上 */}
            <DropdownMenuItem
              data-testid={`kanban-delete-${card.uid}`}
              onSelect={(e) => {
                e.preventDefault()
                requestDelete()
              }}
              className={confirmingDel ? 'text-destructive focus:text-destructive' : undefined}
            >
              {confirmingDel ? t('editor.kanban.menu.deleteConfirm') : t('editor.kanban.menu.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {(card.icons.length > 0 || card.tags.length > 0 || card.hasBody) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {card.icons.map((name) => {
            const svg = CURATED_ICONS[name]
            return svg !== undefined ? (
              // svg 源自构建期内化的 lucide-static 精选集（非运行时输入，无 XSS 面），
              // 渲染口径同 IconPickerDialog 已选行
              <span
                key={name}
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: svg }}
                className="text-muted-foreground [&_svg]:size-3"
              />
            ) : (
              <span key={name} className="text-[10px] leading-none text-muted-foreground">
                {name}
              </span>
            )
          })}
          {card.tags.map((tg) => (
            <span key={tg} className="rounded bg-secondary px-1 text-[10px] leading-4 text-secondary-foreground">
              {tg}
            </span>
          ))}
          {card.hasBody && (
            <button
              type="button"
              data-testid={`kanban-body-${card.uid}`}
              title={t('editor.kanban.bodyHint')}
              aria-label={t('editor.kanban.bodyHint')}
              onClick={(e) => {
                e.stopPropagation()
                onOpenBody(card.uid)
              }}
              className="rounded bg-secondary px-1 text-[10px] leading-4 text-secondary-foreground hover:bg-accent"
            >
              {t('editor.kanban.bodyHint')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
