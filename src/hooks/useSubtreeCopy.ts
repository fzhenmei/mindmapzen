// src/hooks/useSubtreeCopy.ts —— 复制 md 管线（2026-09 子树卡片拆自 EditorView，行数护栏，
// 同 useExportFlow 动因）：子树→md→剪贴板公共管线 + 两个入口（整图/选中子树的 doCopy、
// 看板卡片子树的 copyKanbanCard），行为与拆出前零变化。
import { useCallback } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { engineTreeToZen, findSubtreeByUid, serialize } from '../services/mdTree'
import { applyCopySettings, stripTreeBody } from '../services/copyFilter'
import { absolutizeImagePaths } from '../services/aiImagePaths'
import { truncateCardSubtree } from '../services/kanban'
import type { WriteClipboard } from '../services/clipboard'
import type { ActiveSelection } from './useActiveSelection'
import type { LinkRegistry } from '../editor/linkRegistry'
import type { MindMapHandle } from '../types/engine'
import type { ZenNode } from '../types/tree'

interface SubtreeCopyDeps {
  mmRef: RefObject<MindMapHandle | null>
  writeClipboard: WriteClipboard
  registry: LinkRegistry
  selection: ActiveSelection
  flashCopy(kind: 'copied-md' | 'copied-node'): void
  setError(e: string | null): void
}

export function useSubtreeCopy({
  mmRef, writeClipboard, registry, selection, flashCopy, setError,
}: Readonly<SubtreeCopyDeps>): { doCopy(): void; copyKanbanCard(uid: string): void } {
  const { t } = useTranslation()

  /** 子树→md→剪贴板公共管线（doCopy 与看板卡片复制共用零分叉）：正文按 settings 树层
   *  剥除（终审 C1，先于序列化——md 层正则剥 `> ` 行会误伤正文代码块/引用行）；md 层
   *  后处理仅剩双链括号（getState 取实时值）。尾段图片引用相对→绝对（2026-09）：须在
   *  剥正文之后——头注引用行不能被一并剥掉。序列化同步段 try 兜底（2026-09-07 回归：
   *  Word 粘贴携 \r\n 致 assert 抛错曾无声失败），异步段 then 同口径 */
  const copyMdToClipboard = useCallback(
    (zen: ZenNode, kind: 'copied-md' | 'copied-node'): void => {
      let md: string
      try {
        const settings = useAppStore.getState().settings
        const bodyApplied = settings.copyIncludeBody ? zen : stripTreeBody(zen)
        md = applyCopySettings(serialize(bodyApplied, registry.byUid), settings)
      } catch (e) {
        setError(t('errors.copyMdFailed', { reason: e instanceof Error ? e.message : String(e) }))
        return
      }
      const wsDir = useAppStore.getState().workspaceDir
      if (wsDir !== null) md = absolutizeImagePaths(md, wsDir)
      void writeClipboard(md).then(
        () => flashCopy(kind),
        (e) => setError(t('errors.copyMdFailed', { reason: String(e) })),
      )
    },
    [registry, writeClipboard, flashCopy, setError, t],
  )

  /** 复制范围解析：有选中节点→该 uid 子树（从 H1 重计层级）；否则整图；陈旧 uid（未命中
   *  渲染树，如撤销删除）清选中回退整图 */
  const doCopy = useCallback((): void => {
    const mm = mmRef.current
    if (!mm) return
    const full = mm.getData()
    selection.clearStaleIfMissing(full)
    const uid = selection.activeUidRef.current
    const active = uid ? findSubtreeByUid(full, uid) : null
    copyMdToClipboard(engineTreeToZen(active ?? full).tree, 'copied-md')
  }, [mmRef, selection, copyMdToClipboard])

  /** 看板卡片复制（2026-09 子树卡片）：该卡追踪范围的子树 md（截断口径——带状态后代是
   *  独立卡片不入本卡，见 truncateCardSubtree），粘贴给 AI；印记同 md 复制（看板态无
   *  选中节点，flashCopy 锚根节点）。陈旧 uid 防御：未命中留显式线索不静默 */
  const copyKanbanCard = useCallback(
    (uid: string): void => {
      const mm = mmRef.current
      if (mm === null) return
      const sub = findSubtreeByUid(mm.getData(), uid)
      if (sub === null) {
        console.error('看板卡片复制失败：数据树中无此节点', uid)
        return
      }
      copyMdToClipboard(truncateCardSubtree(engineTreeToZen(sub).tree), 'copied-md')
    },
    [mmRef, copyMdToClipboard],
  )

  return { doCopy, copyKanbanCard }
}
