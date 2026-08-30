// src/services/iconMarkers.ts —— 节点图标句尾标记（M18 方案 A，与连线 [[..]] 同构）
// 语法：标题行尾 ` ::name`（lucide kebab 名，如 ::flag ::alert-triangle），可多个。
// md 是唯一事实源：AI 可读可写；显示层（画布/预览/大纲）剥离，序列化时注入；
// 图标管理器是主增删通道，手写标记同样合法生效（宽容，与连线手写一致）。
// 名字约束：小写字母/数字/连字符（lucide 全集命名规范）；非法或不在 lucide
// 可用集内的名字宽容丢弃（不静默丢内容——只丢标记本身，文本不受影响）。

/** 标记正则：行尾一个或多个（空白分隔的）::name 段（行尾锚定，句中 :: 不受影响） */
const ICON_MARKER_RE = /(?:\s+::[a-z0-9-]+)+$/

/** 检测文本是否携带图标标记（快速路径，避免无标记文本走拆分） */
export const hasIconMarkers = (text: string): boolean => /::[a-z0-9-]+\s*$/.test(text)

/** 剥离句尾图标标记 → 纯文本（显示层口径） */
export function stripIconMarkers(text: string): string {
  if (!hasIconMarkers(text)) return text
  return text.replace(ICON_MARKER_RE, '')
}

/** 提取句尾图标名数组（保序去重；无标记返回空数组） */
export function extractIconMarkers(text: string): string[] {
  if (!hasIconMarkers(text)) return []
  const m = text.match(ICON_MARKER_RE)
  if (m === null) return []
  const names = m[0]
    .split(/\s+/)
    .filter((s) => s !== '')
    .map((s) => s.slice(2)) // 去 '::'
  return [...new Set(names)]
}

/** 句尾注入图标标记（names 空数组原样返回；与 stripIconMarkers 互逆） */
export function injectIconMarkers(text: string, names: readonly string[]): string {
  if (names.length === 0) return text
  return `${text} ${names.map((n) => `::${n}`).join(' ')}`
}
