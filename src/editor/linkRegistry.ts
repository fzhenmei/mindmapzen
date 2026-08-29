// src/editor/linkRegistry.ts —— 连线净化会话注册表（M5d Task 2）：纯函数，无引擎/DOM 依赖。
// md 是连线唯一事实源；打开时从标记文本建表（uid → 目标名列表），显示层剥离后连线、
// 序列化注入、画线桥接全部以注册表为数据源（源节点改名/编辑下 uid 稳定，不断链）。
import { stripMarkers, extractTargets } from '../services/linkMarkers'
import { resolveLinks, type MindLink, type ResolvedLink } from '../services/links'
import { engineTreeToZen } from '../services/mdTree'
import type { EngineNode } from '../types/engine'

/** 会话注册表：源节点 uid → 目标名列表（每次打开由 md 重建，无持久化） */
export interface LinkRegistry {
  byUid: Map<string, string[]>
}

/** 遍历引擎树建表：节点 data.uid + extractTargets(data.text)（须在剥离文本**之前**调用）。
 *  传入 into 时并集合并（同目标去重）——保存链收割会话内手写标记时不冲掉桥接已 push 的目标 */
export function buildRegistry(engineRoot: EngineNode, into?: LinkRegistry): LinkRegistry {
  const reg = into ?? { byUid: new Map<string, string[]>() }
  const walk = (node: EngineNode): void => {
    const { uid, text } = node.data
    if (typeof uid === 'string' && typeof text === 'string') {
      const merged = [...(reg.byUid.get(uid) ?? [])]
      for (const target of extractTargets(text)) {
        if (!merged.includes(target)) merged.push(target)
      }
      if (merged.length > 0) reg.byUid.set(uid, merged)
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(engineRoot)
  return reg
}

/** 直写剥离树内全部 [[..]] 标记（data.text 原位改写；data 是引擎活引用时即引擎数据本体，
 *  与 rebuildEngineLinks 同通道——不进命令层，无历史/无 data_change，打开净化不置脏） */
export function stripTreeTexts(engineRoot: EngineNode): void {
  const walk = (node: EngineNode): void => {
    if (typeof node.data?.text === 'string') {
      const stripped = stripMarkers(node.data.text)
      if (stripped !== node.data.text) node.data.text = stripped
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(engineRoot)
}

/** 注册表 → 已解析双链：源端按 uid 取节点全路径，目标端复用 links.resolveLinks 语义
 *  （名称形式唯一命中归一为全路径、零/多命中丢弃；'/' 开头按路径精确命中）。
 *  uid 失联（节点已删）的条目自然消失——标记随节点文本一同消亡，同语义 */
export function registryToLinks(engineRoot: EngineNode, reg: LinkRegistry): ResolvedLink[] {
  const pathByUid = new Map<string, string>()
  const walk = (node: EngineNode, parentPath: string): void => {
    const path = parentPath === '' ? '/' + node.data.text : parentPath + '/' + node.data.text
    if (typeof node.data.uid === 'string') pathByUid.set(node.data.uid, path)
    for (const child of node.children ?? []) walk(child, path)
  }
  walk(engineRoot, '')
  const links: MindLink[] = []
  reg.byUid.forEach((targets, uid) => {
    const from = pathByUid.get(uid)
    if (from !== undefined) for (const toPath of targets) links.push({ from, toPath })
  })
  return resolveLinks(engineTreeToZen(engineRoot).tree, links)
}
