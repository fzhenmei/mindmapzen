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


/** 目标名在全树不唯一时改推全路径形式（v1.1 验收 Bug 修复）：裸名多命中会被
 *  registryToLinks 宽容丢弃 → 线永不绘制且无任何反馈（"有时能连有时不能连"的根因）。
 *  桥接手里有精确节点实例，可自动消歧为 spec §4 的 [[/全/路径]] 形式（AI 仍可读）。
 *  同父同名（路径也相同）时全路径取首个命中——线可见地连到同名节点之一，优于静默丢弃。 */
function disambiguatedTarget(mm: MindMapHandle, toNode: NodeLike, bareName: string): string {
  const plain = mm.getData()
  const toUid = toNode.getData('uid')
  let nameCount = 0
  let targetPath: string | null = null
  const walk = (node: EngineNode, parentPath: string): void => {
    const { uid, text } = node.data
    const path = parentPath === '' ? '/' + String(text) : parentPath + '/' + String(text)
    if (text === bareName) nameCount += 1
    if (toUid !== undefined && uid === toUid) targetPath = path
    for (const child of node.children ?? []) walk(child, path)
  }
  if (!plain) return bareName
  walk(plain, '')
  if (nameCount <= 1 || targetPath === null) return bareName
  return targetPath
}

/** 桥接钩子（构造 opt 传入，complete 时机调用）：注册表 push → 立即按注册表重建 → 上报触发保存链。
 *  显示文本全程不动（净化语义）；任何分支都返回 true（连线数据永不落引擎层）——
 *  无源（异常态）例外放行：addLine 对空源 no-op 且引擎自清建线态。目标名不唯一时
 *  registryToLinks 宽容丢弃（注册表保留、线不显示——与手写 [[..]] 同语义）。 */
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
