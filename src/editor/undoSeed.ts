// src/editor/undoSeed.ts —— 撤销历史栈卫生（v1.1 撤销/重做，想法5）：
// ①基线种子：引擎核心实证不播初始快照（Command 构造 history=[]，唯一补种入口是 setMode('edit')，
// index.js:558，本项目不调用）——不补种子则首条编辑后 activeHistoryIndex 恒为 0，BACK 无法回退
// （back 的 index-step>=0 守卫），即「首条编辑不可撤销」。种子时机在打开净化完成之后
// （MindMapCanvas applyRegistryToEngine 尾部）：基线取净化后的现态（标记已剥离、连线 targets 已落位），
// 首条编辑的撤销落在净化态而非含 [[..]] 标记的构造数据。直写 history 数组而非 originAddHistory：
// 后者必发 data_change（Command.js:127）→ 打开即误置脏（净化不置脏语义，engine-api.md「M5d 核验 (c)」）；
// 直写零事件，禁用态初值本就 false/false，back_forward 未发也无碍。
// ②瞬态键剥离：copyRenderTree（utils/index.js:162-181）除 data/children 外的节点级键全量入快照，
// 含插入命令的瞬态标记 inserting（Render.insertChildNode 写入，首渲时由 MindMapNode.js:674-680 消费
// 并自动开编辑框）。它进历史造成两处实锤污染（v1.1 浏览器实证，engine-api.md「v1.1 核验」）：
// (a) 插入后激活链的 SET_NODE_DATA 触发节流 addHistory，此时 inserting 已被渲染消费、JSON 漂移
//     → 重复入史一条近似快照；(b) BACK 恢复含 inserting 的快照 → 重渲重开编辑框 + 再触发激活命令链
//     → 尾随 addHistory 截断 redo 栈（撤销一次后重做永远少一级）。sanitizeTopHistory 在每次
// back_forward（addHistory 尾随发出）剥除栈顶快照的 inserting：恢复出的快照干净，(a) 的漂移比较
// 变为相等不再入史，(b) 的编辑框重开与截断随之消失。幂等（干净串零成本早退）。具名导出供单测。
import type { MindMapHandle } from '../types/engine'

/** 节点级瞬态键：进历史即污染撤销栈（见文件头 ②），剥离后再入库 */
const TRANSIENT_NODE_KEYS = ['inserting'] as const

/** 递归剥除节点级瞬态键（不动 data/children 内部；返回原引用若无变化） */
function stripTransientKeys(node: Record<string, unknown>): void {
  for (const key of TRANSIENT_NODE_KEYS) delete node[key]
  for (const child of (node.children as Record<string, unknown>[] | undefined) ?? []) {
    stripTransientKeys(child)
  }
}

/** 引擎历史快照 JSON 是否含瞬态键（零成本守卫：JSON.stringify 定形无空格） */
function hasTransient(snapshot: string): boolean {
  return TRANSIENT_NODE_KEYS.some((key) => snapshot.includes(`"${key}":`))
}

/** 打开净化完成后播一条基线快照进撤销栈（幂等：栈非空即跳过，保存链再净化路径不受扰） */
export function seedUndoBaseline(mm: MindMapHandle): void {
  const command = mm.command
  if (!command || command.history.length > 0) return
  // 快照与引擎自身入史同源同构（getData = simpleDeepClone(getCopyData)，含 uid/smmVersion，
  // back() 按 JSON.parse 恢复后可直接作为 renderTree 渲染）；防御性同步剥瞬态键
  const snapshot = JSON.stringify(mm.getData())
  command.history = [hasTransient(snapshot) ? stripped(snapshot) : snapshot]
  command.activeHistoryIndex = 0
}

/** 剥除栈顶快照的瞬态键（back_forward 尾随调用，见文件头 ②；栈空/干净为无害 no-op） */
export function sanitizeTopHistory(mm: MindMapHandle): void {
  const command = mm.command
  if (!command || command.history.length === 0) return
  const i = command.history.length - 1
  const top = command.history[i]!
  if (hasTransient(top)) command.history[i] = stripped(top)
}

/** JSON 快照 → 剥瞬态键 → 回 JSON（仅含瞬态键时走到，开销可忽略：100ms 节流后的入史路径） */
function stripped(snapshot: string): string {
  const tree = JSON.parse(snapshot) as Record<string, unknown>
  stripTransientKeys(tree)
  return JSON.stringify(tree)
}
