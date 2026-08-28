// src/types/tree.ts —— 树节点与解析结果公共类型
export interface ZenNode { text: string; children: ZenNode[] }
export interface IgnoredBlock { type: string; excerpt: string }
export type ParseResult =
  | { ok: true; tree: ZenNode; ignoredBlocks: IgnoredBlock[] }
  | { ok: false; error: string }
