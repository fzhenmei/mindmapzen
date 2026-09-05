// src/services/copyFilter.ts —— 复制行为后处理（M5b Task 4）：纯函数，无 React/引擎依赖。
// 2026-09 正文 Task 7 起含 tree 层剥除（stripTreeBody）；终审 C1 后备注也改树层
// （stripTreeNote）——行级正则剥 `> ` 行不感知块语义，正文代码块内 `> ` 行与正文内
// 引用块都会被误伤（默认组合 copyIncludeNote=false + copyIncludeBody=true 即命中）。
// 至此备注/正文剥除全部先于 serialize，md 字符串层只剩双链括号剥除。
import type { CopySettings } from '../types/files'
import type { ZenNode } from '../types/tree'

/** copyIncludeLinks=false：[[名称]] → 名称（保留名字，剥双方括号）。
 *  空括号 [[]] 与含内层括号的非法形式原样保留（与 links.ts 的 LINK_RE 解析口径一致：
 *  这类非 [[纯名称]] 形态不是双链，不属剥除范围） */
export function stripLinkBrackets(md: string): string {
  // 内层字符类与 links.ts 的 LINK_RE 口径对齐（[^\][] 同时排除 [ 与 ]，线性无回溯）：
  // 非 [[纯名称]] 形态整体不匹配即原样保留，replacer 只需排空括号 [[]]
  return md.replace(/\[\[([^\][]*)\]\]/g, (m, inner: string) => (inner === '' ? m : inner))
}

/** 按复制设置组合后处理（EditorView doCopy 调用，行数护栏友好）；备注/正文的剥除
 *  已上移树层（stripTreeNote/stripTreeBody，先于 serialize），此处仅剩双链括号 */
export function applyCopySettings(md: string, settings: CopySettings): string {
  return settings.copyIncludeLinks ? md : stripLinkBrackets(md)
}

/** 剥除树内全部备注（终审 C1）：tree 层递归删 note，先于 serialize——serialize 产出的
 *  `> ` 行只来自 note，剥在树层即不触碰正文内容（代码块内 `> ` 行原样保留）；纯函数不改入参 */
export function stripTreeNote(tree: ZenNode): ZenNode {
  return { ...tree, note: undefined, children: tree.children.map(stripTreeNote) }
}

/** 剥除树内全部正文（2026-09）：tree 层递归删 body，先于 serialize（正文块无行前缀标记，
 *  md 层按行剥不可行——与备注的树层剥除同理）；纯函数不改入参 */
export function stripTreeBody(tree: ZenNode): ZenNode {
  return { ...tree, body: undefined, children: tree.children.map(stripTreeBody) }
}
