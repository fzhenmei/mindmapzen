// src/components/KanbanCard.tsx —— 看板卡片（2026-09 看板模式 Task 6）
// 纯展示 + 本地编辑态：命令编排全部在 KanbanView（每操作 = 恰一条引擎命令 +
// onDataChanged）。交互：拖拽（dataTransfer 载荷 text/kanban-uid）、双击文本内联
// 编辑、DropdownMenu 收纳改状态/转普通/图标/标签/删除；单击主体 = 延迟定位回导图
// （与双击编辑共存：真实浏览器 click 先于 dblclick 派生，双击在判定窗内清除定时器）。
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
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

/** 单击定位 vs 双击编辑判定窗（ms）：须 ≥ OS 双击阈值（Windows 默认 500ms）——
 *  落在窗内的第二击会取消定时器走 dblclick 编辑；窗过短则「慢双击」第二击
 *  未到定时器已先触发定位，视图被切走 */
const LOCATE_DELAY_MS = 500
/** 删除二次确认回退窗（ms）：3 秒不点恢复普通态（零新组件的确认交互） */
const DELETE_CONFIRM_MS = 3000

/** 是否有徽标行（图标/标签/正文任一）——拆出守卫：Sonar S3776 认知复杂度 */
const hasBadges = (card: KanbanCardData): boolean =>
  card.icons.length > 0 || card.tags.length > 0 || card.hasBody

/** 键盘定位判定（li 自身 Enter/Space）：target 守卫——冒泡自内部按钮/输入框的
 *  键盘事件不触发卡片定位，否则键盘激活卡片内按钮（菜单/正文钮）时 preventDefault
 *  会抑制按钮原生激活。拆出判定同因 S3776 */
const isCardSelfActivateKey = (e: KeyboardEvent<HTMLLIElement>): boolean =>
  e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')

/** 单个图标徽标：lucide-static 构建期内化的精选 svg 直渲（非运行时输入，无 XSS 面），
 *  渲染口径同 IconPickerDialog 已选行——拆出同因 S3776 */
function CardIconBadge({ name }: Readonly<{ name: string }>) {
  const svg = CURATED_ICONS[name]
  return svg !== undefined ? (
    <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} className="text-muted-foreground [&_svg]:size-3" />
  ) : (
    <span className="text-[10px] leading-none text-muted-foreground">{name}</span>
  )
}

export interface KanbanCardProps {
  card: KanbanCardData
  onStatusChange(uid: string, status: TaskStatus | null): void
  onTextChange(uid: string, text: string): void
  onDelete(uid: string): void
  onOpenBody(uid: string): void
  /** 打开图标/标签选择器（iconPick/tagPick.openPicker 同款入参 + 显式卡片 uid——
   *  看板卡片不是画布选中节点，宿主桥接 picker 必须经 uid 显式寻址） */
  onEditIcons(card: { uid: string; text: string; icons: string[] }): void
  /** 打开标签选择器（used 全集由 KanbanView 补齐后上行） */
  onEditTags(card: { uid: string; text: string; tags: string[] }): void
  onLocate(uid: string): void
}

export default function KanbanCard({
  card, onStatusChange, onTextChange, onDelete, onOpenBody, onEditIcons, onEditTags, onLocate,
}: Readonly<KanbanCardProps>) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmingDel, setConfirmingDel] = useState(false)
  // 拖拽中源卡片半透明（2026-09 冒烟微调）：增强「拿起」感，dragend/落列重挂载自清
  const [dragging, setDragging] = useState(false)
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

  /** 立即定位（键盘 Enter/Space 路径——无「双击编辑」歧义，不经判定窗）。
   *  setTimeout/键盘回调的异常运行时静默吞（无框架兜底），自兜留痕 */
  const locateNow = (): void => {
    window.clearTimeout(locateTimerRef.current)
    try {
      onLocate(card.uid)
    } catch (e) {
      console.error('看板定位回调失败', e)
    }
  }
  const scheduleLocate = (): void => {
    window.clearTimeout(locateTimerRef.current)
    locateTimerRef.current = window.setTimeout(locateNow, LOCATE_DELAY_MS)
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

  /** 删除二次确认：首点武装（3 秒回退，回退窗回调纯 setState——React 18 对已卸载组件
   *  为无害 no-op，无异常可吞），再点执行——零新组件 */
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
    <li
      data-testid={`kanban-card-${card.uid}`}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/kanban-uid', card.uid)
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      onClick={editing ? undefined : scheduleLocate}
      onKeyDown={
        editing
          ? undefined
          : (e) => {
              // 键盘激活等价单击定位（Sonar S1082：click 必须有键盘可达路径）
              if (!isCardSelfActivateKey(e)) return
              e.preventDefault()
              locateNow()
            }
      }
      title={t('editor.kanban.locate')}
      tabIndex={editing ? -1 : 0}
      className={`list-none cursor-grab rounded-md border bg-card p-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing ${
        dragging ? 'opacity-50' : ''
      }`}
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
                // stopPropagation：Esc 不冒泡到看板根触发关板——编辑取消只退编辑态（Esc 分层）
                e.stopPropagation()
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
            <DropdownMenuItem onSelect={() => onEditIcons({ uid: card.uid, text: card.text, icons: card.icons })}>
              {t('editor.nodeActions.icon')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEditTags({ uid: card.uid, text: card.text, tags: card.tags })}>
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
      {hasBadges(card) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {card.icons.map((name) => (
            <CardIconBadge key={name} name={name} />
          ))}
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
    </li>
  )
}
