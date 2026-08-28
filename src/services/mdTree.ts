import type { ZenNode } from '../types/tree'

/** 列表项文本若以列表标记/标题/引用开头，加 \ 前缀防止被解析为结构 */
function escapeItemText(text: string): string {
  return /^([-+*]\s|\d+\.\s|[#>])/.test(text) ? '\\' + text : text
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
