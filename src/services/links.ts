// src/services/links.ts —— [[名称]] 双链解析（M5b Task 3 + 2026-09-03 同名消歧）：纯函数，无引擎/DOM 依赖。
// 路径约定与折叠路径一致（mdTree.zenToEngineTree）：根为 '/'+text，子为父路径+'/'+text，字面拼接。
import type { ZenNode } from '../types/tree'

/** 未解析双链：from = 源节点全路径（原样含 [[..]] 标记）；toPath = 括号内原文（名称或 /全/路径，
 *  路径形式可带 #n 孪生序号）；fromOrdinal = 源节点同路径孪生序号（文档序 1 起，唯一/首位省略） */
export interface MindLink {
  from: string
  toPath: string
  fromOrdinal?: number
}

/** 已解析双链：两端均为树内路径 + 可选孪生序号（1 = 缺省首位，canonical 省略字段），
 *  可直接映射引擎节点实例建线 */
export interface ResolvedLink {
  fromPath: string
  toPath: string
  fromOrdinal?: number
  toOrdinal?: number
}

const LINK_RE = /\[\[([^\][]+)\]\]/g
/** 路径形式 #n 后缀（2026-09-03 spec §3）：'基路径#序号'——仅在整串未精确命中时剥取 */
const ORDINAL_RE = /^(.+)#(\d+)$/

/** 扫描所有节点文本中的 [[...]] 标记（一节点多链逐条收集；空括号 [[]] 忽略；
 *  源节点为同路径孪生时填 fromOrdinal——文档序出现次序，1 省略） */
export function parseLinks(root: ZenNode): MindLink[] {
  const out: MindLink[] = []
  const walk = (node: ZenNode, parentPath: string, seenPath: Map<string, number>): void => {
    const path = parentPath === '' ? '/' + node.text : parentPath + '/' + node.text
    const ordinal = (seenPath.get(path) ?? 0) + 1
    seenPath.set(path, ordinal)
    for (const m of node.text.matchAll(LINK_RE)) {
      if (m[1] !== '')
        out.push({ from: path, ...(ordinal > 1 ? { fromOrdinal: ordinal } : {}), toPath: m[1] })
    }
    for (const child of node.children) walk(child, path, seenPath)
  }
  walk(root, '', new Map())
  return out
}

/** 宽容解析（spec §4 + 2026-09-03 §3）：名称形式按全树精确同名计数，唯一命中保留（归一为该节点
 *  全路径——ResolvedLink 两端均为树内路径，建线端按路径映射引擎实例），零/多命中丢弃；
 *  '/' 开头的全路径形式：**整串精确命中优先**（节点文本本身含 #数字时整串即路径），未命中且带
 *  #n 后缀时剥后缀按同路径孪生序号取位——#1 可省略（缺省首位），#0 归一为 1，越界钳到最近
 *  合法位（孪生被删后线保持可见，不静默消失）；序号对当前树钳位后恒合法。fromOrdinal 透传。 */
export function resolveLinks(tree: ZenNode, links: MindLink[]): ResolvedLink[] {
  const paths: string[] = []
  const pathCount = new Map<string, number>()
  const nameCount = new Map<string, number>()
  const namePath = new Map<string, string>()
  const walk = (node: ZenNode, parentPath: string): void => {
    const path = parentPath === '' ? '/' + node.text : parentPath + '/' + node.text
    paths.push(path)
    pathCount.set(path, (pathCount.get(path) ?? 0) + 1)
    nameCount.set(node.text, (nameCount.get(node.text) ?? 0) + 1)
    namePath.set(node.text, path)
    for (const child of node.children) walk(child, path)
  }
  walk(tree, '')
  // 单链解析（guard-clause 早退结构，压 S3776 认知复杂度）：路径形式整串优先 + #n 剥取钳位；名称形式唯一命中
  const resolveOne = (link: MindLink): ResolvedLink | undefined => {
    const fromOrdinal =
      link.fromOrdinal !== undefined && link.fromOrdinal > 1 ? { fromOrdinal: link.fromOrdinal } : {}
    if (!link.toPath.startsWith('/')) {
      // 名称形式：精确同名唯一命中才保留
      if ((nameCount.get(link.toPath) ?? 0) === 1) {
        const hit = namePath.get(link.toPath)
        if (hit) return { fromPath: link.from, ...fromOrdinal, toPath: hit }
      }
      return undefined
    }
    // 路径形式：整串精确命中优先（文本本身含 #数字时整串即路径，不剥后缀）
    if (paths.includes(link.toPath)) return { fromPath: link.from, ...fromOrdinal, toPath: link.toPath }
    const m = ORDINAL_RE.exec(link.toPath)
    if (m === null || !paths.includes(m[1]!)) return undefined
    // 剥 #n：序号钳位到 [1, 孪生数]（#0 归一 1、越界取最近合法位），>1 才带字段
    const twins = pathCount.get(m[1]!)!
    const ordinal = Math.min(Math.max(Number(m[2]), 1), twins)
    return {
      fromPath: link.from,
      ...fromOrdinal,
      toPath: m[1]!,
      ...(ordinal > 1 ? { toOrdinal: ordinal } : {}),
    }
  }
  const out: ResolvedLink[] = []
  for (const link of links) {
    const resolved = resolveOne(link)
    if (resolved !== undefined) out.push(resolved)
  }
  return out
}

/** 便捷组合（公共工具，当前无内部调用方——M5d Task 2 起编辑器改走 linkRegistry 注册表；
 *  resolveLinks 本体仍被 registryToLinks 复用） */
export function resolveAllLinks(tree: ZenNode): ResolvedLink[] {
  return resolveLinks(tree, parseLinks(tree))
}
