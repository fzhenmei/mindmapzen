// src/services/copyFilter.ts —— 复制行为后处理（M5b Task 4）：纯函数，无 React/引擎依赖。
// 2026-09 正文起树层剥除（stripTreeBody）先于 serialize（正文块无统一的行前缀标记——
// 引用块/代码块前缀形态各异，md 层按行剥不可行）；md 字符串层只剩双链括号剥除。
// 2026-09-06 备注合并后 ZenNode.note 退役、引用块已是正文合法块类型，旧 stripTreeNote
// 与 copyIncludeNote 设置键整链拆除——「剥正文」单开关管全部正文。
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

/** 按复制设置组合后处理（EditorView doCopy 调用，行数护栏友好）；正文剥除
 *  已上移树层（stripTreeBody，先于 serialize），此处仅剩双链括号 */
export function applyCopySettings(md: string, settings: CopySettings): string {
  return settings.copyIncludeLinks ? md : stripLinkBrackets(md)
}

/** 剥除树内全部正文（2026-09）：tree 层递归删 body，先于 serialize（正文块无统一的行前缀
 *  标记——引用块/代码块前缀形态各异，md 层按行剥不可行）；纯函数不改入参 */
export function stripTreeBody(tree: ZenNode): ZenNode {
  return { ...tree, body: undefined, children: tree.children.map(stripTreeBody) }
}

/** 剥除树内全部图标与看板状态（2026-09 粘 AI 防干扰）：tree 层递归删 icons/status，先于
 *  serialize（字段剥除即无行尾 ::icon/@status 注入，md 层零正则）；标签/正文/插图/uid 不动
 *  ——标签带语义分类（AI 可借它理解结构），正文与插图是内容，uid 是连线注册表键。纯函数不改入参 */
export function stripTreeIconStatus(tree: ZenNode): ZenNode {
  return { ...tree, icons: undefined, status: undefined, children: tree.children.map(stripTreeIconStatus) }
}
