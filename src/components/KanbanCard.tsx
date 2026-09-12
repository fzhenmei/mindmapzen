// src/components/KanbanCard.tsx —— 看板卡片（2026-09 看板模式 Task 6）
// 纯展示 + 本地编辑态：命令编排全部在 KanbanView（每操作 = 恰一条引擎命令 +
// onDataChanged）。交互：拖拽（dataTransfer 载荷 text/kanban-uid）、双击文本内联
// 编辑、DropdownMenu 收纳改状态/回导图定位/转普通/图标/标签/复制/删除。
// 2026-09 验收变更：定位自「单击卡片（500ms 判定窗）」移入菜单——portal 内菜单项
// click 沿 React 树跨边界冒泡回 li（KanbanView 头注释同款机制）会误触定位把用户
// 拽回导图；判定窗与单击/双击竞态（慢双击误切）一并消除。
// 键盘 Esc 分层：普通态沿 li 冒泡到看板根关板；编辑中只退编辑态并回焦卡片 li 保住二次
// Esc 续链（2026-09 验收微调，见 handleEditInputKey / cancelEditAndRefocus）。
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { IconMore } from './icons'

/** 删除二次确认回退窗（ms）：3 秒不点恢复普通态（零新组件的确认交互） */
const DELETE_CONFIRM_MS = 3000

/** 是否有徽标行（子孙/图标/标签/正文任一）——拆出守卫：Sonar S3776 认知复杂度 */
const hasBadges = (card: KanbanCardData): boolean =>
  card.icons.length > 0 || card.tags.length > 0 || card.hasBody || card.childCount > 0

/** 卡片父链小字文本：有父链则 ' / ' 连接；根下直挂 = 未分组。
 *  拆出同因 S3776：组件聚合复杂度已满 */
const cardPathText = (card: KanbanCardData, t: TFunction): string =>
  card.path.length > 0 ? card.path.join(' / ') : t('editor.kanban.ungrouped')

/** 编辑框键盘处理（S3776 拆出：组件聚合复杂度已满，分支按函数单独计量）。
 *  stopPropagation：Esc 不冒泡到看板根触发关板——编辑取消只退编辑态（Esc 分层）。
 *  Enter preventDefault：textarea 里 Enter 默认插入换行，而引擎节点文本是单行
 *  模型（\r\n 入节点会让 serialize 断言抛错），换行键只用于提交 */
function handleEditInputKey(
  e: KeyboardEvent<HTMLTextAreaElement>,
  commit: () => void,
  cancel: () => void,
): void {
  e.stopPropagation()
  if (e.key === 'Enter') {
    e.preventDefault()
    commit()
  } else if (e.key === 'Escape') cancel()
}

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
  /** 复制卡片（2026-09 子树卡片）：子树 md 管线在宿主 EditorView（doCopy 同源） */
  onCopyCard(uid: string): void
}

export default function KanbanCard({
  card, onStatusChange, onTextChange, onDelete, onOpenBody, onEditIcons, onEditTags, onLocate, onCopyCard,
}: Readonly<KanbanCardProps>) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmingDel, setConfirmingDel] = useState(false)
  // 拖拽中源卡片半透明（2026-09 冒烟微调）：增强「拿起」感，dragend/落列重挂载自清
  const [dragging, setDragging] = useState(false)
  // 子孙浮层开关（2026-09 子树卡片）：受控——Tooltip 的 open 由 hover 态与
  // 「有子孙且非编辑/拖拽」守卫合成，编辑中悬停同卡不弹、退编辑鼠标仍在卡上自然复弹
  const [tipOpen, setTipOpen] = useState(false)
  const delTimerRef = useRef<number>(0)

  // 卸载清定时器：确认回退窗触发时看板可能已关（切视图），不得越界 setState
  useEffect(
    () => () => {
      window.clearTimeout(delTimerRef.current)
    },
    [],
  )

  // Esc 退编辑回焦卡片 li（Esc 分层续链）：编辑框卸载焦点断链回落 body——body keydown
  // 不进 React 树，二次 Esc 失效。flushSync 先同步提交（编辑框此刻已卸载）再回焦：
  // 同步 focus 会触发编辑框 onBlur commitEdit，把「Esc 丢弃草稿」语义变成提交
  const cardRef = useRef<HTMLLIElement>(null)

  const beginEdit = (): void => {
    setDraft(card.text)
    setEditing(true)
  }
  /** 提交内联编辑：空串/未变更不产生命令（恰一条引擎命令纪律的 no-op 分支） */
  const commitEdit = (): void => {
    setEditing(false)
    const text = draft.trim()
    if (text !== '' && text !== card.text) onTextChange(card.uid, text)
  }
  /** Esc 退编辑并回焦卡片 li（Esc 分层续链）：flushSync 先同步提交（编辑框此刻已卸载，
   *  onBlur 不会误提交草稿）再回焦——编辑框卸载焦点断链回落 body（body keydown 不进
   *  React 树）会断二次 Esc */
  const cancelEditAndRefocus = (): void => {
    flushSync(() => setEditing(false))
    cardRef.current?.focus()
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
    <Tooltip open={tipOpen && card.childCount > 0 && !editing && !dragging} onOpenChange={setTipOpen}>
      {/* TooltipTrigger asChild：Radix 把 pointer/focus 进出与 aria-describedby 合到 li
          （Slot 拼接语义；键盘焦点落卡同样弹浮层——hover 语义的键盘可达路径）。
          Provider 由 EditorView 根提供（KanbanView 挂其内，shadcn 默认 delayDuration=0） */}
      <TooltipTrigger asChild>
        <li
          ref={cardRef}
          data-testid={`kanban-card-${card.uid}`}
          draggable={!editing}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/kanban-uid', card.uid)
            setDragging(true)
          }}
          onDragEnd={() => setDragging(false)}
          // 拦 Radix Trigger 的 focus 开浮层：preventDefault 短路其 context.onOpen
          // （composeEventHandlers 尊重 defaultPrevented——focus 事件不可取消，标志位无
          // 副作用）。不拦则退编辑回焦会闪弹浮层、浮层开着时 Esc 被 TooltipContent 的
          // DismissableLayer 在 capture 阶段吃掉（退编辑→Esc 关板的两击链变三击）。子孙
          // 速览只认鼠标 hover（需求原文），键盘侧信息经徽标计数 + 复制卡片可达
          onFocus={(e) => e.preventDefault()}
          title={t('editor.kanban.cardHint')}
          tabIndex={editing ? -1 : 0}
          className={`list-none cursor-grab rounded-md border bg-card p-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing ${
            dragging ? 'opacity-50' : ''
          }`}
        >
          {/* 父链小字同正文放开截断（信息完整优先，长路径换行也接受） */}
          <p className="break-words text-[10px] leading-tight text-muted-foreground">
            {cardPathText(card, t)}
          </p>
          <div className="mt-0.5 flex items-start gap-1">
            <div className="min-w-0 flex-1" onDoubleClick={editing ? undefined : beginEdit}>
              {editing ? (
                <textarea
                  data-testid={`kanban-edit-${card.uid}`}
                  value={draft}
                  rows={1}
                  autoFocus
                  onChange={(e) =>
                    // 引擎节点文本是单行模型（\r\n 入节点 → serialize 断言抛错 → 复制/保存无声失败），
                    // 粘贴多行文本时把换行折叠为空格（输入法/键入的换行已被 Enter=提交挡住）
                    setDraft(e.target.value.replace(/\r?\n/g, ' '))
                  }
                  onKeyDown={(e) => handleEditInputKey(e, commitEdit, cancelEditAndRefocus)}
                  onBlur={commitEdit}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="w-full field-sizing-content resize-none rounded border bg-background px-1 py-0.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              ) : (
                <p className="break-words font-medium leading-snug">{card.text}</p>
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
                {/* 回导图定位（2026-09 验收变更自卡片单击移入）：菜单项 click 沿 React 树
                    从 portal 冒泡回 li——li 保留任何单击处理器都会被菜单项误触 */}
                <DropdownMenuItem
                  data-testid={`kanban-locate-${card.uid}`}
                  onSelect={() => {
                    try {
                      onLocate(card.uid)
                    } catch (e) {
                      // Radix onSelect 回调的异常运行时只静默吞（无框架兜底），自兜留痕
                      console.error('看板定位回调失败', e)
                    }
                  }}
                >
                  {t('editor.kanban.menu.locate')}
                </DropdownMenuItem>
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
                <DropdownMenuItem
                  data-testid={`kanban-copy-${card.uid}`}
                  onSelect={() => onCopyCard(card.uid)}
                >
                  {t('editor.kanban.menu.copyCard')}
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
              {/* 子孙徽标（2026-09 子树卡片）：卡片体量指示——hover 整卡可速览大纲 */}
              {card.childCount > 0 && (
                <span
                  data-testid={`kanban-children-${card.uid}`}
                  className="rounded bg-secondary px-1 text-[10px] leading-4 text-secondary-foreground"
                >
                  {t('editor.kanban.children', { n: card.childCount })}
                </span>
              )}
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
      </TooltipTrigger>
      {/* 子孙速览浮层（2026-09 子树卡片）：portal 渲染不被列容器 overflow 裁剪；纯展示
          不可交互（指针移出卡片即关）——细看/编辑回导图（点卡片定位）。每行独立 li 按
          depth 打缩进留白（2026-09 验收微调：pre-wrap 拼接无行距层级，内容糊作一团），
          行距 gap-2 分行（2026-09 二轮验收：gap-1 行距仍不够清晰）；限高 + 滚动作超长
          护栏（slimScrollbar 对 overflow 容器自动生效）；
          底色 bg-foreground 不透明 */}
      <TooltipContent
        data-testid={`kanban-tip-${card.uid}`}
        className="max-h-64 w-80 max-w-[80vw] overflow-y-auto"
      >
        <ul className="flex list-none flex-col gap-2">
          {card.outline.map((line) => (
            <li
              key={line.uid}
              className="break-words leading-snug"
              style={{ paddingLeft: `${line.depth * 14}px` }}
            >
              {line.text}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}
