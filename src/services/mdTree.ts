import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { extractTargets, injectMarkers } from './linkMarkers'
import { extractIconMarkers, injectIconMarkers, stripIconMarkers } from './iconMarkers'
import { extractImageMarker, injectImageMarker, stripImageMarker } from './imageMarkers'
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

/** 列表层节点（深度≥7）不支持正文（spec v1 深度限制）：宁可抛错拦截，不静默丢内容
 *  （正常 UI 路径由 useBodyPanel 的 layer 门禁拦截，此处防其他写入路径） */
function assertNoBodyInList(node: ZenNode, depth: number): void {
  if (depth >= 7 && node.body !== undefined) {
    throw new Error(`深层列表节点暂不支持正文：${node.text.slice(0, 20)}…`)
  }
  for (const child of node.children) assertNoBodyInList(child, depth + 1)
}

/** 树 → 规范 markdown。深度 1-6 → H1-H6；≥7 → 嵌套无序列表；
 *  节点正文（2026-09 写作;2026-09-06 备注合并后唯一附属文本）→ 节点行后的原样块
 *  （引用块/代码块等一律原样含前缀；列表层不支持正文，入口抛错拦截）。
 *  linksByUid（M5d Task 2 序列化注入）：连线净化会话注册表（源 uid → 目标名列表）——
 *  节点按 uid 命中后句尾追加 ` [[名]]`（多目标依次）；文本已含的目标不重复注入
 *  （会话内手写标记原样保留，规范化发生在下一次打开剥离后） */
export function serialize(tree: ZenNode, linksByUid?: ReadonlyMap<string, readonly string[]>): string {
  assertNoNewline(tree)
  assertNoBodyInList(tree, 1)
  const lines: string[] = []

  /** 序列化文本：查注册表注入句尾连线标记（显示层剥离的净化语义下，md 仍是连线唯一事实源）；
   *  图标（M18 ::name）与插图（M19 ![alt](src)）同口径句尾注入（图片最尾） */
  function textOf(node: ZenNode): string {
    const targets = node.uid !== undefined ? linksByUid?.get(node.uid) : undefined
    let text = node.text
    if (targets !== undefined && targets.length > 0) {
      const existing = new Set(extractTargets(text))
      const missing = targets.filter((t) => !existing.has(t))
      if (missing.length > 0) text = injectMarkers(text, missing)
    }
    return injectImageMarker(injectIconMarkers(text, node.icons ?? []), node.image ?? null)
  }

  /** 正文输出为原样块，紧跟节点行、先于子结构（与 parse「归属最近标题」互逆）；
   *  块间空行即 assignBody 的 '\n\n' 合并约定，原样写回逐字恒等；末尾空行与后续结构分隔 */
  function emitBody(node: ZenNode): void {
    if (!node.body) return // 空串视为无正文
    lines.push(...node.body.split('\n'), '')
  }

  function emitHeading(node: ZenNode, depth: number): void {
    const text = textOf(node)
    // 标题前补单个空行与上文分隔;上文是 emitBody 时其尾空行已充当分隔(2026-09-06
    // 备注合并后正文块直接衔接子结构),不重复补行防双空行
    if (lines.length > 0 && lines.at(-1) !== '') lines.push('')
    lines.push('#'.repeat(depth) + (text === '' ? '' : ' ' + text))
    emitBody(node)
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
      if (c.children.length > 0) emitList(c.children, level + 1)
    })
  }

  emitHeading(tree, 1)
  // 出口统一规范化：剥掉累积的尾部空行（正文尾随的分隔空行），保证产出恒以单个换行结尾
  while (lines.length > 0 && lines.at(-1) === '') lines.pop()
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

/** 建节点（M18 图标 / M19 插图）：行尾标记提取进结构化字段（文本剥离、序列化注入互逆）；
 *  行尾约定顺序：`文本 ::icon ![alt](src)`（图片最尾）；无标记快速路径零开销 */
function makeNode(raw: string): ZenNode {
  const image = extractImageMarker(raw)
  const stripped = stripImageMarker(raw)
  const icons = extractIconMarkers(stripped)
  const node: ZenNode = { text: stripIconMarkers(stripped), children: [] }
  if (icons.length > 0) node.icons = icons
  if (image !== null) node.image = image
  return node
}

/** 引用块文本剥前缀：按源码行剥掉行首 `>` 标记（保留原文换行/空行/嵌套 `>`）。
 *  备注合并(2026-09-06)后仅列表项内引用块走此通道——列表项 v1 无正文,
 *  剥前缀归父标题 body(宽容不丢);顶层引用块走 rawBlockText 原样归 body */
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

/** 块级源码原文(2026-09 正文):按 position 行区间整段取(保留内部空行/缩进,
 *  与序列化原样写回逐字互逆;不剥任何前缀——正文块是顶层块,引用块原样含 > 前缀) */
function rawBlockText(md: string, block: MNode): string {
  const lines = md.split('\n')
  const start = (block.position?.start.line ?? 1) - 1
  const end = (block.position?.end.line ?? 1) - 1
  const out: string[] = []
  for (let i = start; i <= end; i++) out.push((lines[i] ?? '').replace(/\r$/, ''))
  return out.join('\n')
}

/** 归属正文:多块以空行合并(宽容,与序列化"块间空行"约定互逆;spec 正文归一) */
function assignBody(node: ZenNode, body: string): void {
  node.body = node.body ? node.body + '\n\n' + body : body
}

/** 列表块挂到最近标题下（嵌套列表递进一层），列表项首段落即其文本不计入 ignored，
 *  项内引用块（2026-09-06 合并）剥前缀归最近标题级节点 body（列表项 v1 无正文，宽容不丢），
 *  其余非列表内容收进 ignored */
function visitList(md: string, list: MNode, parentNode: ZenNode, state: OutlineState): void {
  for (const item of list.children ?? []) {
    if (item.type !== 'listItem') continue
    const para = item.children?.find((c) => c.type === 'paragraph')
    const node = makeNode(listItemText(md, item))
    parentNode.children.push(node)
    for (const sub of item.children ?? []) {
      if (sub.type === 'list') visitList(md, sub, node, state)
      // 项内引用块(2026-09-06 合并):列表项无正文,剥 > 前缀归最近标题级节点 body(宽容不丢)
      else if (sub.type === 'blockquote' && state.lastHeading !== null)
        assignBody(state.lastHeading, blockquoteText(md, sub))
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
  /** 最近标题级节点(2026-09 正文;2026-09-06 备注合并后引用块同归此):非结构块的
   *  归属目标;仅 visitHeading 更新,列表项不更新(列表项 v1 无正文,spec 深度限制)。
   *  旧 lastNode(引用块备注归属)已随 note 退役删除 */
  lastHeading: ZenNode | null
}

/** 处理标题块：首个 H1 立为根；其余标题挂 outline 栈（多余 H1 成为根的一级子节点）。返回错误信息（null 表示正常） */
function visitHeading(md: string, block: MNode, state: OutlineState): string | null {
  const d = block.depth ?? 1
  if (state.root !== null) {
    attachHeading(md, block, d, state.stack)
    state.lastHeading = state.stack.at(-1)?.node ?? null
    return null
  }
  if (d !== 1) return NO_ROOT_ERROR
  state.root = makeNode(headingText(md, block))
  state.stack.push({ depth: 1, node: state.root })
  state.lastHeading = state.root
  return null
}

/** 处理单个顶层块：标题/列表归树，引用块与其余非结构块（段落/代码/表格等）归属最近标题级节点为正文
 *  （无归属收进 ignored）。返回错误信息（null 表示正常） */
function visitBlock(md: string, block: MNode, state: OutlineState): string | null {
  if (block.type === 'heading') return visitHeading(md, block, state)
  if (block.type === 'blockquote') {
    // 备注合并(2026-09-06):引用块归正文,原样(含 > 前缀)收进最近标题级节点的 body
    const target = state.lastHeading
    if (target === null)
      state.ignored.push({ type: 'blockquote', excerpt: nodeText(block).slice(0, 50) })
    else assignBody(target, rawBlockText(md, block))
    return null
  }
  if (block.type !== 'list') {
    // 正文(2026-09 写作):非结构块(段落/代码/表格等)归属最近标题级节点;
    // 根 H1 之前无归属,仍收进 ignored(spec 兼容性:段落从静默忽略变为正文可见)
    const target = state.lastHeading
    if (target === null) state.ignored.push({ type: block.type, excerpt: nodeText(block).slice(0, 50) })
    else assignBody(target, rawBlockText(md, block))
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
  const state: OutlineState = { root: null, stack: [], ignored: [], lastHeading: null }
  for (const block of ast.children ?? []) {
    const err = visitBlock(md, block, state)
    if (err !== null) return { ok: false, error: err }
  }
  if (state.root === null) return { ok: false, error: NO_ROOT_ERROR }
  return { ok: true, tree: state.root, ignoredBlocks: state.ignored }
}

/** 插图渲染元数据（M19）：src（md 事实源键）→ dataURL 与真实尺寸（构建见 services/imageAssets.ts） */
export interface ImageMetaEntry {
  dataUrl: string
  size: { width: number; height: number }
}

/** zen → engine 树：折叠路径集（根为 '/'+text，子为父路径+'/'+text，字面拼接）内的节点 expand=false；
 *  body（非空串）透传进 data.body 并同值镜像 data.note（2026-09-06 备注合并：
 *  复用引擎「有 note→挂角标+悬停」原生通道，body 是事实源）并尾部追加内部图标 zen_body（正文角标）；
 *  icons → data.icon（'zen_'+name，引擎 iconList 通道约定，M18）；
 *  image → data.image（src 键）+ imageSize（custom:false 由主题上限等比缩放），根 data.imgMap
 *  携 src→dataURL（引擎 getImageUrl 查表，nodeCreateContents.js:41-44——md 存相对路径、
 *  画布渲 dataURL，免 asset 协议）；meta 缺失的 src 宽容跳过（不设 image，md 标记保留） */
export function zenToEngineTree(
  tree: ZenNode,
  collapsed: ReadonlySet<string> = new Set(),
  parentPath = '',
  imgMeta?: ReadonlyMap<string, ImageMetaEntry>,
): EngineNode {
  const path = parentPath === '' ? '/' + tree.text : parentPath + '/' + tree.text
  const imgEntry = tree.image !== undefined ? imgMeta?.get(tree.image.src) : undefined
  // imgMap 挂根节点 data（引擎按 renderTree.data.imgMap 全局查表）
  const rootImgMap: Record<string, string> = {}
  if (parentPath === '' && imgMeta !== undefined && imgMeta.size > 0) {
    for (const [src, e] of imgMeta) rootImgMap[src] = e.dataUrl
  }
  // 图标组装（M18 + 2026-09 正文角标）：用户 icons 之外，body 非空时尾部追加内部图标
  // zen_body（画布「有正文」角标）；engineTreeToZen 收集侧剥除，不进 md（保留名）。
  // 终审 M1：用户手敲 ::body 时 zen_body 已在册——不重复追加，防画布双角标
  const icons = [
    ...(tree.icons ?? []).map((n) => `zen_${n}`),
    ...(tree.body && !(tree.icons ?? []).includes('body') ? ['zen_body'] : []),
  ]
  return {
    data: {
      text: tree.text,
      expand: !collapsed.has(path),
      // 镜像 note(2026-09-06 合并):复用引擎「有 note→挂角标+悬停」通道,body 是事实源
      ...(tree.body ? { body: tree.body, note: tree.body } : {}),
      ...(icons.length > 0 ? { icon: icons } : {}),
      ...(tree.image !== undefined && imgEntry !== undefined
        ? {
            image: tree.image.src,
            imageTitle: tree.image.alt,
            imageSize: { ...imgEntry.size, custom: false },
          }
        : {}),
      ...(parentPath === '' && Object.keys(rootImgMap).length > 0 ? { imgMap: rootImgMap } : {}),
    },
    children: tree.children.map((c) => zenToEngineTree(c, collapsed, path, imgMeta)),
  }
}

/** data.icon 收集（M18）：仅收 'zen_' 前缀项并剥前缀还原 kebab 名；zen_body 为宿主内部角标
 *  （保留名），剥除不还原；非数组/非字符串宽容忽略（引擎其他图标源不受影响） */
function collectIcons(icon: unknown): string[] {
  if (!Array.isArray(icon)) return []
  return icon
    .filter((n): n is string => typeof n === 'string' && n.startsWith('zen_') && n !== 'zen_body')
    .map((n) => n.slice(4))
}

/** engine → zen 树：还原纯文本树并收集折叠路径（data.expand === false 视为折叠）；
 *  data.body（非空字符串）收进 ZenNode.body——zen_body 角标图标同步剥除（保留名，不进 md）；
 *  data.note 为宿主镜像（2026-09-06 合并），不收集——事实源是 data.body；
 *  data.uid（仅字符串）透传进 ZenNode——M5d Task 2 序列化注入按 uid 查连线注册表（不进 md） */
export function engineTreeToZen(
  root: EngineNode,
  parentPath = '',
): { tree: ZenNode; collapsed: string[] } {
  const path = parentPath === '' ? '/' + root.data.text : parentPath + '/' + root.data.text
  const own = root.data.expand === false ? [path] : []
  const subs = (root.children ?? []).map((c) => engineTreeToZen(c, path))
  const body = typeof root.data.body === 'string' && root.data.body !== '' ? root.data.body : undefined
  const uid = typeof root.data.uid === 'string' ? root.data.uid : undefined
  // 图标收集（M18）：仅收 'zen_' 前缀项；zen_body 为宿主内部角标（保留名），剥除不还原
  const icons = collectIcons(root.data.icon)
  // 插图收集（M19）：data.image（src 键）+ imageTitle（alt）；imgMap 不回写（引擎根 data 临时物）
  const image =
    typeof root.data.image === 'string' && root.data.image !== ''
      ? { src: root.data.image, alt: typeof root.data.imageTitle === 'string' ? root.data.imageTitle : '' }
      : undefined
  return {
    tree: {
      text: root.data.text,
      ...(uid !== undefined ? { uid } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(icons.length > 0 ? { icons } : {}),
      ...(image !== undefined ? { image } : {}),
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
