// src/services/linkMarkers.ts —— 连线标记纯函数（M5d Task 1）：[[名称]] 标记的剥离/注入/提取。
// 纯函数，无依赖；正则口径与 links.ts 的 LINK_RE 一致（[^\][] 排除内层括号、空括号 [[]] 非双链）。

/** 标记正则（与 links.ts LINK_RE 同口径：[[非空且不含内层方括号]]） */
const MARKER_RE = /\[\[([^\][]+)\]\]/g

/** 删除全部 [[..]] 片段并收敛空格：'见 [[A]] 和 [[B]]' → '见 和'；
 *  句尾标记剥后不留尾空格；标记删除遗留的双空格收敛为单空格，首尾整体 trim；
 *  非双链口径文本（[[]]、内层含括号）原样保留 */
export function stripMarkers(text: string): string {
  return text
    .replace(/\[\[[^\][]+\]\]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/** 句尾依次追加 ' [[名]]'（字面拼接语义：空文本产出 ' [[名]]'，不 trim）；targets 空返回原样 */
export function injectMarkers(text: string, targets: readonly string[]): string {
  let out = text
  for (const target of targets) out += ` [[${target}]]`
  return out
}

/** 提取全部标记内目标名（与 links.parseLinks 同口径；不去重，去重归注册表/注入层） */
export function extractTargets(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(MARKER_RE)) {
    if (m[1] !== '') out.push(m[1])
  }
  return out
}
