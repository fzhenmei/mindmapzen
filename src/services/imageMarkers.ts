// src/services/imageMarkers.ts —— 节点插图行尾标记（M19，md 原生图片语法零发明）
// 语法：标题行尾 ![alt](src)（src 相对工作区路径，如 assets/配图.png）；每节点至多一枚
//（多枚取首，其余宽容保留在文本？——不，行尾全剥、取首枚；与 ::icon 同构的净化管线：
// parse 提取进 ZenNode.image（文本剥离）、序列化句尾注入、显示层（画布/预览文本）剥离。
// 详情态 MarkdownPreview 原生渲染 img（图片是内容本体，预览保留）。

/** 行尾图片标记（md 标准 `![alt](src)` 形态；alt 可空 `![](src)`） */
const IMAGE_MARKER_RE = /\s!\[[^\]\n]*\]\([^)\n]+\)$/

export interface NodeImage {
  /** 相对工作区路径（md 事实源中的键；画布渲染时经 imgMap 解析为 dataURL） */
  src: string
  alt: string
}

/** 检测行尾图片标记（快速路径） */
export const hasImageMarker = (text: string): boolean => /!\[[^\]\n]*\]\([^)\n]+\)\s*$/.test(text)

/** 剥离行尾图片标记 → 纯文本（显示层口径） */
export function stripImageMarker(text: string): string {
  if (!hasImageMarker(text)) return text
  return text.replace(IMAGE_MARKER_RE, '')
}

/** 提取行尾图片标记（无/非法返回 null） */
export function extractImageMarker(text: string): NodeImage | null {
  if (!hasImageMarker(text)) return null
  const m = text.match(/!\[([^\]\n]*)\]\(([^)\n]+)\)\s*$/)
  if (m === null) return null
  return { alt: m[1] ?? '', src: m[2] ?? '' }
}

/** 句尾注入图片标记（img null 原样返回；与 stripImageMarker 互逆） */
export function injectImageMarker(text: string, img: NodeImage | null): string {
  if (img === null) return text
  return `${text} ![${img.alt}](${img.src})`
}
