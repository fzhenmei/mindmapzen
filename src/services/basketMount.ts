// src/services/basketMount.ts —— 挂载管线（spec §4.5）：文本路径寻址 + 文件层读改写。
// 目标图未打开（整理浮层打开时当前图恒为篮子图），文件层写入无内存态冲突；
// 寻址一律 path 父链文本 + text（md 不序列化 uid）。先写目标图、成功后才由调用方删篮子条目
import type { FsAdapter } from '../types/files'
import { serialize } from './mdTree'
import { readMapTree, type BasketIdea } from './basket'
import type { ZenNode } from '../types/tree'

/** 挂载目标（文本寻址器）：path = 根→父的文本链（**含根文本**，末项 = 目标的父），
 *  text = 目标节点文本。与 T7 目标选择器的产出同构（picker 的 flatten 以 [tree.text] 起链）；
 *  寻址即落点 —— 目标节点就是挂载后新节点的父（撤销按同一寻址删其子）。
 *  末项即目标自身的冗余形态亦接受，见 findZenNodeByPathText */
export interface MountTarget {
  mapPath: string
  path: string[]
  text: string
}

export type MountFailReason = 'targetNotFound' | 'mapMissing' | 'depthTooDeep' | 'writeFailed'

export type MountResult = { ok: true } | { ok: false; reason: MountFailReason; detail?: string }

/** 深度 ≥7 为列表层（serialize 的 assertNoBodyInList 拒绝正文） */
const LIST_LAYER_DEPTH = 7

/** 沿 path 逐级收窄到链尾（depth 为待匹配的 path 下标）：同名兄弟命中失败时回溯试下一个
 *  （与 statusOps.findUidByPathText 的回溯口径一致，同名歧义由 path 前缀收窄） */
function findChainTail(node: ZenNode, path: readonly string[], depth: number): ZenNode | null {
  if (depth >= path.length) return node
  for (const c of node.children) {
    if (c.text !== path[depth]) continue
    const hit = findChainTail(c, path, depth + 1)
    if (hit !== null) return hit
  }
  return null
}

/** 文本寻址：path 链首必须是根文本（空链 / 链首不符即未命中），沿链定位到末项节点后，
 *  在其**子节点**中取首个 text 同名者——目标即链尾的子节点（= 挂载落点的父）。
 *  容错：链末项自身文本即 text 时（path 末项已含目标名的冗余形态）命中该项自身，
 *  两种形态都接受——挂载落点（children 追加/删除处）与寻址结果恒为同一节点 */
export function findZenNodeByPathText(root: ZenNode, path: readonly string[], text: string): ZenNode | null {
  if (path.length === 0 || path[0] !== root.text) return null
  const tail = findChainTail(root, path, 1)
  if (tail === null) return null
  for (const c of tail.children) if (c.text === text) return c
  return tail.text === text ? tail : null
}

/** 节点深度（根 = 1）；target 不在该树内返回 0 */
export function nodeDepth(root: ZenNode, target: ZenNode): number {
  const walk = (node: ZenNode, depth: number): number => {
    if (node === target) return depth
    for (const c of node.children) {
      const d = walk(c, depth + 1)
      if (d > 0) return d
    }
    return 0
  }
  return walk(root, 1)
}

/** 读改写一条龙：读/解析失败归 mapMissing（readMapTree 已 console.error 留线索），
 *  序列化与写盘失败归 writeFailed 并带原始 detail——两者共用 catch 出口，不吞异常。
 *  mutate 就地改 parse 产物再整体 serialize：产物一次性使用，无需不可变
 *  （与 basket.insertIdeaIntoTree 的纯函数场景不同） */
async function readModifyWrite(
  fs: FsAdapter,
  mapPath: string,
  mutate: (tree: ZenNode) => MountResult,
): Promise<MountResult> {
  const tree = await readMapTree(fs, mapPath)
  if (tree === null) return { ok: false, reason: 'mapMissing' }
  const r = mutate(tree)
  if (!r.ok) return r
  try {
    await fs.writeTextFileAtomic(mapPath, serialize(tree))
    return { ok: true }
  } catch (e) {
    // 出口：原因回传调用方（T8 失败行）+ 日志留线索（serialize 拒写的毒节点如多行文本）
    console.error('篮子挂载：目标图写入失败', mapPath, e)
    return { ok: false, reason: 'writeFailed', detail: String(e) }
  }
}

/** 挂载：追加为**最后一个子节点**（归类语义，不打扰现有子节点序，与 AI add_node 一致） */
export async function mountIdea(fs: FsAdapter, target: MountTarget, idea: BasketIdea): Promise<MountResult> {
  return readModifyWrite(fs, target.mapPath, (tree) => {
    const parent = findZenNodeByPathText(tree, target.path, target.text)
    if (parent === null) return { ok: false, reason: 'targetNotFound' }
    // 新节点落在 parent 之下：带正文时校验落点深度（列表层无正文通道，宁可拒绝不静默丢内容）
    if (idea.body !== undefined && nodeDepth(tree, parent) + 1 >= LIST_LAYER_DEPTH) {
      return { ok: false, reason: 'depthTooDeep' }
    }
    parent.children.push({ text: idea.text, children: [], ...(idea.body !== undefined ? { body: idea.body } : {}) })
    return { ok: true }
  })
}

/** 撤销挂载：从父节点**末尾**找 text 匹配删除（挂载恒追加末尾 → 末尾优先命中插入者；
 *  同名兄弟在更后位时不动它）。未命中即 targetNotFound（重复撤销的幂等失败） */
export async function unmountIdea(fs: FsAdapter, target: MountTarget, idea: BasketIdea): Promise<MountResult> {
  return readModifyWrite(fs, target.mapPath, (tree) => {
    const parent = findZenNodeByPathText(tree, target.path, target.text)
    if (parent === null) return { ok: false, reason: 'targetNotFound' }
    for (let i = parent.children.length - 1; i >= 0; i--) {
      if (parent.children[i]!.text === idea.text) {
        parent.children.splice(i, 1)
        return { ok: true }
      }
    }
    return { ok: false, reason: 'targetNotFound' }
  })
}
