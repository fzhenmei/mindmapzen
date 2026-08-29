// src/services/linkMarkers.ts —— 连线标记纯函数（M5d Task 1）：[[名称]] 标记的剥离/注入/提取。
// 纯函数，无依赖；正则口径与 links.ts 的 LINK_RE 一致（[^\][] 排除内层括号、空括号 [[]] 非双链）。

/** 标记正则（与 links.ts LINK_RE 同口径：[[非空且不含内层方括号]]） */
const MARKER_RE = /\[\[([^\][]+)\]\]/g
/** 是否含标记（非全局，仅判定——空格收敛/trim 只允许发生在含标记的文本上） */
const HAS_MARKER_RE = /\[\[[^\][]+\]\]/

/** 删除全部 [[..]] 片段并收敛空格：'见 [[A]] 和 [[B]]' → '见 和'；
 *  句尾标记剥后不留尾空格；**空格收敛只发生在标记删除处**——每段「标记及其紧邻空白」
 *  （相邻多段合并）收敛为至多一个空格（段内全无空白则不补空格），标记之外的原有连续
 *  空格不动，首尾整体 trim；
 *  **无标记文本原样返回**（含连续/首尾空格）——空格收敛是标记删除的善后，
 *  不得成为打开直写改写无标记节点文本的理由；非双链口径文本（[[]]、内层含括号）同原样保留。
 *  （M5c 属性测试②钉死：旧实现全局收敛 ` {2,}`→' ' 会把无标记处的原有连续空格在
 *  「注入-再剥离」链中一并改写——'a  b' 挂线保存重开后被改写成 'a b'，破坏幂等。
 *  实现按标记 split 分段 + 原生 trim 剥边，而非 (?:\s*..\s*)+ 整段正则：后者嵌套量词
 *  触发 S5852/S8786 回溯告警） */
export function stripMarkers(text: string): string {
  if (!HAS_MARKER_RE.test(text)) return text
  // 按标记分段（无捕获组 → 纯非标记片段序列，第 i 个标记夹在片段 i-1 与 i 之间）：
  // 删除标记 = 丢弃分隔位；标记的紧邻空白（前一片段尾随/后一片段前导）一并吞掉并记账，
  // 相邻标记连串（中间片段剥边后为空）整体收敛为至多一个空格——空白处理用原生
  // trimStart/trimEnd 在码内完成（规避 (?:\s*..\s*)+ / \s+$ 形态的 S5852/S8786 回溯告警）
  const parts = text.split(/\[\[[^\][]+\]\]/)
  let out = ''
  let runOpen = false
  let runWs = false
  const closeRun = (): void => {
    if (runOpen) {
      out += runWs ? ' ' : ''
      runOpen = false
      runWs = false
    }
  }
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i]
    if (i < parts.length - 1) {
      const t = p.trimEnd()
      if (t !== p) runWs = true
      p = t
    }
    if (i > 0) {
      const t = p.trimStart()
      if (t !== p) runWs = true
      p = t
      runOpen = true
    }
    if (p !== '') {
      closeRun()
      out += p
    }
  }
  closeRun()
  return out.trim()
}

/** 句尾依次追加 ' [[名]]'；**空文本首枚标记不带前导空格**（'' → '[[名]]'）——
 *  带前导空格会经序列化产出 '#  [[名]]'（标题 # 后双空格），parse 的 ^#{1,6}\s* 规范化
 *  吞掉空格 → 二次开-存 md 漂移，破坏定点（M5c 属性测试③钉死）；targets 空返回原样 */
export function injectMarkers(text: string, targets: readonly string[]): string {
  let out = text
  for (const target of targets) out += (out === '' ? '' : ' ') + `[[${target}]]`
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
