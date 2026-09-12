// src/views/KanbanView.tsx —— 看板模式浮层（2026-09 看板模式 Task 6）
// 结构事实源在导图（spec 决策）：看板 = 状态投影。本组件是 mm 命令编排层——
// 每个编辑操作 = 恰一条引擎命令 + 显式 onDataChanged()（useIconPicker.apply 同款
// 纪律：命令入 undo 历史、回调触发保存链置脏）；卡片集经 data_change 订阅全量
// 重投影（自身命令也触发，幂等无碍）。
// 浮层期画布不卸载不 resize（WebView2 0×0 污染防护）：absolute inset-0 z-20 不透明
// 覆盖，挂载即夺 body 焦点使引擎快捷键失活（keyCommand.defaultEnableCheck 只认
// body 焦点，画布键盘被看板接管）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RefObject } from 'react'
import type { MindMapHandle } from '../types/engine'
import { TASK_STATUSES, type TaskStatus } from '../services/statusMarkers'
import { buildKanbanCards, type KanbanCard as KanbanCardData } from '../services/kanban'
import { engineTreeToZen } from '../services/mdTree'
import { expandToUid, mergeStatusBadge, nodeStatusOf } from '../services/statusOps'
import { findByUid } from '../hooks/useIconPicker'
import KanbanColumn from '../components/KanbanColumn'
import { IconWinClose } from '../components/icons'

export interface KanbanViewProps {
  mmRef: RefObject<MindMapHandle | null>
  /** 编辑上报（保存链置脏）：所有引擎命令后调用（照 useIconPicker.apply 模式） */
  onDataChanged(): void
  /** 打开正文弹窗（bodyDialog.toggle(uid)） */
  onOpenBody(uid: string): void
  /** 打开图标/标签选择器（iconPick/tagPick.openPicker 同款入参） */
  onEditIcons(card: { text: string; icons: string[] }): void
  onEditTags(card: { text: string; tags: string[]; used: string[] }): void
  /** 回导图定位（EditorView 组合：切 viewMode + 展开路径 + moveNodeToCenter） */
  onLocate(uid: string): void
  onClose(): void
}

/** 收起分支展开后渲染树重试上限：safeReRender 渲染中场景首轮事件新树未建，需等
 *  其排的重渲完成（1 次重挂即够，上限是防异常树死循环） */
const RENDER_RETRY_MAX = 3

export default function KanbanView({
  mmRef, onDataChanged, onOpenBody, onEditIcons, onEditTags, onLocate, onClose,
}: Readonly<KanbanViewProps>) {
  const { t } = useTranslation()
  const [cards, setCards] = useState<KanbanCardData[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

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

  /** 渲染节点寻址（收起分支任务的常规可达路径）：渲染树命中即同步应用；miss 时先
   *  expandToUid 展开数据树上的收起祖先（expand 直写不进 undo——视图导航豁免，见
   *  statusOps.expandToUid 注释），经 node_tree_render_end 回调在新树上重试。重试
   *  有限次：safeReRender 在「引擎渲染中」场景会先排一轮重渲（其回调先于本回调执行），
   *  首轮事件时新树可能未建，miss 则重挂等待下一轮。数据树也无此 uid（垃圾 uid）
   *  时 console.error 显式出口。 */
  const withRenderNode = useCallback(
    (uid: string, label: string, apply: (node: unknown) => void): void => {
      const mm = mmRef.current
      if (mm === null) return
      const found = mm.renderer?.findNodeByUid(uid)
      if (found !== null && found !== undefined) {
        apply(found)
        return
      }
      if (!expandToUid(mm, uid)) {
        console.error(`看板${label}失败：数据树中无此节点`, uid)
        return
      }
      let tries = 0
      const onEnd = (): void => {
        mm.off('node_tree_render_end', onEnd)
        try {
          const node = mm.renderer?.findNodeByUid(uid)
          if (node === null || node === undefined) {
            if (tries < RENDER_RETRY_MAX) {
              tries += 1
              mm.on('node_tree_render_end', onEnd)
              return
            }
            console.error(`看板${label}失败：展开重渲后仍未找到渲染节点`, uid)
            return
          }
          apply(node)
        } catch (e) {
          // 引擎事件回调内的异常运行时只静默吞（无框架兜底），自兜留痕
          console.error(`看板${label}回调失败`, e)
        }
      }
      mm.on('node_tree_render_end', onEnd)
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
    <div
      ref={rootRef}
      tabIndex={-1}
      data-testid="kanban-view"
      className="absolute inset-0 z-20 flex flex-col bg-background outline-none"
    >
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-medium">{t('editor.kanban.viewName')}</h2>
        <button
          type="button"
          data-testid="kanban-close"
          aria-label={t('editor.kanban.close')}
          title={t('editor.kanban.close')}
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <IconWinClose size={14} />
        </button>
      </header>
      {/* 五列横排：细滚动条系统对 overflow 容器自动生效（slimScrollbar 全局注入） */}
      <div className="flex flex-1 items-start gap-3 overflow-x-auto p-4">
        {TASK_STATUSES.map((s) => (
          <KanbanColumn
            key={s}
            status={s}
            cards={cards.filter((c) => c.status === s)}
            onStatusChange={changeStatus}
            onTextChange={changeText}
            onDelete={deleteCard}
            onOpenBody={onOpenBody}
            onEditIcons={onEditIcons}
            onEditTags={(card) => onEditTags({ ...card, used: usedTags })}
            onLocate={onLocate}
            onAdd={(text) => addCard(s, text)}
          />
        ))}
      </div>
    </div>
  )
}
