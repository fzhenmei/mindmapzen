import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { IgnoredBlock, ParseResult, ZenNode } from '../types/tree'

/** 列表项文本若以列表标记/标题/引用/前导反斜杠+标记开头，加 \ 前缀防止被解析为结构 */
function escapeItemText(text: string): string {
  return /^([-+*]\s|\d+[.)]\s|[#>]|\\+(?=[-+*#>]|\d+[.)]))/.test(text) ? '\\' + text : text
}

/** 树 → 规范 markdown。深度 1-6 → H1-H6；≥7 → 嵌套无序列表 */
export function serialize(tree: ZenNode): string {
  const lines: string[] = []

  function emitHeading(node: ZenNode, depth: number): void {
    if (lines.length > 0) lines.push('')
    lines.push('#'.repeat(depth) + (node.text === '' ? '' : ' ' + node.text))
    emitChildren(node.children, depth)
  }

  function emitChildren(children: ZenNode[], parentDepth: number): void {
    if (children.length === 0) return
    if (parentDepth < 6) {
      children.forEach((c) => emitHeading(c, parentDepth + 1))
    } else {
      emitList(children, 0)
    }
  }

  function emitList(children: ZenNode[], level: number): void {
    children.forEach((c) => {
      lines.push('  '.repeat(level) + '- ' + escapeItemText(c.text))
      if (c.children.length > 0) emitList(c.children, level + 1)
    })
  }

  emitHeading(tree, 1)
  return lines.join('\n') + '\n'
}

interface MPosition {
  start: { line: number; column: number }
  end: { line: number; column: number }
}
interface MNode {
  type: string
  depth?: number
  children?: MNode[]
  position?: MPosition
}

function nodeText(n: MNode): string {
  if (!n.children) return ''
  return n.children
    .map((c) =>
      c.type === 'text' ? String((c as unknown as { value: string }).value) : nodeText(c),
    )
    .join('')
}

/** 取节点起始行源码原文（保留行内标记） */
function sourceLine(md: string, node: MNode): string {
  const idx = (node.position?.start.line ?? 1) - 1
  return (md.split('\n')[idx] ?? '').trimEnd()
}

function headingText(md: string, node: MNode): string {
  return sourceLine(md, node).replace(/^#{1,6}\s*/, '')
}

function listItemText(md: string, item: MNode): string {
  const para = item.children?.find((c) => c.type === 'paragraph')
  if (!para?.position) return ''
  return (
    sourceLine(md, para)
      .replace(/^\s*(?:[-+*]|\d+[.)])\s*/, '')
      // 前导反斜杠连串 + 标记：剥掉恰好一个 \（与 escapeItemText 的补 \ 互逆）
      .replace(/^(\\+)(?=[-+*#>]|\d+[.)])/, (_, backslashes: string) => backslashes.slice(1))
  )
}

/** 列表块挂到最近标题下（嵌套列表递进一层），列表项首段落即其文本不计入 ignored，其余非列表内容收进 ignored */
function visitList(md: string, list: MNode, parentNode: ZenNode, ignored: IgnoredBlock[]): void {
  for (const item of list.children ?? []) {
    if (item.type !== 'listItem') continue
    const para = item.children?.find((c) => c.type === 'paragraph')
    const node: ZenNode = { text: listItemText(md, item), children: [] }
    parentNode.children.push(node)
    for (const sub of item.children ?? []) {
      if (sub.type === 'list') visitList(md, sub, node, ignored)
      else if (sub !== para) ignored.push({ type: sub.type, excerpt: nodeText(sub).slice(0, 50) })
    }
  }
}

/** 标题挂到 outline 栈顶最近较浅标题下（多余 H1 按 d=1 弹栈至根，成为根的一级子节点） */
function attachHeading(
  md: string,
  block: MNode,
  depth: number,
  stack: { depth: number; node: ZenNode }[],
): void {
  while (stack.length > 1 && (stack.at(-1)?.depth ?? 0) >= depth) stack.pop()
  const node: ZenNode = { text: headingText(md, block), children: [] }
  stack.at(-1)?.node.children.push(node)
  stack.push({ depth, node })
}

const NO_ROOT_ERROR = '未找到根标题（缺少一级标题 H1）'

interface OutlineState {
  root: ZenNode | null
  stack: { depth: number; node: ZenNode }[]
  ignored: IgnoredBlock[]
}

/** 处理标题块：首个 H1 立为根；其余标题挂 outline 栈（多余 H1 成为根的一级子节点）。返回错误信息（null 表示正常） */
function visitHeading(md: string, block: MNode, state: OutlineState): string | null {
  const d = block.depth ?? 1
  if (state.root !== null) {
    attachHeading(md, block, d, state.stack)
    return null
  }
  if (d !== 1) return NO_ROOT_ERROR
  state.root = { text: headingText(md, block), children: [] }
  state.stack.push({ depth: 1, node: state.root })
  return null
}

/** 处理单个顶层块：标题/列表归树，其余收进 ignored。返回错误信息（null 表示正常） */
function visitBlock(md: string, block: MNode, state: OutlineState): string | null {
  if (block.type === 'heading') return visitHeading(md, block, state)
  if (block.type !== 'list') {
    state.ignored.push({ type: block.type, excerpt: nodeText(block).slice(0, 50) })
    return null
  }
  const top = state.stack.at(-1)
  if (top === undefined)
    state.ignored.push({ type: block.type, excerpt: nodeText(block).slice(0, 50) })
  else visitList(md, block, top.node, state.ignored)
  return null
}

/** markdown → 树（spec §6.2 宽容规则），任何输入不抛异常 */
export function parse(md: string): ParseResult {
  let ast: MNode
  try {
    ast = unified().use(remarkParse).parse(md) as unknown as MNode
  } catch (e) {
    return { ok: false, error: `Markdown 解析失败：${String(e)}` }
  }
  const state: OutlineState = { root: null, stack: [], ignored: [] }
  for (const block of ast.children ?? []) {
    const err = visitBlock(md, block, state)
    if (err !== null) return { ok: false, error: err }
  }
  if (state.root === null) return { ok: false, error: NO_ROOT_ERROR }
  return { ok: true, tree: state.root, ignoredBlocks: state.ignored }
}
