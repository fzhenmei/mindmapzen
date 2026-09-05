// src/types/tree.ts —— 树节点与解析结果公共类型
export interface ZenNode {
  text: string
  children: ZenNode[]
  /** 节点备注（M5b）：纯文本可多行；md 映射为节点行后的引用块；空串视为无备注 */
  note?: string
  /** 节点图标（M18 方案 A）：lucide kebab 名（md 句尾 ::name 标记 ⇄ 此字段）；
   *  引擎侧经 data.icon（'zen_'+name）承载。parse 提取、序列化注入；空数组不设 */
  icons?: string[]
  /** 节点插图（M19）：md 行尾 ![alt](src) 标记 ⇄ 此字段；src 相对工作区路径，
   *  画布经引擎 imgMap（src→dataURL）渲染；每节点至多一枚 */
  image?: { src: string; alt: string }
  /** 节点正文(2026-09 写作):原始 md 片段(标题下非结构块:段落/代码/表格等),
   *  md 映射为节点行与备注之间的原样块;空串视为无正文 */
  body?: string
  /** 引擎节点 uid 透传（M5d Task 2）：仅 engineTreeToZen 方向携带（连线注册表键/序列化注入查表），
   *  parse 永不设置——不进 md，roundtrip 属性测试不受影响 */
  uid?: string
}
export interface IgnoredBlock { type: string; excerpt: string }
export type ParseResult =
  | { ok: true; tree: ZenNode; ignoredBlocks: IgnoredBlock[] }
  | { ok: false; error: string }
