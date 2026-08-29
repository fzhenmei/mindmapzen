// src/services/links.ts —— [[名称]] 双链解析（M5b Task 3）：纯函数，无引擎/DOM 依赖。
// 路径约定与折叠路径一致（mdTree.zenToEngineTree）：根为 '/'+text，子为父路径+'/'+text，字面拼接。
import type { ZenNode } from '../types/tree'

/** 未解析双链：from = 源节点全路径（原样含 [[..]] 标记）；toPath = 括号内原文（名称或 /全/路径） */
export interface MindLink {
  from: string
  toPath: string
}

/** 已解析双链：两端均为树内路径，可直接映射引擎节点实例建线 */
export interface ResolvedLink {
  fromPath: string
  toPath: string
}

const LINK_RE = /\[\[([^\][]+)\]\]/g

/** 扫描所有节点文本中的 [[...]] 标记（一节点多链逐条收集；空括号 [[]] 忽略） */
export function parseLinks(root: ZenNode): MindLink[] {
  const out: MindLink[] = []
  const walk = (node: ZenNode, parentPath: string): void => {
    const path = parentPath === '' ? '/' + node.text : parentPath + '/' + node.text
    for (const m of node.text.matchAll(LINK_RE)) {
      if (m[1] !== '') out.push({ from: path, toPath: m[1] })
    }
    for (const child of node.children) walk(child, path)
  }
  walk(root, '')
  return out
}

/** 宽容解析（spec §4）：名称形式按全树精确同名计数，唯一命中保留（归一为该节点全路径——ResolvedLink
 *  两端均为树内路径，建线端按路径映射引擎实例），零/多命中丢弃；
 *  '/' 开头的全路径形式按路径精确匹配（重复路径亦保留——后写覆盖（最后遍历节点胜出））。 */
export function resolveLinks(tree: ZenNode, links: MindLink[]): ResolvedLink[] {
  const paths: string[] = []
  const nameCount = new Map<string, number>()
  const namePath = new Map<string, string>()
  const walk = (node: ZenNode, parentPath: string): void => {
    const path = parentPath === '' ? '/' + node.text : parentPath + '/' + node.text
    paths.push(path)
    nameCount.set(node.text, (nameCount.get(node.text) ?? 0) + 1)
    namePath.set(node.text, path)
    for (const child of node.children) walk(child, path)
  }
  walk(tree, '')
  const out: ResolvedLink[] = []
  for (const link of links) {
    if (link.toPath.startsWith('/')) {
      if (paths.includes(link.toPath)) out.push({ fromPath: link.from, toPath: link.toPath })
    } else if ((nameCount.get(link.toPath) ?? 0) === 1) {
      const hit = namePath.get(link.toPath)
      if (hit) out.push({ fromPath: link.from, toPath: hit })
    }
  }
  return out
}

/** 便捷组合（公共工具，当前无内部调用方——M5d Task 2 起编辑器改走 linkRegistry 注册表；
 *  resolveLinks 本体仍被 registryToLinks 复用） */
export function resolveAllLinks(tree: ZenNode): ResolvedLink[] {
  return resolveLinks(tree, parseLinks(tree))
}
