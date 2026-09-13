// src/services/statusMarkers.ts —— 节点任务状态句尾标记（看板模式，与 iconMarkers 同构）
// 语法：行尾 ` @todo/@doing/@blocked/@done/@dropped/@archived`，六态互斥（多个只认最后一个）。
// 前置锚定 `(?:^|\s+)`：空白后与句首裸 '@doing' 均成标记——空文本节点的序列化产物
// `#  @doing`（emitHeading 双空格）经标题前缀剥除后恰是裸形态，extract/strip 锚定必须
// 严格一致否则 roundtrip 破裂（Important-1 反例）；紧贴词字符的 @（如 x@doing）不构成标记。
// 白名单语义：未知 @xxx（@foo）不构成标记，原样保留为普通文本——不丢内容、roundtrip 恒等。
// strip 仅认行尾标记（句中 @ 是普通文本，剥了就是丢内容）；剥除顺序见 mdTree.makeNode。
// 实现：单段正则（前置锚定 + @六态词 + 行尾锚定）从尾循环剥除，全式仅一个量词、线性无回溯
// （Sonar S8786 口径，与 tagMarkers 同款模式）。
export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done' | 'dropped' | 'archived'
export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'blocked', 'done', 'dropped', 'archived']
/** 看板四列（2026-09-13 GTD 审视）：archived/dropped 不进常规列循环——归档是默认收起的
 *  历史列（看板治理 spec §2.3），放弃 = 已决策不做、彻底离开行动视野（GTD Trash：无列、
 *  无收起条、过滤也不召回）；两态的看板入口都在卡片改状态子菜单（循环 TASK_STATUSES
 *  自动含），放弃的恢复走导图状态选择器 */
export const BOARD_STATUSES: readonly TaskStatus[] = TASK_STATUSES.filter((s) => s !== 'archived' && s !== 'dropped')

const ALT = TASK_STATUSES.join('|')
/** 行尾单段标记：前置锚定 `(?:^|\s+)` + @ + 六态词 + 行尾锚定；全式仅一个量词（\s+），线性无回溯。
 *  检测/剥离/提取共用同一单段正则（$ 锚定行尾段）：检测 = test；剥离 = 循环剥行尾段；
 *  提取 = exec 取行尾段（多段只认最后一个）——三者锚定严格一致，防「extract 认得而 strip 剥不掉」 */
const STATUS_SEGMENT_RE = new RegExp(String.raw`(?:^|\s+)@(?:${ALT})$`)

/** 检测文本行尾是否携带状态标记（快速路径） */
export const hasStatusMarkers = (text: string): boolean => STATUS_SEGMENT_RE.test(text)

/** 剥离行尾状态标记 → 纯文本（显示层口径；未知 @xxx 原样保留；裸形态剥成空串） */
export function stripStatusMarkers(text: string): string {
  let out = text
  while (true) {
    const m = STATUS_SEGMENT_RE.exec(out)
    if (m === null) return out
    out = out.slice(0, out.length - m[0].length)
  }
}

/** 提取行尾状态（互斥：多个只认最后一个；无标记返回 null） */
export function extractStatusMarker(text: string): TaskStatus | null {
  const m = STATUS_SEGMENT_RE.exec(text)
  if (m === null) return null
  return m[0].slice(m[0].indexOf('@') + 1) as TaskStatus
}

/** 句尾注入状态标记（null 原样返回；与 stripStatusMarkers 互逆） */
export function injectStatusMarker(text: string, status: TaskStatus | null): string {
  if (status === null) return text
  return `${text} @${status}`
}
