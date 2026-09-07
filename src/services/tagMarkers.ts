// src/services/tagMarkers.ts —— 节点标签句尾标记（与 ::icon / [[..]] 同构）
// 语法：标题行尾 ` #标签`（空格分隔可多个，如 #采购 #urgent），标签词 = 中文/字母/
// 数字/下划线/连字符（白名单）；全符号词（如 #$）与带标点词（如 #采购!）不构成标记
// （# 是高频单字符，白名单收窄"正文被劫持为标签"的面——命中白名单即 Obsidian/GitHub
// 的行内 #tag 手势语义）。md 是唯一事实源：AI 可读可写；显示层（画布 tag 渲染/预览/
// 大纲）剥离，序列化时注入；标签选择器是主增删通道，手写标记同样合法生效。
// 非法形态整体放弃（不静默丢内容——不确定的文本原样保留，只认完整锚定行尾的标记段）。
// 实现：单段正则（单空白+#标签词+行尾锚定）从尾循环剥除，全式仅一个量词、线性无回溯；
// 输入恒为单行文本（mdTree assertNoNewline 拦截换行、sourceLine trimEnd 剥尾空白），
// 手写多空格分隔时靠再次保存的 trimEnd 收敛（宽容丢无意义空白）。

/** 行尾单段标记：单空白 + # + 标签词（白名单：字母/数字（含中文）/下划线/连字符） */
const TAG_SEGMENT_RE = /[ \t]#[\p{L}\p{N}_-]+$/u

/** 检测文本是否携带标签标记（快速路径，避免无标记文本走拆分；与主正则同宽） */
export const hasTagMarkers = (text: string): boolean => TAG_SEGMENT_RE.test(text)

/** 剥离句尾标签标记 → 纯文本（显示层口径；保留标记前原文含内部空白） */
export function stripTagMarkers(text: string): string {
  let out = text
  while (true) {
    const m = TAG_SEGMENT_RE.exec(out)
    if (m === null) return out
    out = out.slice(0, out.length - m[0].length)
  }
}

/** 提取句尾标签名数组（保序去重；无标记返回空数组） */
export function extractTagMarkers(text: string): string[] {
  const names: string[] = []
  let rest = text
  while (true) {
    const m = TAG_SEGMENT_RE.exec(rest)
    if (m === null) break
    names.unshift(m[0].slice(m[0].indexOf('#') + 1))
    rest = rest.slice(0, rest.length - m[0].length)
  }
  return [...new Set(names)]
}

/** 句尾注入标签标记（names 空数组原样返回；与 stripTagMarkers 互逆） */
export function injectTagMarkers(text: string, names: readonly string[]): string {
  if (names.length === 0) return text
  const marks = names.map((n) => '#' + n).join(' ')
  return text + ' ' + marks
}
