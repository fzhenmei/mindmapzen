import fc from 'fast-check'
import { expect, test } from 'vitest'
import { parse, serialize } from './mdTree'
import { extractTargets, injectMarkers, stripMarkers } from './linkMarkers'
import type { ZenNode } from '../types/tree'

// 文本不含换行（标题/列表行内不可能有），其余字符不做限制以暴露边界。
// 生成器排除项（均按 brief 备注:记录字符与原因,并附边界用例）：
// 1) 换行 \n、\r：标题/列表项均为单行结构,行内不可能含换行,序列化必然断裂；
// 2) 首尾空白（含纯空白文本）：CommonMark 中标题/列表项行内容的首尾空白不显著,
//    parse 侧 sourceLine 的 trimEnd 与标题/标记剥离正则的 \s* 会将其吞掉,
//    属 markdown 语义边界而非实现缺陷,边界行为见下方"首尾空白规范化"用例。
const textArb = fc
  .string({ minLength: 0, maxLength: 12 })
  .filter((t) => !t.includes('\n') && !t.includes('\r') && t === t.trim())

// —— M5c Task 2 生成器扩展（M5d 终审欠账）：textArb 以 1/3 概率混入三类片段 ——
// 句中标记 / 句尾标记 / 无标记，覆盖净化链原始输入的三种形态（随机串几乎不可能自发产出
// 合法 [[..]] 标记，必须定向混入才能驱动 strip/inject/extract 的属性覆盖）。
const snippetArb = fc.constantFrom('前缀 [[目标A]] 后缀', '文本 [[目标B]]', '无标记文本')
const markerTextArb = fc.oneof(textArb, textArb, snippetArb)

// brief 原文的 letrec 写法在 fast-check v4 下不会自动限深(深度控制需在 oneof 上配 depthSize),
// fc.array(tie('node')) 会无限递归栈溢出,故改为显式深度封顶的标准写法。
// 封顶 6 层:根为 H1、子节点依次至 H6,不触发列表层(列表层由下方手工深层用例覆盖)。
// 子节点上限取 brief 重复键 { maxLength: 3, maxLength: 12 } 的首个值 3:
// 12 会让 6 层树最坏膨胀到 12^5≈25 万节点,实测直接打挂 vitest worker。
const nodeArb = (maxDepth: number): fc.Arbitrary<ZenNode> =>
  fc.record({
    text: markerTextArb,
    children:
      maxDepth <= 1
        ? fc.constant<ZenNode[]>([])
        : fc.array(nodeArb(maxDepth - 1), { maxLength: 3 }),
    // 备注候选（brief）：'' 须序列化为无引用块（parse 侧还原为无 note 键），比较前归一化掉
    note: fc.constantFrom('', '备注', '多\n行'),
    // 正文候选（2026-09 写作）：'' = 无正文；候选必须是「合法正文块」（parse 能原样还原的
    // 顶层非结构块），行首 #/- 等结构标记排除——与 textArb 排除换行同理，属 md 语义边界
    body: fc.constantFrom('', '论述段落。', '第一段。\n\n第二段。', '```js\nconst x = 1\n```'),
  })

const treeArb = nodeArb(6)

/** '' 与 undefined 同为「无备注」：属性断言前归一化（toEqual 视缺键与 undefined 等价） */
const stripEmptyNote = (t: ZenNode): ZenNode => ({
  ...t,
  note: t.note === '' ? undefined : t.note,
  children: t.children.map(stripEmptyNote),
})

/** '' 与 undefined 同为「无正文」：属性断言前归一化（含 note 归一，与 stripEmptyNote 同理） */
const stripEmptyBody = (t: ZenNode): ZenNode => ({
  ...t,
  note: t.note === '' ? undefined : t.note,
  body: t.body === '' ? undefined : t.body,
  children: t.children.map(stripEmptyBody),
})

// 500 例 fuzz 用例在单文件独跑时远低于 5s，但全量并行满载下 CPU 争用会膨胀越线，
// 故统一放宽到 30s（只放宽等待上限，用例数与断言语义零改动）
test('parse(serialize(tree)) 结构恒等（500 例，深度≤6 时全走标题）', () => {
  fc.assert(
    fc.property(treeArb, (tree) => {
      const r = parse(serialize(tree))
      expect(r).toEqual({ ok: true, tree: stripEmptyBody(tree), ignoredBlocks: [] })
    }),
    { numRuns: 500 },
  )
}, 30_000)

test('备注含空字符串的树 roundtrip：空串序列化为无引用块（parse 无 note 键）', () => {
  const tree: ZenNode = {
    text: '根',
    note: '',
    children: [{ text: 'A', note: '备注', children: [{ text: 'A1', note: '多\n行', children: [] }] }],
  }
  expect(parse(serialize(tree))).toEqual({
    ok: true,
    tree: stripEmptyNote(tree),
    ignoredBlocks: [],
  })
})

test('列表层备注 roundtrip：项与子项并存时引用块缩进归入该项，结构恒等', () => {
  // 列表层（深度≥7）：item 带备注且带子项——未缩进的引用块会截断列表（子项变同级），
  // 序列化必须把引用块缩进进该项内容（见 serialize 实现注释）
  const deep: ZenNode = {
    text: 'r',
    children: [
      {
        text: 'a',
        children: [
          {
            text: 'b',
            children: [
              {
                text: 'c',
                children: [
                  {
                    text: 'd',
                    children: [
                      {
                        text: 'e',
                        children: [
                          {
                            text: 'item',
                            note: '项\n注',
                            children: [{ text: 'sub', note: '子项备注', children: [] }],
                          },
                          { text: 'tail', children: [] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
  const r = parse(serialize(deep))
  expect(r).toEqual({ ok: true, tree: deep, ignoredBlocks: [] })
})

test('深层树（含列表层）roundtrip：手工构造深度 8', () => {
  const deep: ZenNode = {
    text: 'r',
    children: [
      {
        text: 'a',
        children: [
          {
            text: 'b',
            children: [
              {
                text: 'c',
                children: [
                  {
                    text: 'd',
                    children: [
                      {
                        text: 'e',
                        children: [{ text: 'f', children: [{ text: 'g', children: [] }] }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
  const r = parse(serialize(deep))
  expect(r).toEqual({ ok: true, tree: deep, ignoredBlocks: [] })
})

test('列表项文本以 \\+标记 开头时 roundtrip 保真', () => {
  const tree: ZenNode = {
    text: 'r',
    children: [
      {
        text: 'a',
        children: [
          {
            text: 'b',
            children: [
              {
                text: 'c',
                children: [
                  {
                    text: 'd',
                    children: [
                      {
                        text: 'e',
                        children: [{ text: 'f', children: [{ text: '\\- x', children: [] }] }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
  const r = parse(serialize(tree))
  expect(r).toEqual({ ok: true, tree, ignoredBlocks: [] })
})

test('列表项文本以 反斜杠连串+标记 开头时 roundtrip 保真（转义/反转义互逆）', () => {
  // 覆盖 escapeItemText 第 4 分支的各标记形态与多级反斜杠前缀：
  // serialize 对 `\`*N+标记 补一个 \，parse 剥掉恰好一个 \，任意 N 均互逆
  const deepLeaf = (text: string): ZenNode => {
    let node: ZenNode = { text, children: [] }
    for (const t of ['f', 'e', 'd', 'c', 'b', 'a', 'r']) node = { text: t, children: [node] }
    return node
  }
  for (const text of ['\\- x', '\\\\- x', '\\# y', '\\> q', '\\1. z', '\\* w']) {
    const tree = deepLeaf(text)
    const r = parse(serialize(tree))
    expect(r).toEqual({ ok: true, tree, ignoredBlocks: [] })
  }
})

test('边界：文本首尾空白属 markdown 不显著空白，roundtrip 会被规范化', () => {
  // 生成器排除首尾空白的边界行为演示：` x ` 序列化为 `#  x `，
  // parse 的 trimEnd 与 `^#{1,6}\s*` 剥离后得到 `x`（文档化而非实现缺陷）
  const tree: ZenNode = { text: ' x ', children: [] }
  expect(parse(serialize(tree))).toEqual({
    ok: true,
    tree: { text: 'x', children: [] },
    ignoredBlocks: [],
  })
})

test('回归：列表层裸标记文本 roundtrip 恒等', () => {
  // 钉死边界（2026-08-28 实测复核）：裸 `-`/`+`/`*`/`1.`/`1)` 无尾随内容时不构成
  // 嵌套列表（如 `- -` 中内层 `-` 为段落文本），remark 按普通文本还原，无需转义；
  // `1. x`/`1) x`（有序标记带内容）与 `#x` 则必须转义（escapeItemText），否则被解析为结构。
  // 其中 `1) x` 曾为真实缺口：escape 原只覆盖 `.` 型（\d+\.\s），与 parse 侧 `\d+[.)]`
  // 不对称，已统一为 `\d+[.)]` 后纳入本用例恒等断言。
  const deepLeaf = (text: string): ZenNode => {
    let node: ZenNode = { text, children: [] }
    for (const t of ['f', 'e', 'd', 'c', 'b', 'a', 'r']) node = { text: t, children: [node] }
    return node
  }
  for (const text of ['-', '+', '*', '1.', '1)', '1) x', '1. x', '#x']) {
    const tree = deepLeaf(text)
    const r = parse(serialize(tree))
    expect(r).toEqual({ ok: true, tree, ignoredBlocks: [] })
  }
})

// —— M5c Task 2：标记属性测试三断言（净化链 = stripMarkers / injectMarkers / serialize(linksByUid)）——
// 模型对齐真实链路：md（含标记）→ parse → 净化 stripMarkers（显示层剥离）→ 保存时
// serialize(tree, linksByUid) 句尾注入。三断言分别钉死：句尾规范化 / 幂等 / 开-存定点。

/** 双链口径内的目标名池（不含 []/换行——含括号目标名超出 [[..]] 标记语法的表达能力，另属别维度） */
const targetArb = fc.constantFrom('目标A', '目标B', '目标C', '甲', '/根/乙')
const uidArb = fc
  .string({ minLength: 1, maxLength: 6 })
  .filter((s) => !s.includes('\n') && !s.includes('\r'))

/** 带链接上下文的节点：uid 可选（注册表键，同 uid 允许重复——注册表合并语义）；targets 独立生成 */
interface LinkedNode extends Omit<ZenNode, 'children'> {
  targets: string[]
  children: LinkedNode[]
}
const linkedNodeArb = (maxDepth: number): fc.Arbitrary<LinkedNode> =>
  fc.record({
    text: markerTextArb,
    uid: fc.option(uidArb, { nil: undefined }),
    targets: fc.array(targetArb, { maxLength: 3 }),
    children:
      maxDepth <= 1
        ? fc.constant<LinkedNode[]>([])
        : fc.array(linkedNodeArb(maxDepth - 1), { maxLength: 3 }),
    note: fc.constantFrom('', '备注'),
  })
const linkedTreeArb = linkedNodeArb(6)

/** 树内派生注册表：有 uid 且 targets 非空的节点建条目（目标去重，同 buildRegistry 语义） */
const registryOf = (root: LinkedNode): Map<string, string[]> => {
  const reg = new Map<string, string[]>()
  const walk = (n: LinkedNode): void => {
    if (n.uid !== undefined && n.targets.length > 0) reg.set(n.uid, [...new Set(n.targets)])
    n.children.forEach(walk)
  }
  walk(root)
  return reg
}

/** 净化（打开语义，stripTreeTexts 的树版）：文本剥离标记，uid 保留（注入查表键），'' 备注归一为无 */
const purify = (n: LinkedNode): ZenNode => ({
  text: stripMarkers(n.text),
  children: n.children.map(purify),
  ...(n.uid !== undefined ? { uid: n.uid } : {}),
  ...(n.note === '' ? {} : { note: n.note }),
})

/** 收集树内全部节点文本 */
const textsOf = (n: ZenNode): string[] => [n.text, ...n.children.flatMap(textsOf)]

test('标记属性①句尾规范化：净化后注入序列化，重开每节点标记全在句尾（500 例）', () => {
  fc.assert(
    fc.property(linkedTreeArb, (linked) => {
      const r = parse(serialize(purify(linked), registryOf(linked)))
      expect(r.ok).toBe(true)
      if (!r.ok) return
      for (const text of textsOf(r.tree)) {
        // 剥掉句尾的标记串（含其前导空白）后，剩余前缀不得再含任何标记——“标记均在文本末”
        const rest = text.replace(/(?:\s*\[\[[^\][]+\]\])+$/, '')
        expect(extractTargets(rest)).toEqual([])
      }
    }),
    { numRuns: 500 },
  )
}, 30_000)

test('标记属性②幂等：strip∘inject∘strip === strip（500 例）', () => {
  // 净化链核心不变量：注入再剥离不得改写已净化文本（显示文本在连线开-存循环中保持稳定）
  fc.assert(
    fc.property(markerTextArb, fc.array(targetArb, { maxLength: 3 }), (text, targets) => {
      const once = stripMarkers(text)
      expect(stripMarkers(injectMarkers(once, targets))).toBe(once)
    }),
    { numRuns: 500 },
  )
}, 30_000)

test('标记属性③定点：parse(serialize(tree, links)) 再 serialize 同 links 结果恒等（500 例）', () => {
  // 二次开-存定点：md 是连线唯一事实源——净化注入产出的 md 再开再存（同注册表）不得漂移
  fc.assert(
    fc.property(linkedTreeArb, (linked) => {
      const reg = registryOf(linked)
      const md1 = serialize(purify(linked), reg)
      const r = parse(md1)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(serialize(r.tree, reg)).toBe(md1)
    }),
    { numRuns: 500 },
  )
}, 30_000)

// —— M17 备注即宿主：note 含 ```mermaid 围栏（多行备注）的定点 roundtrip ——
// md 事实源零改动的前提证明：序列化逐行 `> ` 前缀 ↔ 解析逐行剥标记，围栏原样保留
test('note 含 mermaid 围栏：serialize→parse 逐字还原（备注即宿主 M17）', () => {
  const tree: ZenNode = {
    text: '流程节点',
    note: '先看这段说明\n```mermaid\ngraph LR\n  A --> B\n  B --> C\n```',
    children: [],
  }
  const md = serialize(tree)
  expect(md).toContain('> 先看这段说明')
  expect(md).toContain('> ```mermaid')
  expect(md).toContain('> graph LR')
  const r = parse(md)
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.tree.note).toBe(tree.note)
})

// —— M18 图标：句尾 ::name 标记的 parse⇄serialize 定点 roundtrip ——
test('图标标记：parse 提取进 icons（文本剥离）、serialize 句尾注入互逆（M18）', async () => {
  const md = ['# 根 ::flag', '', '## 待办 ::star ::flag', '', '### 普通节点', ''].join('\n')
  const r = parse(md)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.tree.icons).toEqual(['flag'])
  expect(r.tree.text).toBe('根')
  expect(r.tree.children[0]?.icons).toEqual(['star', 'flag'])
  expect(r.tree.children[0]?.text).toBe('待办')
  expect(r.tree.children[0]?.children[0]?.icons).toBeUndefined()
  // serialize 注回（保序）；引擎转换：zen.icons ⇄ data.icon（zen_ 前缀）
  const out = serialize(r.tree)
  expect(out).toContain('# 根 ::flag')
  expect(out).toContain('## 待办 ::star ::flag')
  const { zenToEngineTree, engineTreeToZen } = await import('./mdTree')
  const engine = zenToEngineTree(r.tree)
  expect(engine.data.icon).toEqual(['zen_flag'])
  const back = engineTreeToZen(engine)
  expect(back.tree.icons).toEqual(['flag'])
})

// —— M19 插图：行尾 ![alt](src) 的 parse⇄serialize 与引擎 imgMap 转换 ——
test('插图标记：parse 提取进 image、serialize 注回、imgMap 转换（M19）', async () => {
  const md = ['# 根 ![配图](assets/x.png)', '', '## 子 ::flag ![图二](assets/y.png)', '', '## 普通节点', ''].join('\n')
  const r = parse(md)
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.tree.image).toEqual({ src: 'assets/x.png', alt: '配图' })
  expect(r.tree.text).toBe('根')
  const child = r.tree.children[0]!
  expect(child.icons).toEqual(['flag'])
  expect(child.image).toEqual({ src: 'assets/y.png', alt: '图二' })
  expect(child.text).toBe('子')
  expect(r.tree.children[1]?.image).toBeUndefined()
  const out = serialize(r.tree)
  expect(out).toContain('# 根 ![配图](assets/x.png)')
  expect(out).toContain('## 子 ::flag ![图二](assets/y.png)')
  const { zenToEngineTree, engineTreeToZen } = await import('./mdTree')
  const meta = new Map([
    ['assets/x.png', { dataUrl: 'data:image/png;base64,AAA', size: { width: 100, height: 60 } }],
    ['assets/y.png', { dataUrl: 'data:image/png;base64,BBB', size: { width: 50, height: 50 } }],
  ])
  const engine = zenToEngineTree(r.tree, new Set(), '', meta)
  expect(engine.data.imgMap).toEqual({ 'assets/x.png': 'data:image/png;base64,AAA', 'assets/y.png': 'data:image/png;base64,BBB' })
  expect(engine.data.image).toBe('assets/x.png')
  expect(engine.data.imageSize).toEqual({ width: 100, height: 60, custom: false })
  // meta 缺失的宽容：普通节点无图不受影响；y 子节点有 meta
  expect(engine.children?.[0]?.data.image).toBe('assets/y.png')
  const back = engineTreeToZen(engine)
  expect(back.tree.image).toEqual({ src: 'assets/x.png', alt: '配图' })
})

test('插图 meta 缺失：节点不设 image（宽容跳过，md 标记仍在树里）', async () => {
  const md = '# 图 ![缺失](assets/gone.png)\n'
  const r = parse(md)
  if (!r.ok) return
  const { zenToEngineTree } = await import('./mdTree')
  const engine = zenToEngineTree(r.tree) // 不传 imgMeta
  expect(engine.data.image).toBeUndefined()
  expect(engine.data.imgMap).toBeUndefined()
})

// —— 2026-09 正文：serialize 固定顺序回写（节点行 → 正文 → 备注 → 子结构）+ roundtrip 契约 ——
test('正文 roundtrip：body+备注+子结构混合，serialize 顺序恒等', () => {
  const tree: ZenNode = {
    text: '根', body: '根的论述。', note: '根的备注',
    children: [{ text: '子', body: '```js\n# 不是标题\n```', children: [] }],
  }
  const md = serialize(tree)
  // 顺序钉死：节点行 → 正文 → 备注 → 子结构（空行分隔）
  expect(md).toBe('# 根\n根的论述。\n\n> 根的备注\n\n## 子\n```js\n# 不是标题\n```\n')
  const r = parse(md)
  expect(r).toEqual({ ok: true, tree: stripEmptyBody(tree), ignoredBlocks: [] })
})

test('正文含代码块：#/- 行不误解析为结构（roundtrip 恒等）', () => {
  const tree: ZenNode = { text: 'r', body: '```js\n# h\n- l\n```', children: [{ text: 'c', children: [] }] }
  const r = parse(serialize(tree))
  expect(r).toEqual({ ok: true, tree, ignoredBlocks: [] })
})

test('子结构后段落宽容：serialize 重排到子结构前，二次 roundtrip 恒等', () => {
  // 手写形态：段落出现在子列表之后；parse 收进 body，serialize 固定顺序写回，再 parse 恒等
  const hand = ['# r', '', '- 项', '', '列表后的段落。', ''].join('\n')
  const once = parse(hand)
  if (!once.ok) return
  expect(once.tree.body).toBe('列表后的段落。')
  const md = serialize(once.tree)
  expect(parse(md)).toEqual({ ok: true, tree: once.tree, ignoredBlocks: [] }) // 定点：开-存-开不漂移
})

test('防御：列表层节点（深度≥7）带 body 时 serialize 抛错，不静默丢内容', () => {
  const deepLeaf = (body?: string): ZenNode => {
    let node: ZenNode = { text: 'leaf', ...(body !== undefined ? { body } : {}), children: [] }
    for (const t of ['f', 'e', 'd', 'c', 'b', 'a', 'r']) node = { text: t, children: [node] }
    return node
  }
  expect(() => serialize(deepLeaf('深层正文'))).toThrow()
  expect(() => serialize(deepLeaf())).not.toThrow()
})
