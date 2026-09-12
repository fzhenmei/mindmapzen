// src/types/tree.ts —— 树节点与解析结果公共类型
import type { TaskStatus } from '../services/statusMarkers'

export interface ZenNode {
  text: string
  children: ZenNode[]
  /** 节点图标（M18 方案 A）：lucide kebab 名（md 句尾 ::name 标记 ⇄ 此字段）；
   *  引擎侧经 data.icon（'zen_'+name）承载。parse 提取、序列化注入；空数组不设 */
  icons?: string[]
  /** 节点标签：自由文本（中文/英文等，md 句尾 #标签 标记 ⇄ 此字段，与 ::icon 同构）；
   *  引擎侧经 data.tag 承载（原生彩色小标签渲染，颜色按标签文本稳定生成——同名同色）；
   *  parse 提取、序列化注入；空数组不设 */
  tags?: string[]
  /** 任务状态（看板模式）：五态互斥（md 句尾 @todo/@doing/@blocked/@done/@dropped 标记 ⇄ 此字段，
   *  与 ::icon/#tag 同构）；引擎侧经 data.icon 内部保留名 zen_status-<s>（kebab，引擎
   *  split('_') 协议）承载徽章；
   *  parse 提取、序列化注入；无状态不设字段（= 非任务，不进看板） */
  status?: TaskStatus
  /** 节点插图（M19）：md 行尾 ![alt](src) 标记 ⇄ 此字段；src 相对工作区路径，
   *  画布经引擎 imgMap（src→dataURL）渲染；每节点至多一枚 */
  image?: { src: string; alt: string }
  /** 节点正文(2026-09 写作;2026-09-06 备注合并):原始 md 片段(标题下非结构块:
   *  段落/引用块/代码块/表格等——引用块原样保留含 > 前缀),md 映射为节点行后的原样块;
   *  空串视为无正文;备注 note 字段已退役,引擎侧 data.note 为 body 的同值镜像 */
  body?: string
  /** 引擎节点 uid 透传（M5d Task 2）：仅 engineTreeToZen 方向携带（连线注册表键/序列化注入查表），
   *  parse 永不设置——不进 md，roundtrip 属性测试不受影响 */
  uid?: string
}
export interface IgnoredBlock { type: string; excerpt: string }
export type ParseResult =
  | { ok: true; tree: ZenNode; ignoredBlocks: IgnoredBlock[] }
  | { ok: false; error: string }
