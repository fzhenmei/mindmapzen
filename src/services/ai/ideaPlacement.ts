// src/services/ai/ideaPlacement.ts —— AI 推荐挂载位置（spec §6，M3）：独立于聊天面板，
// 复用 ai/client 的 transport（__AI_TRANSPORT_FACTORY__ 可注入）与 abort 语义。
// AI 只读不写（§6.4）：一切写入仍在用户确认后的 M1 挂载管线。
// 本文件分四层：摘要构建（Task 1）→ 解析容错与校验（Task 2）→ 两阶段编排（Task 3）
import type { ZenNode } from '../../types/tree'

/** 护栏常量（spec §6.4 初始建议值）：图数超限整批拒绝并显式提示；单图节点数超限细摘要截断标注 */
export const MAX_MAPS_FOR_AI = 50
export const MAX_NODES_PER_MAP = 200
/** 粗摘要字符上限（§6.2「逐图截断并标注超限」） */
export const COARSE_CHAR_CAP = 240

export interface CoarseMapSummary {
  mapPath: string
  name: string
  summary: string
  truncated: boolean
}

export interface FineMapSummary {
  mapPath: string
  name: string
  outline: string
  nodeCount: number
  truncated: boolean
}

/** 图名 = 尾段去 .md（与 BasketSortPanel.basenameOf 同口径；AI 提示里用可读名） */
function basenameOf(mdPath: string): string {
  const seg = mdPath.split(/[\\/]/).pop() ?? mdPath
  return seg.replace(/\.md$/i, '')
}

/** 粗摘要（§6.2 阶段①）：根文本 + 一层子节点文本（深层不进——控 token） */
export function buildCoarseSummary(mapPath: string, tree: ZenNode): CoarseMapSummary {
  const kids = tree.children.map((c) => c.text).join('、')
  const full = kids === '' ? tree.text : `${tree.text}：${kids}`
  const truncated = full.length > COARSE_CHAR_CAP
  const suffix = '…（截断）'
  return {
    mapPath,
    name: basenameOf(mapPath),
    // 截断给标注留位：COARSE_CHAR_CAP 是含标注在内的总长上限（§6.2「逐图截断并标注超限」）
    summary: truncated ? full.slice(0, COARSE_CHAR_CAP - suffix.length) + suffix : full,
    truncated,
  }
}

/** 数完全部节点（根在内），到 cap 即止（截断遍历，不数到底） */
function countAndCollect(node: ZenNode, cap: number, out: string[], depth: number): boolean {
  out.push(`${'  '.repeat(depth)}- ${node.text}`)
  if (out.length >= cap + 1) return false // cap+1：根占 1 个名额
  for (const c of node.children) {
    if (!countAndCollect(c, cap, out, depth + 1)) return false
  }
  return true
}

/** 细摘要（§6.2 阶段②）：完整缩进大纲，节点数上限护栏（超限截断标注，不静默） */
export function buildFineSummary(mapPath: string, tree: ZenNode, cap = MAX_NODES_PER_MAP): FineMapSummary {
  const lines: string[] = []
  const complete = countAndCollect(tree, cap, lines, 0)
  return {
    mapPath,
    name: basenameOf(mapPath),
    outline: lines.join('\n'),
    nodeCount: lines.length,
    truncated: !complete,
  }
}
