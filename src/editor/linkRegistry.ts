// src/editor/linkRegistry.ts —— 连线净化会话注册表（M5d Task 2）：纯函数，无引擎/DOM 依赖。
// md 是连线唯一事实源；打开时从标记文本建表（uid → 目标标记列表），显示层剥离后连线、
// 序列化注入、画线桥接全部以注册表为数据源（源节点改名/编辑下 uid 稳定，不断链）。
// 2026-09-03 同名消歧：目标标记统一"名称唯一→裸名，否则路径（孪生 n>1 缀 #n）"，源端带孪生序号。
// v0.7.0 验收修复（删线复活）：保存链改以**引擎现态**收割建表（harvestRegistry，替换语义）——
// 引擎 Del（removeLine 修剪 data.associativeLineTargets → data_change 置脏）后的保存不再把
// 陈旧条目注回 md，线删了就不再回来（md 无标记 → 重开重建无线）。
import { stripMarkers, extractTargets } from '../services/linkMarkers'
import { resolveLinks, type MindLink, type ResolvedLink } from '../services/links'
import { engineTreeToZen } from '../services/mdTree'
import type { EngineNode } from '../types/engine'

/** 会话注册表：源节点 uid → 目标标记列表（统一消歧标记：裸名/路径/#n；每次打开由 md 重建，无持久化） */
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

/** 节点身份（harvestRegistry 的目标标记产出用）：名称 / 全路径 / 同路径孪生序号（文档序 1 起） */
interface NodeIdentity {
  name: string
  path: string
  ordinal: number
}

/** 遍历建 uid→身份索引与名称计数（identityMarker 的唯一性判定用） */
function collectIdentities(engineRoot: EngineNode): {
  byUid: Map<string, NodeIdentity>
  nameCount: Map<string, number>
} {
  const byUid = new Map<string, NodeIdentity>()
  const nameCount = new Map<string, number>()
  const pathOccurrence = new Map<string, number>()
  const walk = (node: EngineNode, parentPath: string): void => {
    const { uid, text } = node.data
    const path = parentPath === '' ? '/' + String(text) : parentPath + '/' + String(text)
    if (typeof text === 'string') nameCount.set(text, (nameCount.get(text) ?? 0) + 1)
    const ordinal = (pathOccurrence.get(path) ?? 0) + 1
    pathOccurrence.set(path, ordinal)
    if (typeof uid === 'string' && typeof text === 'string') byUid.set(uid, { name: text, path, ordinal })
    for (const child of node.children ?? []) walk(child, path)
  }
  walk(engineRoot, '')
  return { byUid, nameCount }
}

/** 收割标记统一规则（2026-09-03 spec §4.2）：名称全树唯一 → 裸名（md 简洁、AI 友好）；
 *  否则全路径；同路径孪生第 n（n>1）→ 追加 #n（永不产出 #1） */
function identityMarker(id: NodeIdentity, nameCount: ReadonlyMap<string, number>): string {
  if ((nameCount.get(id.name) ?? 0) <= 1) return id.name
  return id.ordinal > 1 ? `${id.path}#${id.ordinal}` : id.path
}

/** 单节点目标收割：引擎 targets 解析标记在前、文本残留 [[..]] 标记在后（去重；
 *  自环与 uid 失联目标丢弃——引擎 UI 与 rebuildEngineLinks 同语义） */
function harvestNodeTargets(
  node: EngineNode,
  ids: { byUid: ReadonlyMap<string, NodeIdentity>; nameCount: ReadonlyMap<string, number> },
): string[] {
  const targets: string[] = []
  const push = (marker: string | undefined): void => {
    if (marker !== undefined && !targets.includes(marker)) targets.push(marker)
  }
  const engineTargets = node.data.associativeLineTargets
  if (Array.isArray(engineTargets)) {
    for (const t of engineTargets) {
      if (typeof t === 'string' && t !== node.data.uid) {
        const id = ids.byUid.get(t)
        if (id) push(identityMarker(id, ids.nameCount))
      }
    }
  }
  if (typeof node.data.text === 'string') for (const m of extractTargets(node.data.text)) push(m)
  return targets
}

/** 按引擎树**当前状态**重建注册表（v0.7.0 验收修复）：data.associativeLineTargets
 *  （引擎 removeLine / rebuildEngineLinks 的写入口）经 uid→节点身份映射产出统一消歧标记（裸名/路径/#n）；
 *  显示文本中残留的 [[..]] 标记（会话内手写/粘贴，下次净化前仍在）一并收割去重。
 *  **替换而非并集**：旧表条目（已删线、已删目标）不得残留——删线复活正源于并集收割把
 *  陈旧条目带回 md（序列化注入）→ 重开重建 → 线复活。目标 uid 失联（节点已删）自然丢弃；
 *  targets 删尽（removeLine 留空数组）不建条目 */
export function harvestRegistry(engineRoot: EngineNode, reg: LinkRegistry): LinkRegistry {
  const ids = collectIdentities(engineRoot)
  reg.byUid.clear() // 替换语义：以引擎现态为权威，不与旧条目并集
  const walk = (node: EngineNode): void => {
    const { uid } = node.data
    if (typeof uid === 'string') {
      const targets = harvestNodeTargets(node, ids)
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

/** 注册表 → 已解析双链：源端按 uid 取节点全路径 + 同路径孪生序号（孪生源靠序号区分，
 *  2026-09-03 断点②源端修复），目标端复用 links.resolveLinks 语义（名称唯一归一全路径、
 *  零/多命中丢弃；'/' 开头整串优先 + #n 孪生序号）。uid 失联（节点已删）的条目自然
 *  消失——标记随节点文本一同消亡，同语义 */
export function registryToLinks(engineRoot: EngineNode, reg: LinkRegistry): ResolvedLink[] {
  const pathByUid = new Map<string, string>()
  const ordinalByUid = new Map<string, number>()
  const pathOccurrence = new Map<string, number>()
  const walk = (node: EngineNode, parentPath: string): void => {
    const path = parentPath === '' ? '/' + node.data.text : parentPath + '/' + node.data.text
    const ordinal = (pathOccurrence.get(path) ?? 0) + 1
    pathOccurrence.set(path, ordinal)
    if (typeof node.data.uid === 'string') {
      pathByUid.set(node.data.uid, path)
      ordinalByUid.set(node.data.uid, ordinal)
    }
    for (const child of node.children ?? []) walk(child, path)
  }
  walk(engineRoot, '')
  const links: MindLink[] = []
  reg.byUid.forEach((targets, uid) => {
    const from = pathByUid.get(uid)
    if (from !== undefined) {
      const fromOrdinal = ordinalByUid.get(uid)!
      for (const toPath of targets)
        links.push({ from, ...(fromOrdinal > 1 ? { fromOrdinal } : {}), toPath })
    }
  })
  return resolveLinks(engineTreeToZen(engineRoot).tree, links)
}
