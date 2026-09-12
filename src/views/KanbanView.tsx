// src/views/KanbanView.tsx —— 看板模式浮层（2026-09 看板模式 Task 6）
// 结构事实源在导图（spec 决策）：看板 = 状态投影。本组件是 mm 命令编排层——
// 每个编辑操作 = 恰一条引擎命令 + 显式 onDataChanged()（useIconPicker.apply 同款
// 纪律：命令入 undo 历史、回调触发保存链置脏）；卡片集经 data_change 订阅全量
// 重投影（自身命令也触发，幂等无碍）。
// 浮层期画布不卸载不 resize（WebView2 0×0 污染防护）：absolute inset-0 z-20 不透明
// 覆盖，挂载即夺 body 焦点使引擎快捷键层失活（keyCommand.defaultEnableCheck 只认
// body 焦点）。宿主 window 兜底层（MindMapCanvas.onKeydown）按 viewMode 门禁：看板态
// Tab/Enter/Delete 译件短路（不放行打进被遮画布），撤销兜底（Ctrl+Z/y）除外——看板内
// 撤销靠它（engineKeyboard.handleCanvasFallbackKey）。浮层根用原生 <dialog open>（非模态，
// 无原生 Esc/focus 陷阱副作用；Sonar S6819 对 role="dialog" 的规则终点即原生元素）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RefObject } from 'react'
import type { MindMapHandle } from '../types/engine'
import { BOARD_STATUSES, type TaskStatus } from '../services/statusMarkers'
import { buildKanbanCards, type KanbanCard as KanbanCardData } from '../services/kanban'
import { engineTreeToZen } from '../services/mdTree'
import { execOnRenderNode, mergeStatusBadge, nodeStatusOf } from '../services/statusOps'
import { findByUid } from '../hooks/useIconPicker'
import KanbanColumn from '../components/KanbanColumn'
import { IconArchive, IconWinClose } from '../components/icons'

/** 过滤匹配（2026-09 看板治理 spec §4）：标题 / 路径段 / 标签，大小写不敏感；
 *  空过滤恒真（过滤关闭态）——纯视图态，不进 undo */
const matchesFilter = (c: KanbanCardData, filterText: string): boolean => {
  const q = filterText.trim().toLowerCase()
  if (q === '') return true
  return (
    c.text.toLowerCase().includes(q) ||
    c.path.some((p) => p.toLowerCase().includes(q)) ||
    c.tags.some((tg) => tg.toLowerCase().includes(q))
  )
}

export interface KanbanViewProps {
  mmRef: RefObject<MindMapHandle | null>
  /** 编辑上报（保存链置脏）：所有引擎命令后调用（照 useIconPicker.apply 模式） */
  onDataChanged(): void
  /** 打开正文弹窗（bodyDialog.toggle(uid)） */
  onOpenBody(uid: string): void
  /** 打开图标/标签选择器（iconPick/tagPick.openPicker 同款入参 + 显式卡片 uid——
   *  看板卡片不是画布选中节点，宿主桥接 picker 必须经 uid 显式寻址） */
  onEditIcons(card: { uid: string; text: string; icons: string[] }): void
  onEditTags(card: { uid: string; text: string; tags: string[]; used: string[] }): void
  /** 回导图定位（EditorView 组合：切 viewMode + 展开路径 + moveNodeToCenter） */
  onLocate(uid: string): void
  /** 复制卡片子树 md（2026-09 子树卡片）：管线在宿主 EditorView（doCopy 同源） */
  onCopyCard(uid: string): void
  onClose(): void
}

export default function KanbanView({
  mmRef, onDataChanged, onOpenBody, onEditIcons, onEditTags, onLocate, onCopyCard, onClose,
}: Readonly<KanbanViewProps>) {
  const { t } = useTranslation()
  const [cards, setCards] = useState<KanbanCardData[]>([])
  const [filterText, setFilterText] = useState('')
  const filterActive = filterText.trim() !== ''
  // 归档列展开态（2026-09 看板治理 spec §2.3/§4）：用户手动开 || 过滤强制——
  // 过滤清空回落用户态（archiveOpen 不被过滤清空改写，spec §4「清空后保持当前展开态」
  // 的实现形态：强制项消失即回落）
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveExpanded = archiveOpen || filterActive
  const rootRef = useRef<HTMLDialogElement>(null)

  /** 全量重投影：engineTreeToZen 透传 uid（卡片寻址靠 uid）；构建失败留 console 线索 */
  const refresh = useCallback(() => {
    const mm = mmRef.current
    if (mm === null) return
    try {
      setCards(buildKanbanCards(engineTreeToZen(mm.getData()).tree))
    } catch (e) {
      console.error('看板卡片刷新失败', e)
    }
  }, [mmRef])

  // 订阅：挂载即首刷 + data_change 订阅，卸载退订防泄漏（refresh 引用恒定，同引用进退）
  useEffect(() => {
    const mm = mmRef.current
    refresh()
    mm?.on('data_change', refresh)
    return () => {
      mm?.off('data_change', refresh)
    }
  }, [mmRef, refresh])

  // 夺 body 焦点（tabIndex=-1 使 div 可聚焦）：引擎画布快捷键自此失活
  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  /** 渲染节点寻址（收起分支任务的常规可达路径）：共享实现在 statusOps.execOnRenderNode
   *  （2026-09 审查 Important-2 提升——useIconPicker/useTagPicker 桥接同款路径），此处
   *  薄包 mmRef；语义注释（展开豁免/有限重试/显式出口）见该函数 */
  const withRenderNode = useCallback(
    (uid: string, label: string, apply: (node: unknown) => void): void => {
      execOnRenderNode(mmRef.current, uid, label, apply)
    },
    [mmRef],
  )

  /** 改状态/清除：读侧走数据树（findByUid 的 getData 快照含收起隐藏子树，收起分支
   *  任务照常进板可读现值）；写侧经渲染节点 setIcon（SET_NODE_ICON 命令，入历史触发
   *  重渲），徽章互保合成在 mergeStatusBadge（唯一合成点：滤旧徽章、新徽章置首、
   *  保留用户图标）。收起分支任务经 expandToUid 展开后落命令（expand 直写不进 undo
   *  是视图态豁免）。同态短路：拖回原列/重选当前态不产生命令（不占 undo 一步、不置脏） */
  const changeStatus = useCallback(
    (uid: string, status: TaskStatus | null) => {
      const mm = mmRef.current
      if (mm === null) return
      if (nodeStatusOf(mm, uid) === status) return
      const icons = mergeStatusBadge(findByUid(mm.getData(), uid)?.data.icon, status)
      withRenderNode(uid, '改状态', (node) => {
        ;(node as { setIcon(icons: string[]): void }).setIcon(icons)
        onDataChanged()
      })
    },
    [mmRef, withRenderNode, onDataChanged],
  )

  /** 改文本：渲染节点 setText（SET_NODE_TEXT 命令，入历史）；收起分支经展开后落命令 */
  const changeText = useCallback(
    (uid: string, text: string) => {
      withRenderNode(uid, '改文本', (node) => {
        ;(node as { setText(text: string): void }).setText(text)
        onDataChanged()
      })
    },
    [withRenderNode, onDataChanged],
  )

  /** 列底新增（挂根、落列状态）。根 data.uid 恒存在——引擎 handleData
   *  （simple-mind-map/index.js:188）构造时对整树 createUidForAppointNodes 补 uid；
   *  INSERT_CHILD_NODE 签名（Render.js:893）(openEdit, appointNodes, appointData)：
   *  appointNodes 须传渲染节点实例（新节点 push 进其 nodeData.children），
   *  appointData 浅展开进新节点 data（text/icon 与引擎生成的 uid 合并），openEdit=false
   *  不弹画布编辑框（文本已在列底输入给出） */
  const addCard = useCallback(
    (status: TaskStatus, text: string) => {
      const mm = mmRef.current
      if (mm === null) return
      const rootUid = mm.getData().data.uid
      const rootNode =
        typeof rootUid === 'string' ? mm.renderer?.findNodeByUid(rootUid) : undefined
      if (rootNode === null || rootNode === undefined) {
        console.error('看板新增失败：根渲染节点未找到', rootUid)
        return
      }
      mm.execCommand('INSERT_CHILD_NODE', false, [rootNode], {
        text,
        icon: [`zen_status-${status}`],
      })
      onDataChanged()
    },
    [mmRef, onDataChanged],
  )

  /** 删除：REMOVE_NODE 接受 appointNodes 形参（Render.js:1413 removeNode(appointNodes)，
   *  formatDataToArray；isAppointNodes 分支 removeFromParentNodeData）——渲染节点直删，
   *  入历史可撤销；收起分支经展开后落命令 */
  const deleteCard = useCallback(
    (uid: string) => {
      withRenderNode(uid, '删除', (node) => {
        const mm = mmRef.current
        if (mm === null) return
        mm.execCommand('REMOVE_NODE', [node])
        onDataChanged()
      })
    },
    [mmRef, withRenderNode, onDataChanged],
  )

  // 标签全集（used）：选择器候选复用口径——现役卡片标签去重
  const usedTags = useMemo(() => [...new Set(cards.flatMap((c) => c.tags))], [cards])

  return (
    <dialog
      ref={rootRef}
      open
      tabIndex={-1}
      aria-label={t('editor.kanban.viewName')}
      data-testid="kanban-view"
      className="absolute inset-0 z-20 m-0 flex h-full max-h-none w-full max-w-none flex-col border-0 bg-background p-0 text-foreground outline-none"
      onKeyDown={(e) => {
        // Esc 分层（2026-09 验收微调）：普通态 Esc 返回导图。
        // ① 卡片编辑/列内新增：子孙输入框 onKeyDown stopPropagation（React 树内真实拦截），
        //    不冒泡至此。
        // ② Radix 浮层（卡片下拉菜单/图标标签选择器）：portal 内容的事件沿 React 树跨边界
        //    冒泡（React 官方行为），合成事件仍会到达这里——实际不误关靠 Radix
        //    DismissableLayer 在 ownerDocument capture 阶段监听 keydown（其 dist 源码：
        //    addEventListener('keydown', handleKeyDown, { capture: true })）对 Escape 调
        //    原生 preventDefault()，事件到达本处理器时 defaultPrevented 已为 true。
        // 故 !defaultPrevented 守卫是承重结构勿删：放行普通态关板、吞掉 Radix 已消费的 Esc
        if (e.key === 'Escape' && !e.defaultPrevented) onClose()
      }}
    >
      {/* 原生 dialog（Sonar S6819：role="dialog" 的规则终点即原生元素）。非模态 open
          属性不引原生 Esc 拦截（cancel 事件仅 showModal 触发），Esc 语义仍归 onKeyDown；
          UA 默认样式（margin auto / fit-content 尺寸 / max 钳制 / border / padding /
          CanvasText 前景色）用工具类压平，保持原 div 覆盖盒不变 */}
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <h2 className="shrink-0 text-sm font-medium">{t('editor.kanban.viewName')}</h2>
        <input
          data-testid="kanban-filter"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          onKeyDown={(e) => {
            // Esc 分层（协议同列底新增输入框）：非空只清空不冒泡；已空冒泡走关板——
            // 看板根 !defaultPrevented 守卫承重链不受影响（普通合成事件未被 prevent）
            if (e.key === 'Escape' && filterText !== '') {
              e.stopPropagation()
              setFilterText('')
            }
          }}
          placeholder={t('editor.kanban.filterPlaceholder')}
          className="ml-auto w-56 shrink-0 rounded-md border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <button
          type="button"
          data-testid="kanban-close"
          aria-label={t('editor.kanban.close')}
          title={t('editor.kanban.close')}
          onClick={onClose}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <IconWinClose size={14} />
        </button>
      </header>
      {/* 五列横排：细滚动条系统对 overflow 容器自动生效（slimScrollbar 全局注入） */}
      <div className="flex flex-1 items-start gap-3 overflow-x-auto p-4">
        {BOARD_STATUSES.map((s) => (
          <KanbanColumn
            key={s}
            status={s}
            cards={cards.filter((c) => c.status === s && matchesFilter(c, filterText))}
            filterActive={filterActive}
            onStatusChange={changeStatus}
            onTextChange={changeText}
            onDelete={deleteCard}
            onOpenBody={onOpenBody}
            onEditIcons={onEditIcons}
            onEditTags={(card) => onEditTags({ ...card, used: usedTags })}
            onLocate={onLocate}
            onCopyCard={onCopyCard}
            onAdd={(text) => addCard(s, text)}
          />
        ))}
        {archiveExpanded ? (
          <KanbanColumn
            status="archived"
            cards={cards.filter((c) => c.status === 'archived' && matchesFilter(c, filterText))}
            filterActive={filterActive}
            onCollapse={() => setArchiveOpen(false)}
            onStatusChange={changeStatus}
            onTextChange={changeText}
            onDelete={deleteCard}
            onOpenBody={onOpenBody}
            onEditIcons={onEditIcons}
            onEditTags={(card) => onEditTags({ ...card, used: usedTags })}
            onLocate={onLocate}
            onCopyCard={onCopyCard}
            onAdd={(text) => addCard('archived', text)}
          />
        ) : (
          // 收起条（默认态）：列头同款视觉（色点省略——IconArchive 即语义），计数即入口
          <button
            type="button"
            data-testid="kanban-archive-collapsed"
            onClick={() => setArchiveOpen(true)}
            className="flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconArchive size={14} />
            <span>{t('editor.kanban.status.archived')}</span>
            <span className="rounded-full bg-secondary px-1.5 text-[10px] leading-4 text-secondary-foreground">
              {cards.filter((c) => c.status === 'archived').length}
            </span>
          </button>
        )}
      </div>
    </dialog>
  )
}
