// src/services/statusMarkers.ts —— 节点任务状态句尾标记（看板模式，与 iconMarkers 同构）
// 语法：行尾 ` @todo/@doing/@blocked/@done/@dropped`，五态互斥（多个只认最后一个）。
// 白名单语义：未知 @xxx（如 @foo）不构成标记，原样保留为普通文本——不丢内容、roundtrip 恒等。
// strip 仅认行尾标记（句中 @ 是普通文本，剥了就是丢内容）；与 image/icon/tag 的剥除顺序见 mdTree.makeNode。
export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done' | 'dropped'
export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'blocked', 'done', 'dropped']

const ALT = TASK_STATUSES.join('|')
/** 行尾标记正则：一个或多个（空白分隔的）@status 段（行尾锚定，句中 @ 不受影响） */
const STATUS_MARKER_RE = new RegExp(String.raw`(?:\s+@(?:${ALT}))+$`)
/** 检测/提取用：行尾锚定（@status 位于句尾，句中 @ 不受影响） */
const STATUS_MARKER_TAIL_RE = new RegExp(String.raw`@(?:${ALT})\s*$`)

/** 检测文本行尾是否携带状态标记（快速路径） */
export const hasStatusMarkers = (text: string): boolean => STATUS_MARKER_TAIL_RE.test(text)

/** 剥离行尾状态标记 → 纯文本（显示层口径；未知 @xxx 不在白名单内，原样保留） */
export function stripStatusMarkers(text: string): string {
  if (!hasStatusMarkers(text)) return text
  return text.replace(STATUS_MARKER_RE, '')
}

/** 提取行尾状态（互斥：多个只认最后一个；无标记或不在白名单返回 null） */
export function extractStatusMarker(text: string): TaskStatus | null {
  if (!hasStatusMarkers(text)) return null
  const m = /@([a-z]+)\s*$/.exec(text)
  if (m === null || !TASK_STATUSES.includes(m[1] as TaskStatus)) return null
  return m[1] as TaskStatus
}

/** 句尾注入状态标记（null 原样返回；与 stripStatusMarkers 互逆） */
export function injectStatusMarker(text: string, status: TaskStatus | null): string {
  if (status === null) return text
  return `${text} @${status}`
}
