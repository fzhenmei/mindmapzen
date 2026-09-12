// src/components/KanbanColumn.tsx —— 看板列（2026-09 看板模式 Task 6）
// 单一状态列：列头（色点 + 状态名 + 计数）／列体（卡片 + 空态）／列底（新增内联输入）。
// 拖拽落点：onDragOver preventDefault 放行 drop，onDrop 取卡片 uid 上行改状态。
// dropped 列语义 = 放弃：列名删除线 + 淡灰点。
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { KanbanCard as KanbanCardData } from '../services/kanban'
import type { TaskStatus } from '../services/statusMarkers'
import KanbanCard, { type KanbanCardProps } from './KanbanCard'

/** 五态色点（dropped 淡灰 + 列名删除线共同表达「放弃」语义）；导出供
 *  StatusPickerDialog 复用（2026-09 看板模式 Task 8：导图侧状态选择器与列头视觉同源） */
export const STATUS_DOT: Record<TaskStatus, string> = {
  todo: 'bg-muted-foreground/70',
  doing: 'bg-blue-500',
  blocked: 'bg-amber-500',
  done: 'bg-green-600',
  dropped: 'bg-muted-foreground/40',
}

interface Props extends Omit<KanbanCardProps, 'card'> {
  status: TaskStatus
  cards: KanbanCardData[]
  /** 列底新增（回车提交；落列状态由本列 status 定义，挂根在 KanbanView） */
  onAdd(text: string): void
}

export default function KanbanColumn({ status, cards, onAdd, ...cardCallbacks }: Readonly<Props>) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

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
      data-testid={`kanban-col-${status}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const uid = e.dataTransfer.getData('text/kanban-uid')
        if (uid !== '') cardCallbacks.onStatusChange(uid, status)
      }}
      className="flex max-h-full w-64 shrink-0 flex-col gap-2 self-start rounded-lg bg-muted/40 p-2"
    >
      <header className="flex items-center gap-1.5 px-1">
        <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
        <h3
          className={`text-xs font-medium ${
            status === 'dropped' ? 'text-muted-foreground line-through' : ''
          }`}
        >
          {t(`editor.kanban.status.${status}`)}
        </h3>
        <span className="ml-auto rounded-full bg-secondary px-1.5 text-[10px] leading-4 text-secondary-foreground">
          {cards.length}
        </span>
      </header>
      {/* 卡片区原生列表语义（Sonar S6819：卡片 li 须挂 ul 下） */}
      <ul className="flex list-none flex-col gap-2 overflow-y-auto">
        {cards.map((c) => (
          <KanbanCard key={c.uid} card={c} {...cardCallbacks} />
        ))}
        {cards.length === 0 && !adding && (
          <li
            data-testid={`kanban-empty-${status}`}
            className="list-none rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground"
          >
            {t('editor.kanban.emptyColumn')}
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
              if (e.key === 'Enter') commitAdd()
              else if (e.key === 'Escape') cancelAdd()
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
