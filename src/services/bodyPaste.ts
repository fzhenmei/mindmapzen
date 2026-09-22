// src/services/bodyPaste.ts —— 粘贴区间标题→加粗纯函数(2026-09-22 正文禁标题):
// 正文不支持标题(md 裸标题行落盘会被 parse 归树炸成子节点),粘贴入口即转 `**文本**`。
// 区间定位 = before/after 公共前缀+后缀夹出的插入中段(只动贴进来的内容,既有内容不碰);
// 围栏代码块内的 # 行是代码不动;插入点落在未闭合围栏内(前缀围栏失衡)整体跳过。
// 围栏口径与 mdTree 同源(```/~~~ 开栏,同字符不短于开栏关栏)。
const ATX_RE = /^ {0,3}#{1,6}[ \t]+(.*)$/
const ATX_EMPTY_RE = /^ {0,3}#{1,6}[ \t]*$/
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/

const closesFence = (line: string, fence: string): boolean =>
  new RegExp(`^ {0,3}\\${fence[0]}{${fence.length},}\\s*$`).test(line)

/** 文本是否终结于未闭合围栏内(插入点在代码块中的判定) */
function endsInsideFence(text: string): boolean {
  let fence: string | null = null
  for (const line of text.split('\n')) {
    if (fence !== null) {
      if (closesFence(line, fence)) fence = null
      continue
    }
    const open = FENCE_OPEN_RE.exec(line)
    if (open !== null) fence = open[1]!
  }
  return fence !== null
}

export interface PastedHeadingsResult {
  next: string
  /** 转换的标题行数(0 = 无需转换,next 恒等 after) */
  converted: number
  /** next 中插入区间终点(光标还原位) */
  caret: number
}

/** 粘贴前值 + 粘贴后值 → 标题行转加粗的新值 */
export function convertPastedHeadings(before: string, after: string): PastedHeadingsResult {
  const maxPrefix = Math.min(before.length, after.length)
  let p = 0
  while (p < maxPrefix && before[p] === after[p]) p++
  const maxSuffix = Math.min(before.length, after.length) - p
  let s = 0
  while (s < maxSuffix && before[before.length - 1 - s] === after[after.length - 1 - s]) s++
  if (endsInsideFence(after.slice(0, p))) return { next: after, converted: 0, caret: after.length - s }
  const middle = after.slice(p, after.length - s)
  if (middle === '') return { next: after, converted: 0, caret: after.length - s }

  const out: string[] = []
  let converted = 0
  let fence: string | null = null
  for (const line of middle.split('\n')) {
    if (fence !== null) {
      out.push(line)
      if (closesFence(line, fence)) fence = null
    } else if (FENCE_OPEN_RE.test(line)) {
      out.push(line)
      fence = FENCE_OPEN_RE.exec(line)![1]!
    } else if (ATX_EMPTY_RE.test(line)) {
      converted++ // 空标题行整行删
    } else if (ATX_RE.test(line)) {
      out.push(`**${ATX_RE.exec(line)![1]!.trim()}**`) // 级别抹平,统一加粗
      converted++
    } else {
      out.push(line)
    }
  }
  if (converted === 0) return { next: after, converted: 0, caret: after.length - s }
  const transformed = out.join('\n')
  return {
    next: after.slice(0, p) + transformed + after.slice(after.length - s),
    converted,
    caret: p + transformed.length,
  }
}
