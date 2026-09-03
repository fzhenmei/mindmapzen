// src/editor/linkBridge.ts —— 连线注册表桥接（M5d Task 2）：把引擎原生"拖线建链"改写为注册表条目。
// md 是连线唯一事实源；净化会话下画布文本无 [[..]] 标记，桥接不再改写文本——
// reg.byUid[源uid].push(目标名) → 宿主上报数据变化触发保存链（serialize 句尾注入落 md）→ onSaved 按注册表重建。
// 引擎原生 addLine 会直写 associativeLineTargets（落引擎层、绕过 md 事实源），故桥接后返回 true 阻断之。
// 钩子时机：completeCreateLine（AssociativeLine.js:563-575）先问 opt.beforeAssociativeLineConnection(toNode)，
// 返回 true 即跳过 addLine 并 return —— 注意该路径不调 cancelCreateLine，建线态须由桥接自行清理（:571）。
import { registryToLinks, type LinkRegistry } from './linkRegistry'
import type { EngineNode, MindMapHandle } from '../types/engine'

/** 引擎节点实例的最小结构（桥接只读 text/uid） */
interface NodeLike {
  getData(key: string): unknown
}


/** 目标标记统一规则（2026-09-03 同名消歧，spec §4.3，与 harvestRegistry/identityMarker 同语义）：
 *  名称全树唯一 → 裸名（md 简洁、AI 可读）；不唯一 → 全路径（v1.1 消歧）；且为同路径孪生
 *  第 n（n>1）→ 追加 #n（同父同名路径也相同，序号才能精确指认）。桥接手里有精确节点实例
 *  与全树，序号按文档序可算。 */
function disambiguatedTarget(mm: MindMapHandle, toNode: NodeLike, bareName: string): string {
  const plain = mm.getData()
  const toUid = toNode.getData('uid')
  let nameCount = 0
  let targetPath: string | null = null
  let targetOrdinal = 0
  const pathOccurrence = new Map<string, number>()
  const walk = (node: EngineNode, parentPath: string): void => {
    const { uid, text } = node.data
    const path = parentPath === '' ? '/' + String(text) : parentPath + '/' + String(text)
    if (text === bareName) nameCount += 1
    const ordinal = (pathOccurrence.get(path) ?? 0) + 1
    pathOccurrence.set(path, ordinal)
    if (toUid !== undefined && uid === toUid) {
      targetPath = path
      targetOrdinal = ordinal
    }
    for (const child of node.children ?? []) walk(child, path)
  }
  if (!plain) return bareName
  walk(plain, '')
  if (nameCount <= 1 || targetPath === null) return bareName
  return targetOrdinal > 1 ? `${targetPath}#${targetOrdinal}` : targetPath
}

/** 桥接钩子（构造 opt 传入，complete 时机调用）：注册表 push → 立即按注册表重建 → 上报触发保存链。
 *  显示文本全程不动（净化语义）；任何分支都返回 true（连线数据永不落引擎层）——
 *  无源（异常态）例外放行：addLine 对空源 no-op 且引擎自清建线态。目标名不唯一时入表
 *  统一消歧标记（路径/#n，spec §4.3）——重开重建按序号精确落位。 */
export function bridgeLinkToRegistry(
  mm: MindMapHandle,
  registry: LinkRegistry,
  toNode: unknown,
  onDataChanged?: () => void,
): boolean {
  const al = mm.associativeLine
  const fromNode = al?.creatingStartNode as NodeLike | null | undefined
  if (!al || !fromNode) return false
  const toText = (toNode as NodeLike | null | undefined)?.getData('text')
  const uid = fromNode.getData('uid')
  if (typeof toText === 'string' && toText !== '' && typeof uid === 'string') {
    const list = registry.byUid.get(uid) ?? []
    const marker = disambiguatedTarget(mm, toNode as NodeLike, toText)
    if (!list.includes(marker)) list.push(marker)
    registry.byUid.set(uid, list)
    // 立即按注册表重建：线马上可见（保存链 onSaved 也会再重建，幂等）
    const plain = mm.getData()
    if (plain) mm.rebuildLinks?.(registryToLinks(plain, registry))
    // 注册表即事实源变化：上报宿主置脏，走保存链把句尾标记落 md
    onDataChanged?.()
  }
  // 引擎 stop 路径同样跳过悬停目标去激活（:572-574）：桥接自理——否则目标节点高亮残留；
  // 且残留激活会让随后「点击连线」的 CLEAR_ACTIVE_NODE 触发 SET_NODE_DATA → 节流 data_change
  // （~100ms）→ renderAllLines 清掉 activeLine，紧接的 Del 删线失效（v0.7.0 删线验收实案）。
  // 须在 cancelCreateLine 前读取（cancel 会置空 overlapNode）
  const overlap = al.overlapNode as NodeLike | null | undefined
  if (overlap?.getData('isActive') === true) mm.execCommand('SET_NODE_ACTIVE', overlap, false)
  // 引擎 stop 路径不清建线态（AssociativeLine.js:571 return 前无 cancel）：自清，否则后续节点点击被误续线
  al.cancelCreateLine()
  // 目标无名/源无 uid 时不入表但同样阻断引擎 addLine（不落无文本支撑的线）并自清
  return true
}
