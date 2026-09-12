// src/services/kanban.ts —— 树 → 看板卡片集映射（纯函数；看板 = 状态投影，结构事实源在导图）
// 卡片范围：有 status 的节点才是卡片（spec 决策「有状态才是卡片」，无状态节点不进板）；
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
}

export function buildKanbanCards(root: ZenNode): KanbanCard[] {
  const out: KanbanCard[] = []
  const walk = (node: ZenNode, path: string[]): void => {
    if (node.status !== undefined && node.uid !== undefined) {
      out.push({
        uid: node.uid, text: node.text, status: node.status, path,
        icons: node.icons ?? [], tags: node.tags ?? [], hasBody: node.body !== undefined && node.body !== '',
      })
    }
    const childPath = node === root ? path : [...path, node.text]
    for (const c of node.children) walk(c, childPath)
  }
  walk(root, [])
  return out
}
