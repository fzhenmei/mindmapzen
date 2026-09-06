// src/services/xmindImport.ts —— XMind 文件导入（.xmind ZIP → ZenNode 树）
// 格式双轨（宽容探测）：
//   新版（XMind ZEN/2020+）：content.json —— [{ rootTopic: { title, children: { attached: [...] },
//     notes: { plain: { content } }, markers/labels } }]（取首 sheet）
//   旧版（XMind 8-）：content.xml —— xmap-content/sheet/topic 树（title 属性；attached 子题）
// 不进树的成分子（游离主题/连线/标签/标记/概要等）计入 warnings 摘要——复用导入
// 预览的 ignored 通道口径（宽容不静默丢内容，落盘前用户可见）。
import { unzipSync } from 'fflate'
import type { IgnoredBlock, ZenNode } from '../types/tree'

export interface XmindParseResult {
  tree: ZenNode
  /** 未映射内容摘要（导入预览展示；空 = 干净转换） */
  warnings: IgnoredBlock[]
}

/** 解压 + 探测格式 + 解析（主入口） */
export function parseXmind(bytes: Uint8Array): XmindParseResult {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(bytes)
  } catch {
    throw new Error('不是有效的 .xmind 文件（无法解压）')
  }
  const decoder = new TextDecoder()
  if (entries['content.json'] !== undefined) {
    return parseContentJson(decoder.decode(entries['content.json']))
  }
  if (entries['content.xml'] !== undefined) {
    return parseContentXml(decoder.decode(entries['content.xml']))
  }
  throw new Error('不是有效的 .xmind 文件（缺少 content.json/content.xml）')
}

// —— 新版 content.json ——

interface JsonTopic {
  title?: string
  children?: { attached?: JsonTopic[]; detached?: JsonTopic[] }
  notes?: { plain?: { content?: string } }
  labels?: unknown[]
  markers?: unknown[]
}

function fromJsonTopic(t: JsonTopic, warnings: IgnoredBlock[], path: string): ZenNode {
  const node: ZenNode = { text: t.title ?? '(无标题)', children: [] }
  // XMind 备注归正文(2026-09-06 备注合并):ZenNode.note 已退役,body 是唯一附属文本
  if (typeof t.notes?.plain?.content === 'string' && t.notes.plain.content !== '') {
    node.body = t.notes.plain.content
  }
  // XMind 层级不设限；md 深度 ≥7 自动转嵌套列表（serialize 既有能力）
  for (const c of t.children?.attached ?? []) {
    node.children.push(fromJsonTopic(c, warnings, `${path}/${node.text}`))
  }
  // 未映射：游离主题（detached 非树结构语义）/标签/标记——计数入摘要
  if ((t.children?.detached ?? []).length > 0) {
    warnings.push({ type: '游离主题', excerpt: `${path}/${node.text} 下 ${(t.children?.detached ?? []).length} 个` })
  }
  if ((t.labels ?? []).length > 0) {
    warnings.push({ type: '标签', excerpt: `${node.text}` })
  }
  if ((t.markers ?? []).length > 0) {
    warnings.push({ type: '标记', excerpt: `${node.text}` })
  }
  return node
}

function parseContentJson(raw: string): XmindParseResult {
  const sheets = JSON.parse(raw) as JsonSheet[]
  const first = Array.isArray(sheets) ? sheets[0] : undefined
  if (first?.rootTopic === undefined) throw new Error('content.json 缺少 rootTopic')
  const warnings: IgnoredBlock[] = []
  if (sheets.length > 1) warnings.push({ type: '多画布', excerpt: `仅导入第 1 张，共 ${sheets.length} 张` })
  return { tree: fromJsonTopic(first.rootTopic, warnings, ''), warnings }
}

interface JsonSheet {
  rootTopic?: JsonTopic
}

// —— 旧版 content.xml ——

function fromXmlTopic(el: Element, warnings: IgnoredBlock[], path: string): ZenNode {
  const node: ZenNode = { text: el.getAttribute('title') ?? '(无标题)', children: [] }
  // XMind 备注归正文(2026-09-06 备注合并):ZenNode.note 已退役,body 是唯一附属文本
  const notes = el.querySelector(':scope > notes > plain')
  const noteText = notes?.textContent?.trim()
  if (noteText !== undefined && noteText !== '') node.body = noteText
  // 旧版子题：children/topics[@type='attached'] 下的 topic；detached 计入摘要
  for (const topics of Array.from(el.querySelectorAll(':scope > children > topics'))) {
    const type = topics.getAttribute('type') ?? 'attached'
    for (const t of Array.from(topics.children)) {
      if (t.tagName === 'topic') {
        if (type === 'attached') node.children.push(fromXmlTopic(t, warnings, `${path}/${node.text}`))
        else warnings.push({ type: '游离主题', excerpt: `${t.getAttribute('title') ?? ''}` })
      }
    }
  }
  const labels = el.querySelectorAll(':scope > labels > label')
  if (labels.length > 0) warnings.push({ type: '标签', excerpt: node.text })
  const markers = el.querySelectorAll(':scope > marker-refs > marker-ref')
  if (markers.length > 0) warnings.push({ type: '标记', excerpt: node.text })
  return node
}

function parseContentXml(raw: string): XmindParseResult {
  const doc = new DOMParser().parseFromString(raw, 'text/xml')
  const err = doc.querySelector('parsererror')
  if (err !== null) throw new Error('content.xml 解析失败')
  const root = doc.querySelector('xmap-content > sheet > topic') ?? doc.querySelector('sheet > topic')
  if (root === null) throw new Error('content.xml 缺少根主题')
  const warnings: IgnoredBlock[] = []
  const sheets = doc.querySelectorAll('xmap-content > sheet, sheet')
  if (sheets.length > 1) warnings.push({ type: '多画布', excerpt: `仅导入第 1 张，共 ${sheets.length} 张` })
  return { tree: fromXmlTopic(root, warnings, ''), warnings }
}
