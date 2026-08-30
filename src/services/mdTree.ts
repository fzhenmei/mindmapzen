import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { extractTargets, injectMarkers } from './linkMarkers'
import { extractIconMarkers, injectIconMarkers, stripIconMarkers } from './iconMarkers'
import type { IgnoredBlock, ParseResult, ZenNode } from '../types/tree'
import type { EngineNode } from '../types/engine'

/** 列表项文本若以列表标记/标题/引用/前导反斜杠+标记开头，加 \ 前缀防止被解析为结构。
 *  标记类不要求后随空白：裸 `-`/`#x` 等也补转义（多转无害——parse 侧按 `\+标记` 剥恰一个 \，roundtrip 仍恒等） */
function escapeItemText(text: string): string {
  return /^([-+*#>]|\d+[.)]\s|\\+(?=[-+*#>]|\d+[.)]))/.test(text) ? '\\' + text : text
}

/** 节点文本含换行时序列化必然产出结构损坏的 md（静默丢内容），宁可当场报错拦截 */
function assertNoNewline(node: ZenNode): void {
  if (node.text.includes('\n') || node.text.includes('\r')) {
    throw new Error(`节点文本包含换行，暂不支持多行文本：${node.text.slice(0, 20)}…`)
  }
  for (const child of node.children) assertNoNewline(child)
}

/** 树 → 规范 markdown。深度 1-6 → H1-H6；≥7 → 嵌套无序列表；节点备注 → 节点行后引用块。
 *  linksByUid（M5d Task 2 序列化注入）：连线净化会话注册表（源 uid → 目标名列表）——
 *  节点按 uid 命中后句尾追加 ` [[名]]`（多目标依次）；文本已含的目标不重复注入
 *  （会话内手写标记原样保留，规范化发生在下一次打开剥离后） */
export function serialize(tree: ZenNode, linksByUid?: ReadonlyMap<string, readonly string[]>): string {
  assertNoNewline(tree)
  const lines: string[] = []

  /** 序列化文本：查注册表注入句尾连线标记（显示层剥离的净化语义下，md 仍是连线唯一事实源）；
   *  图标标记（M18）同口径句尾注入（zen.icons ⇄ ::name 互逆） */
  function textOf(node: ZenNode): string {
    const targets = node.uid !== undefined ? linksByUid?.get(node.uid) : undefined
    let text = node.text
    if (targets !== undefined && targets.length > 0) {
      const existing = new Set(extractTargets(text))
      const missing = targets.filter((t) => !existing.has(t))
      if (missing.length > 0) text = injectMarkers(text, missing)
    }
    return injectIconMarkers(text, node.icons ?? [])
  }

  /** 备注输出为逐行 `> ` 前缀的引用块，紧跟节点行、先于其子节点。
   *  列表项的引用块须缩进进该项内容列：列首 `>` 会终结整个列表块（子项会升格为同级，roundtrip 断裂） */
  function emitNote(node: ZenNode, indent: string): void {
    if (!node.note) return // 空串视为无备注
    for (const line of node.note.split('\n')) lines.push(indent + '> ' + line)
  }

  function emitHeading(node: ZenNode, depth: number): void {
    const text = textOf(node)
    if (lines.length > 0) lines.push('')
    lines.push('#'.repeat(depth) + (text === '' ? '' : ' ' + text))
    emitNote(node, '')
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
      lines.push('  '.repeat(level) + '- ' + escapeItemText(textOf(c)))
      emitNote(c, '  '.repeat(level + 1))
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

/** 建节点（M18 图标）：行尾 ::name 标记提取进 icons（文本剥离、序列化注入互逆）；
 *  无标记快速路径零开销（heading 与列表项共用） */
function makeNode(raw: string): ZenNode {
  const icons = extractIconMarkers(raw)
  const node: ZenNode = { text: stripIconMarkers(raw), children: [] }
  if (icons.length > 0) node.icons = icons
  return node
}

/** 引用块备注文本：按源码行剥掉行首 `>` 标记（保留原文换行/空行/嵌套 `>`，与序列化侧 `> `+行 逐字互逆） */
function blockquoteText(md: string, block: MNode): string {
  const lines = md.split('\n')
  const start = (block.position?.start.line ?? 1) - 1
  const end = (block.position?.end.line ?? 1) - 1
  const out: string[] = []
  for (let i = start; i <= end; i++) {
    out.push((lines[i] ?? '').replace(/\r$/, '').replace(/^\s*>\s?/, ''))
  }
  return out.join('\n')
}

/** 归属备注：同节点后接多个引用块时以空行合并（宽容，不静默丢内容） */
function assignNote(node: ZenNode, note: string): void {
  node.note = node.note ? node.note + '\n' + note : note
}

/** 列表块挂到最近标题下（嵌套列表递进一层），列表项首段落即其文本不计入 ignored，
 *  项内引用块收为该项备注，其余非列表内容收进 ignored */
function visitList(md: string, list: MNode, parentNode: ZenNode, state: OutlineState): void {
  for (const item of list.children ?? []) {
    if (item.type !== 'listItem') continue
    const para = item.children?.find((c) => c.type === 'paragraph')
    const node = makeNode(listItemText(md, item))
    parentNode.children.push(node)
    state.lastNode = node
    for (const sub of item.children ?? []) {
      if (sub.type === 'list') visitList(md, sub, node, state)
      else if (sub.type === 'blockquote') assignNote(node, blockquoteText(md, sub))
      else if (sub !== para)
        state.ignored.push({ type: sub.type, excerpt: nodeText(sub).slice(0, 50) })
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
  const node = makeNode(headingText(md, block))
  stack.at(-1)?.node.children.push(node)
  stack.push({ depth, node })
}

const NO_ROOT_ERROR = '未找到根标题（缺少一级标题 H1）'

interface OutlineState {
  root: ZenNode | null
  stack: { depth: number; node: ZenNode }[]
  ignored: IgnoredBlock[]
  /** 最近产出的节点（标题或列表项）：无缩进的顶层引用块归属它 */
  lastNode: ZenNode | null
}

/** 处理标题块：首个 H1 立为根；其余标题挂 outline 栈（多余 H1 成为根的一级子节点）。返回错误信息（null 表示正常） */
function visitHeading(md: string, block: MNode, state: OutlineState): string | null {
  const d = block.depth ?? 1
  if (state.root !== null) {
    attachHeading(md, block, d, state.stack)
    state.lastNode = state.stack.at(-1)?.node ?? null
    return null
  }
  if (d !== 1) return NO_ROOT_ERROR
  state.root = makeNode(headingText(md, block))
  state.stack.push({ depth: 1, node: state.root })
  state.lastNode = state.root
  return null
}

/** 处理单个顶层块：标题/列表归树，引用块归属最近节点（无归属收进 ignored），其余收进 ignored。返回错误信息（null 表示正常） */
function visitBlock(md: string, block: MNode, state: OutlineState): string | null {
  if (block.type === 'heading') return visitHeading(md, block, state)
  if (block.type === 'blockquote') {
    const target = state.lastNode
    if (target === null)
      state.ignored.push({ type: 'blockquote', excerpt: nodeText(block).slice(0, 50) })
    else assignNote(target, blockquoteText(md, block))
    return null
  }
  if (block.type !== 'list') {
    state.ignored.push({ type: block.type, excerpt: nodeText(block).slice(0, 50) })
    return null
  }
  const top = state.stack.at(-1)
  if (top === undefined)
    state.ignored.push({ type: block.type, excerpt: nodeText(block).slice(0, 50) })
  else visitList(md, block, top.node, state)
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
  const state: OutlineState = { root: null, stack: [], ignored: [], lastNode: null }
  for (const block of ast.children ?? []) {
    const err = visitBlock(md, block, state)
    if (err !== null) return { ok: false, error: err }
  }
  if (state.root === null) return { ok: false, error: NO_ROOT_ERROR }
  return { ok: true, tree: state.root, ignoredBlocks: state.ignored }
}

/** zen → engine 树：折叠路径集（根为 '/'+text，子为父路径+'/'+text，字面拼接）内的节点 expand=false；
 *  note 透传进 data（undefined 不设键——引擎以 truthy 判定备注角标显隐）；
 *  icons → data.icon（'zen_'+name，引擎 iconList 通道约定，M18） */
export function zenToEngineTree(
  tree: ZenNode,
  collapsed: ReadonlySet<string> = new Set(),
  parentPath = '',
): EngineNode {
  const path = parentPath === '' ? '/' + tree.text : parentPath + '/' + tree.text
  return {
    data: {
      text: tree.text,
      expand: !collapsed.has(path),
      ...(tree.note !== undefined ? { note: tree.note } : {}),
      ...(tree.icons !== undefined && tree.icons.length > 0 ? { icon: tree.icons.map((n) => `zen_${n}`) } : {}),
    },
    children: tree.children.map((c) => zenToEngineTree(c, collapsed, path)),
  }
}

/** engine → zen 树：还原纯文本树并收集折叠路径（data.expand === false 视为折叠）与备注（data.note 仅字符串）；
 *  data.uid（仅字符串）透传进 ZenNode——M5d Task 2 序列化注入按 uid 查连线注册表（不进 md） */
export function engineTreeToZen(
  root: EngineNode,
  parentPath = '',
): { tree: ZenNode; collapsed: string[] } {
  const path = parentPath === '' ? '/' + root.data.text : parentPath + '/' + root.data.text
  const own = root.data.expand === false ? [path] : []
  const subs = (root.children ?? []).map((c) => engineTreeToZen(c, path))
  const note = typeof root.data.note === 'string' ? root.data.note : undefined
  const uid = typeof root.data.uid === 'string' ? root.data.uid : undefined
  // 图标收集（M18）：data.icon 仅收 'zen_' 前缀项（引擎其他图标源不受影响），剥前缀还原 kebab 名
  const icons = Array.isArray(root.data.icon)
    ? root.data.icon.filter((n): n is string => typeof n === 'string' && n.startsWith('zen_')).map((n) => n.slice(4))
    : []
  return {
    tree: {
      text: root.data.text,
      ...(note !== undefined ? { note } : {}),
      ...(uid !== undefined ? { uid } : {}),
      ...(icons.length > 0 ? { icons } : {}),
      children: subs.map((s) => s.tree),
    },
    collapsed: [...own, ...subs.flatMap((s) => s.collapsed)],
  }
}

/** 深度优先按引擎节点 uid 定位子树；未命中返回 null（复制范围解析用） */
export function findSubtreeByUid(root: EngineNode, uid: string): EngineNode | null {
  if (root.data.uid === uid) return root
  for (const child of root.children ?? []) {
    const hit = findSubtreeByUid(child, uid)
    if (hit) return hit
  }
  return null
}
