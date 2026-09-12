// src/services/statusMarkers.ts —— 节点任务状态句尾标记（看板模式，与 iconMarkers 同构）
// 语法：行尾 ` @todo/@doing/@blocked/@done/@dropped`，五态互斥（多个只认最后一个）。
// 白名单语义：未知 @xxx（如 @foo）不构成标记，原样保留为普通文本——不丢内容、roundtrip 恒等。
// 口径分工：检测/提取只认行尾（写入口径，句中 @xxx 不是状态）；
// 剥离全句生效（显示层口径——@status 可能落在 ::icon 之后、![alt](src) 之前，须剥净）。
export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done' | 'dropped'
export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'blocked', 'done', 'dropped']

const ALT = TASK_STATUSES.join('|')
/** 检测/提取用：行尾锚定（@status 位于句尾，句中 @ 不受影响） */
const STATUS_MARKER_TAIL_RE = new RegExp(String.raw`@(?:${ALT})\s*$`)
/** 剥离用：单个 @status（前置空白随标记一并剥除）；单量词 + /g 全局替换，不用嵌套量词（Sonar S8786） */
const STATUS_MARKER_RE = new RegExp(String.raw`\s+@(?:${ALT})`, 'g')

/** 检测文本行尾是否携带状态标记（快速路径） */
export const hasStatusMarkers = (text: string): boolean => STATUS_MARKER_TAIL_RE.test(text)

/** 剥离状态标记 → 纯文本（显示层口径；未知 @xxx 不在白名单内，原样保留） */
export function stripStatusMarkers(text: string): string {
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
