// src/components/KanbanColumn.tsx —— 看板列（2026-09 看板模式 Task 6）
// 单一状态列：列头（色点 + 状态名 + 计数）／列体（卡片 + 空态）／列底（新增内联输入）。
// 拖拽落点：onDragOver preventDefault 放行 drop，onDrop 取卡片 uid 上行改状态。
// 悬停反馈：enter/leave 计数器维持 data-dragover 高亮（ring + accent 底），归零熄灭。
// 状态集仅四列 + 归档列（BOARD_STATUSES + archived 展开态；dropped 不进看板，GTD Trash）。
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { KanbanCard as KanbanCardData } from '../services/kanban'
import type { TaskStatus } from '../services/statusMarkers'
import KanbanCard, { type KanbanCardProps } from './KanbanCard'
import { IconArchive, IconChevronRight } from './icons'

/** 六态色点；导出供 StatusPickerDialog 复用（2026-09 看板模式 Task 8：导图侧状态
 *  选择器与列头视觉同源）。dropped 条目仅选择器消费——它已不是看板列（GTD 审视） */
export const STATUS_DOT: Record<TaskStatus, string> = {
  todo: 'bg-muted-foreground/70',
  doing: 'bg-blue-500',
  blocked: 'bg-amber-500',
  done: 'bg-green-600',
  dropped: 'bg-muted-foreground/40',
  archived: 'bg-muted-foreground/30',
}

interface Props extends Omit<KanbanCardProps, 'card' | 'highlight'> {
  status: TaskStatus
  cards: KanbanCardData[]
  /** 列底新增（回车提交；落列状态由本列 status 定义，挂根在 KanbanView） */
  onAdd(text: string): void
  /** 过滤激活态（2026-09 看板治理）：空列占位文案切换——过滤后空 = 「无匹配」 */
  filterActive?: boolean
  /** 案头跳入高亮卡（2026-09）：KanbanView 定位消费命中的卡片 uid——列内换算逐卡
   *  highlight 布尔（不进 cardCallbacks 透传：那是全卡同值的回调面）；null = 无高亮 */
  highlightUid?: string | null
  /** 归档列收起（2026-09 看板治理）：仅归档列传入——列头收起钮回落看板收起条 */
  onCollapse?(): void
  /** done 列批量归档（2026-09 看板治理 spec §2.3）：仅 done 列传入 */
  onArchiveAll?(): void
}

export default function KanbanColumn({ status, cards, onAdd, filterActive = false, highlightUid, onCollapse, onArchiveAll, ...cardCallbacks }: Readonly<Props>) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  // 拖拽悬停高亮（2026-09 冒烟微调）：dragenter/dragleave 在列内子元素（卡片）间
  // 移动时成对触发，直接开关会误灭——enter/leave 计数器抵消子元素穿越，归零才算
  // 真正离开。dragover 兜底补记：拖拽起点就在本列时不发 dragenter（指针无边界
  // 穿越），首个 dragover 到达即视作在列内。drop / window dragend（ESC 取消拖拽
  // 不保证补发 dragleave，且源卡片在别列时 dragend 不冒泡到本列）统一清零。
  const [dragOver, setDragOver] = useState(false)
  const dragDepthRef = useRef(0)
  const markDragOver = useCallback((): void => {
    dragDepthRef.current += 1
    setDragOver(true)
  }, [])
  const markDragLeave = useCallback((): void => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }, [])
  const clearDragOver = useCallback((): void => {
    dragDepthRef.current = 0
    setDragOver(false)
  }, [])
  // 高亮期间挂 window dragend：取消拖拽的收尾清零（监听窗口期 = 恰好高亮期，无泄漏）
  useEffect(() => {
    if (!dragOver) return
    window.addEventListener('dragend', clearDragOver)
    return () => window.removeEventListener('dragend', clearDragOver)
  }, [dragOver, clearDragOver])

  // Esc 取消新增回焦看板根（Esc 分层续链）：input 卸载焦点断链回落 body——body keydown
  // 不进 React 树，二次 Esc 失效。flushSync 先同步提交（input 此刻已卸载）再回焦：同步
  // focus 会触发 input onBlur commitAdd，把「Esc 丢弃草稿」变成提交新卡片。回焦看板根
  // （closest 向上找 testid，组件内可达不引全局查询），再次 Esc 直接关板返回导图
  const colRef = useRef<HTMLElement>(null)

  const cancelAdd = (): void => {
    setAdding(false)
    setDraft('')
  }
  /** 提交新增：空串收起不产生命令（恰一条引擎命令纪律的 no-op 分支） */
  const commitAdd = (): void => {
    const text = draft.trim()
    setAdding(false)
    setDraft('')
    if (text !== '') onAdd(text)
  }

  return (
    <section
      ref={colRef}
      data-testid={`kanban-col-${status}`}
      data-dragover={dragOver ? '' : undefined}
      onDragEnter={markDragOver}
      onDragLeave={markDragLeave}
      onDragOver={(e) => {
        e.preventDefault()
        // 起点在列内（无 dragenter）时首个 dragover 补记，源列悬停同样有反馈
        if (dragDepthRef.current === 0) markDragOver()
      }}
      onDrop={(e) => {
        e.preventDefault()
        clearDragOver()
        const uid = e.dataTransfer.getData('text/kanban-uid')
        if (uid !== '') cardCallbacks.onStatusChange(uid, status)
      }}
      className={`flex max-h-full w-64 shrink-0 flex-col gap-2 self-start rounded-lg p-2 ${
        dragOver ? 'bg-accent ring-2 ring-primary/60' : 'bg-muted/40'
      }`}
    >
      <header className="flex items-center gap-1.5 px-1">
        <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
        <h3 className="text-xs font-medium">{t(`editor.kanban.status.${status}`)}</h3>
        {onArchiveAll !== undefined && (
          <button
            type="button"
            data-testid="btn-kanban-archive-all"
            title={t('editor.kanban.archiveAll')}
            aria-label={t('editor.kanban.archiveAll')}
            onClick={onArchiveAll}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconArchive size={12} />
          </button>
        )}
        {onCollapse !== undefined && (
          <button
            type="button"
            data-testid="btn-kanban-archive-collapse"
            title={t('editor.kanban.collapseArchive')}
            aria-label={t('editor.kanban.collapseArchive')}
            onClick={onCollapse}
            className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconChevronRight size={12} />
          </button>
        )}
        <span className="ml-auto rounded-full bg-secondary px-1.5 text-[10px] leading-4 text-secondary-foreground">
          {cards.length}
        </span>
      </header>
      {/* 卡片区原生列表语义（Sonar S6819：卡片 li 须挂 ul 下） */}
      <ul className="flex list-none flex-col gap-2 overflow-y-auto">
        {cards.map((c) => (
          <KanbanCard key={c.uid} card={c} highlight={highlightUid === c.uid} {...cardCallbacks} />
        ))}
        {cards.length === 0 && !adding && (
          <li
            data-testid={`kanban-empty-${status}`}
            className="list-none rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground"
          >
            {t(filterActive ? 'editor.kanban.filterEmpty' : 'editor.kanban.emptyColumn')}
          </li>
        )}
      </ul>
      <footer>
        {adding ? (
          <input
            data-testid={`kanban-add-input-${status}`}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // stopPropagation：Esc 不冒泡到看板根触发关板——取消新增只收起输入框（Esc
              // 分层）；取消后回焦看板根保住二次 Esc（见 colRef 注释）
              e.stopPropagation()
              if (e.key === 'Enter') commitAdd()
              else if (e.key === 'Escape') {
                // 先同步提交收起输入框再回焦（input 已卸载，onBlur commitAdd 不会误建卡片）
                flushSync(cancelAdd)
                colRef.current?.closest<HTMLElement>('[data-testid="kanban-view"]')?.focus()
              }
            }}
            onBlur={commitAdd}
            placeholder={t('editor.kanban.addPlaceholder')}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        ) : (
          <button
            type="button"
            data-testid={`btn-kanban-add-${status}`}
            onClick={() => setAdding(true)}
            className="w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
          >
            + {t('editor.kanban.addPlaceholder')}
          </button>
        )}
      </footer>
    </section>
  )
}
