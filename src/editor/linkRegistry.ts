// src/editor/linkRegistry.ts —— 连线净化会话注册表（M5d Task 2）：纯函数，无引擎/DOM 依赖。
// md 是连线唯一事实源；打开时从标记文本建表（uid → 目标名列表），显示层剥离后连线、
// 序列化注入、画线桥接全部以注册表为数据源（源节点改名/编辑下 uid 稳定，不断链）。
// v0.7.0 验收修复（删线复活）：保存链改以**引擎现态**收割建表（harvestRegistry，替换语义）——
// 引擎 Del（removeLine 修剪 data.associativeLineTargets → data_change 置脏）后的保存不再把
// 陈旧条目注回 md，线删了就不再回来（md 无标记 → 重开重建无线）。
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

/** uid→节点名索引（harvestRegistry 的目标解析用，路径与 registryToLinks 同构） */
function collectNames(engineRoot: EngineNode): Map<string, string> {
  const names = new Map<string, string>()
  const walk = (node: EngineNode): void => {
    const { uid, text } = node.data
    if (typeof uid === 'string' && typeof text === 'string') names.set(uid, text)
    for (const child of node.children ?? []) walk(child)
  }
  walk(engineRoot)
  return names
}

/** 单节点目标收割：引擎 targets 解析名在前、文本残留 [[..]] 标记在后（去重；
 *  自环与 uid 失联目标丢弃——引擎 UI 与 rebuildEngineLinks 同语义） */
function harvestNodeTargets(node: EngineNode, nameByUid: ReadonlyMap<string, string>): string[] {
  const targets: string[] = []
  const push = (name: string | undefined): void => {
    if (name !== undefined && !targets.includes(name)) targets.push(name)
  }
  const engineTargets = node.data.associativeLineTargets
  if (Array.isArray(engineTargets)) {
    for (const t of engineTargets) {
      if (typeof t === 'string' && t !== node.data.uid) push(nameByUid.get(t))
    }
  }
  if (typeof node.data.text === 'string') for (const m of extractTargets(node.data.text)) push(m)
  return targets
}

/** 按引擎树**当前状态**重建注册表（v0.7.0 验收修复）：data.associativeLineTargets
 *  （引擎 removeLine / rebuildEngineLinks 的写入口）经 uid→节点名映射归为目标名；
 *  显示文本中残留的 [[..]] 标记（会话内手写/粘贴，下次净化前仍在）一并收割去重。
 *  **替换而非并集**：旧表条目（已删线、已删目标）不得残留——删线复活正源于并集收割把
 *  陈旧条目带回 md（序列化注入）→ 重开重建 → 线复活。目标 uid 失联（节点已删）自然丢弃；
 *  targets 删尽（removeLine 留空数组）不建条目 */
export function harvestRegistry(engineRoot: EngineNode, reg: LinkRegistry): LinkRegistry {
  const nameByUid = collectNames(engineRoot)
  reg.byUid.clear() // 替换语义：以引擎现态为权威，不与旧条目并集
  const walk = (node: EngineNode): void => {
    const { uid } = node.data
    if (typeof uid === 'string') {
      const targets = harvestNodeTargets(node, nameByUid)
      if (targets.length > 0) reg.byUid.set(uid, targets)
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
