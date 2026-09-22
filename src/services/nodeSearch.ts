// src/services/nodeSearch.ts —— 节点搜索数据面纯函数（2026-09）：
// flattenNodeHits 把引擎数据树扁平化为搜索候选（含收起隐藏子树——收起只改 data.expand
// 不摘 children，renderTree 全量即搜索全集）；filterNodeHits 大小写不敏感子串过滤
//（中文无大小写，英文口径与 QuickSwitch matches 一致）。跳转定位/激活高亮在
// useNodeSearch 组合（expandToUid + centerNodeOnRender + SET_NODE_ACTIVE），不在此处。
import type { EngineNode } from '../types/engine'

/** 搜索候选（flattenNodeHits 产物）：uid 用于跳转寻址，text/path/depth 用于展示 */
export interface NodeHit {
  uid: string
  /** 节点显示文本（data.text，引擎已剥双链标记的形态） */
  text: string
  /** 祖先面包屑（'根 / 分支'，不含自身；根节点为空串） */
  path: string
  /** 层深（根 = 0） */
  depth: number
}

/** 数据树 DFS 扁平化（含收起隐藏子树）；text/uid 非字符串的毒节点跳过自身、仍递归
 *  子树（Word 粘贴毒节点家族防御——坏数据不挡好子孙） */
export function flattenNodeHits(root: EngineNode | null | undefined): NodeHit[] {
  if (root === null || root === undefined) return []
  const out: NodeHit[] = []
  const walk = (node: EngineNode, parentPath: string, depth: number): void => {
    const { text, uid } = node.data
    // 当前节点自身入列（毒数据跳过）；path = 父面包屑（不含自身）
    if (typeof text === 'string' && typeof uid === 'string') {
      out.push({ uid, text, path: parentPath, depth })
    }
    const selfPath = parentPath === '' ? text : `${parentPath} / ${text}`
    for (const c of node.children ?? []) walk(c, typeof text === 'string' ? selfPath : parentPath, depth + 1)
  }
  walk(root, '', 0)
  return out
}

/** 大小写不敏感子串过滤；空/纯空白 query 返回全量原序（截断策略在展示层） */
export function filterNodeHits(hits: readonly NodeHit[], query: string): NodeHit[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...hits]
  return hits.filter((h) => h.text.toLowerCase().includes(q))
}
