import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { stripMarkers } from './linkMarkers'
import { stripIconMarkers } from './iconMarkers'
import { stripTagMarkers } from './tagMarkers'
import { stripImageMarker } from './imageMarkers'

/** 预览大纲条目：id = 'zen-h-' + 文档序号——MarkdownPreview 渲染后按本列表注入正文
 *  锚点（injectHeadingAnchors）；depth 1-6；text 为显示口径纯文本 */
export interface OutlineHeading {
  id: string
  depth: number
  text: string
}

interface MPosition {
  start: { line: number }
}
interface MNode {
  type: string
  depth?: number
  children?: MNode[]
  position?: MPosition
}

/** md → 预览大纲标题列表（文档序）。remark 解析（含 setext 下划线式标题）；渲染侧已切
 *  lute，锚点配对由 injectHeadingAnchors 数量守卫保证（解析器分歧保守跳过）；文本剥
 *  行内标记（双链/图标/插图——与画布显示层同口径，md 原文仍是唯一事实源）。
 *  任何输入不抛异常（解析失败回退空大纲） */
export function mdOutline(md: string): OutlineHeading[] {
  let ast: MNode
  try {
    ast = unified().use(remarkParse).parse(md) as unknown as MNode
  } catch {
    return []
  }
  const lines = md.split('\n')
  const out: OutlineHeading[] = []
  for (const block of ast.children ?? []) {
    if (block.type !== 'heading') continue
    // setext 标题源码行无 # 前缀，剥前缀 replace 对其无副作用
    const raw = lines[(block.position?.start.line ?? 1) - 1] ?? ''
    const text = stripTagMarkers(stripIconMarkers(stripMarkers(stripImageMarker(raw.trimEnd()))))
      .replace(/^#{1,6}\s*/, '')
      .trim()
    out.push({ id: `zen-h-${out.length}`, depth: block.depth ?? 1, text })
  }
  return out
}
