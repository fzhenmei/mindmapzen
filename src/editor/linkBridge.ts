// src/editor/linkBridge.ts —— 连线文本桥接（验收轮）：把引擎原生"拖线建链"改写为 [[名称]] 文本标记。
// 本项目连线只存在于 md 文本（[[名称]]），引擎线数据是保存/打开时 rebuildEngineLinks 的派生物；
// 引擎原生 addLine 会直写 associativeLineTargets（落引擎层、绕过文本事实源），故桥接后返回 true 阻断之。
// 钩子时机：completeCreateLine（AssociativeLine.js:563-575）先问 opt.beforeAssociativeLineConnection(toNode)，
// 返回 true 即跳过 addLine 并 return —— 注意该路径不调 cancelCreateLine，建线态须由桥接自行清理（:571）。
import { engineTreeToZen } from '../services/mdTree'
import { resolveAllLinks } from '../services/links'
import type { MindMapHandle } from '../types/engine'

/** 引擎节点实例的最小结构（桥接只读 text） */
interface NodeLike {
  getData(key: string): unknown
}

/** 追加 [[目标]] 标记到源文本（纯函数，供单测） */
export function appendLinkMark(fromText: string, toText: string): string {
  return `${fromText} [[${toText}]]`
}

/** 桥接钩子（构造 opt 传入，complete 时机调用）：源文本追加 [[目标文本]] → data_change 置脏 →
 *  自动保存落盘；渲染层立即按文本重建关联线（不等 5s 保存链）。任何分支都返回 true：
 *  连线数据永不落引擎层，文本是唯一事实源。目标名不唯一时 resolveLinks 宽容丢弃
 *  （文本保留，线不显示——与手写 [[..]] 同语义）。 */
export function bridgeLinkToText(mm: MindMapHandle, toNode: unknown): boolean {
  const al = mm.associativeLine
  const fromNode = al?.creatingStartNode as NodeLike | null | undefined
  if (!al || !fromNode) return false // 无源（异常态）：放行引擎路径——addLine 对空源 no-op 且引擎自清建线态
  const toText = (toNode as NodeLike | null | undefined)?.getData('text')
  if (typeof toText === 'string' && toText !== '') {
    const fromText = fromNode.getData('text')
    const text = appendLinkMark(typeof fromText === 'string' ? fromText : '', toText)
    // SET_NODE_DATA 只合并不重渲（M5b 核验 13）：文本变长须重算节点尺寸/重排
    mm.execCommand('SET_NODE_DATA', fromNode, { text })
    mm.renderer?.reRenderNodeCheckChange(fromNode)
    // 立即按文本重建：线马上可见（保存链 onSaved 也会再重建，幂等）
    mm.rebuildLinks?.(resolveAllLinks(engineTreeToZen(mm.getData()).tree))
  }
  // 引擎 stop 路径不清建线态（AssociativeLine.js:571 return 前无 cancel）：自清，否则后续节点点击被误续线
  al.cancelCreateLine()
  return true // 目标无名时不写文本但同样阻断引擎 addLine（不落无文本支撑的线）并自清
}
