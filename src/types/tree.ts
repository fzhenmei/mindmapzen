// src/types/tree.ts —— 树节点与解析结果公共类型
export interface ZenNode {
  text: string
  children: ZenNode[]
  /** 节点备注（M5b）：纯文本可多行；md 映射为节点行后的引用块；空串视为无备注 */
  note?: string
}
export interface IgnoredBlock { type: string; excerpt: string }
export type ParseResult =
  | { ok: true; tree: ZenNode; ignoredBlocks: IgnoredBlock[] }
  | { ok: false; error: string }
