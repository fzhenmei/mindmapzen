// src/services/copyFilter.ts —— 复制行为后处理（M5b Task 4）：纯函数，无 React/引擎依赖。
// 2026-09 正文 Task 7 起含 tree 层剥除（stripTreeBody）——md 字符串后处理之外的新层。
import type { CopySettings } from '../types/files'
import type { ZenNode } from '../types/tree'

/** copyIncludeNote=false：剥掉全部备注引用块行。规范序列化（mdTree.serialize）是唯一产出源，
 *  其中所有 `> ` 行都是节点备注——含列表项缩进形式（深度 ≥7 的嵌套列表引用块缩进进内容列 `  > `）；
 *  行尾换行一并移除（备注紧跟节点行，剥除后不留空行） */
export function stripNoteLines(md: string): string {
  return md.replace(/^[ \t]*> .*\n?/gm, '')
}

/** copyIncludeLinks=false：[[名称]] → 名称（保留名字，剥双方括号）。
 *  空括号 [[]] 与含内层括号的非法形式原样保留（与 links.ts 的 LINK_RE 解析口径一致：
 *  这类非 [[纯名称]] 形态不是双链，不属剥除范围） */
export function stripLinkBrackets(md: string): string {
  // 内层字符类与 links.ts 的 LINK_RE 口径对齐（[^\][] 同时排除 [ 与 ]，线性无回溯）：
  // 非 [[纯名称]] 形态整体不匹配即原样保留，replacer 只需排空括号 [[]]
  return md.replace(/\[\[([^\][]*)\]\]/g, (m, inner: string) => (inner === '' ? m : inner))
}

/** 按复制设置组合后处理（EditorView doCopy 调用，行数护栏友好） */
export function applyCopySettings(md: string, settings: CopySettings): string {
  let out = md
  if (!settings.copyIncludeNote) out = stripNoteLines(out)
  if (!settings.copyIncludeLinks) out = stripLinkBrackets(out)
  return out
}

/** 剥除树内全部正文（2026-09）：tree 层递归删 body，先于 serialize（正文块无行前缀标记，
 *  md 层按行剥不可行——与备注的 stripNoteLines 本质不同）；纯函数不改入参 */
export function stripTreeBody(tree: ZenNode): ZenNode {
  return { ...tree, body: undefined, children: tree.children.map(stripTreeBody) }
}
