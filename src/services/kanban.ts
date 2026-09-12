// src/services/kanban.ts —— 树 → 看板卡片集映射（纯函数；看板 = 状态投影，结构事实源在导图）
// 卡片范围：有 status 的节点才是卡片（spec 决策「有状态才是卡片」，无状态节点不进板）；
// 卡片整体 = 节点 + 无状态后代（2026-09 子树卡片：子孙是对任务的补充说明，整卡追踪），
// 嵌套状态走截断口径——带 status 的后代是独立卡片，父卡范围在它处剪断（含其后代）。
// DFS 全量遍历不受引擎折叠影响——引擎折叠是渲染态，getData/renderTree 全量语义
// （见 memory engine-render-tree-vs-data-tree），卡片集恒为全量任务。
import type { TaskStatus } from './statusMarkers'
import type { ZenNode } from '../types/tree'

export interface KanbanCard {
  uid: string
  text: string
  status: TaskStatus
  /** 父链文本（根→父，不含自身；根下直挂为空数组 = 「未分组」，文案由视图层 i18n） */
  path: string[]
  icons: string[]
  tags: string[]
  hasBody: boolean
  /** 截断范围内无状态后代数（带状态后代是独立卡片，不计不入）；无子孙为 0 */
  childCount: number
  /** 子孙速览大纲：缩进文本行（两空格一级，直接子节点顶格——卡片标题即第 0 级），截断口径同 childCount */
  outline: string[]
}

/** 是否为卡片边界（出卡判定 = 父卡截断判定，两侧共用一个口径：出卡的节点就是别的卡的剪断线） */
const isCardNode = (n: ZenNode): boolean => n.status !== undefined && n.uid !== undefined

/** 收集卡片子树（截断口径）：无状态后代进大纲并计数，带状态后代整枝剪掉（独立成卡） */
function collectSubtree(node: ZenNode, depth: number, outline: string[]): number {
  let count = 0
  for (const c of node.children) {
    if (isCardNode(c)) continue
    outline.push(`${'  '.repeat(depth)}${c.text}`)
    count += 1 + collectSubtree(c, depth + 1, outline)
  }
  return count
}

export function buildKanbanCards(root: ZenNode): KanbanCard[] {
  const out: KanbanCard[] = []
  const walk = (node: ZenNode, path: string[]): void => {
    if (isCardNode(node)) {
      const outline: string[] = []
      out.push({
        uid: node.uid as string, text: node.text, status: node.status as TaskStatus, path,
        icons: node.icons ?? [], tags: node.tags ?? [], hasBody: node.body !== undefined && node.body !== '',
        childCount: collectSubtree(node, 0, outline), outline,
      })
    }
    const childPath = node === root ? path : [...path, node.text]
    for (const c of node.children) walk(c, childPath)
  }
  walk(root, [])
  return out
}

/** 卡片复制范围剪枝（就地、返回原引用便于链式）：带 status 的后代连同其后代整枝剪掉
 *  （它是独立卡片，复制口径 = 追踪口径，粘贴给 AI 不产生重复上下文）。入参须为
 *  fresh 树（engineTreeToZen 产物）——原地改 children 无共享变异风险 */
export function truncateCardSubtree(node: ZenNode): ZenNode {
  node.children = node.children.filter((c) => c.status === undefined)
  for (const c of node.children) truncateCardSubtree(c)
  return node
}
