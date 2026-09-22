import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { parse, serialize } from './mdTree'
import { extractTargets, injectMarkers, stripMarkers } from './linkMarkers'
import { TASK_STATUSES } from './statusMarkers'
import type { ZenNode } from '../types/tree'

// 文本不含换行（标题/列表行内不可能有），其余字符不做限制以暴露边界。
// 生成器排除项（均按 brief 备注:记录字符与原因,并附边界用例）：
// 1) 换行 \n、\r：标题/列表项均为单行结构,行内不可能含换行,序列化必然断裂；
// 2) 首尾空白（含纯空白文本）：CommonMark 中标题/列表项行内容的首尾空白不显著,
//    parse 侧 sourceLine 的 trimEnd 与标题/标记剥离正则的 \s* 会将其吞掉,
//    属 markdown 语义边界而非实现缺陷,边界行为见下方"首尾空白规范化"用例；
// 3) 行尾 #标签词 形态（空白+#+白名单词）：#tag 是行内即标签手势语义（Obsidian/
//    GitHub 同款）,文本自带该形态时 parse 收为 tags 字段属合法标记侵入而非漂移;
//    ::与[[]]双字符标记随机概率≈0天然豁免,# 单字符概率不可忽略故显式排除,
//    边界行为见下方标签用例（符号词 #$ 不构成标记恒等往返）。
// 另记（2026-09-12 看板模式）：句尾 ` @status` 形态（空白或句首 + @ + 白名单状态词）不构成排除项——
//    它是 parse 识别的合法标记（statusMarkers 前置锚定含句首裸 @）,文本/树自带该形态被收为
//    status 字段属合法标记侵入而非漂移（与 3) 的 #tag 同口径）；随机串自发产出需恰为
//    4-8 个小写字母、概率≈0,定向覆盖见 status describe 的空文本裸形态钉子与 nodeArb 的 status 候选。
const textArb = fc
  .string({ minLength: 0, maxLength: 12 })
  .filter(
    (t) =>
      !t.includes('\n') && !t.includes('\r') && t === t.trim() && !/[ \t][#＃][\p{L}\p{N}_-]+$/u.test(t),
  )

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
    // 备注候选已删(2026-09-06 合并):ZenNode.note 退役,引用块是 body 的合法候选值(见 body 行)
    // 正文候选（2026-09 写作）：'' = 无正文；候选必须是「合法正文块」（parse 能原样还原的
    // 顶层非结构块），行首 #/- 等结构标记排除——与 textArb 排除换行同理，属 md 语义边界。
    // 引用块候选(2026-09-06 合并):顶层引用块原样(含 > 前缀)归 body,恒等往返——
    // 钉住「note 字段不存在仍恒等」,防止备注语义借尸还魂
    // 表格候选（终审 M5）：本仓 remark 未挂 gfm，表格行按段落文本原样还原恒等——
    // 钉住该口径，将来若接 gfm 走真 table 节点，rawBlockText 口径变化在此报警
    body: fc.constantFrom('', '论述段落。', '第一段。\n\n第二段。', '> 引用', '论述。\n\n> 引用块', '```js\nconst x = 1\n```', '| a | b |\n| --- | --- |\n| 1 | 2 |'),
    // 看板模式（2026-09-12）：status 候选——六态 + undefined 加权（weight 7:3 → undefined 概率
    // 70%：多数节点非任务，30% 让 fuzz 真正覆盖 @status 注入/剥除链；undefined 与
    // 「无状态不设字段」口径同构；空文本×status 的裸形态恒等由下方 status describe 的钉子保证）
    status: fc.oneof(
      { weight: 7, arbitrary: fc.constant(undefined) },
      { weight: 3, arbitrary: fc.constantFrom(...TASK_STATUSES) },
    ),
  })

const treeArb = nodeArb(6)

/** '' 与 undefined 同为「无正文」：属性断言前归一化（note 已退役,树层只剩 body 归一） */
const stripEmptyBody = (t: ZenNode): ZenNode => ({
  ...t,
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

test('正文含空字符串的树 roundtrip：空串序列化为无正文块（parse 无 body 键）', () => {
  const tree: ZenNode = {
    text: '根',
    body: '',
    children: [{ text: 'A', body: '论述。', children: [{ text: 'A1', body: '> 引用', children: [] }] }],
  }
  expect(parse(serialize(tree))).toEqual({
    ok: true,
    tree: stripEmptyBody(tree),
    ignoredBlocks: [],
  })
})

test('深层列表项内引用块：归父标题 body，serialize 重排后开-存-开定点恒等', () => {
  // 旧「列表层备注 roundtrip」的改写(2026-09-06 合并):列表项(深度≥7)无正文,
  // 项内引用块剥 > 前缀归最近标题节点 body(宽容不丢);serialize 固定顺序重排到
  // 子结构前,二次 parse 恒等——缩进进项内容列的引用块曾会截断列表,此形态由 parse 侧钉住
  const hand = ['# r', '', '## a', '', '- 项', '', '  > 项内引用', '', '  - 子项', ''].join('\n')
  const once = parse(hand)
  if (!once.ok) return
  expect(once.tree.children[0]?.body).toBe('项内引用')
  expect(once.tree.children[0]?.children[0]?.text).toBe('项')
  expect(once.tree.children[0]?.children[0]?.children[0]?.text).toBe('子项')
  const md = serialize(once.tree)
  expect(parse(md)).toEqual({ ok: true, tree: once.tree, ignoredBlocks: [] }) // 定点:开-存-开不漂移
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

/** 净化（打开语义，stripTreeTexts 的树版）：文本剥离标记，uid 保留（注入查表键） */
const purify = (n: LinkedNode): ZenNode => ({
  text: stripMarkers(n.text),
  children: n.children.map(purify),
  ...(n.uid !== undefined ? { uid: n.uid } : {}),
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

// —— M17 备注即宿主 → 正文即宿主(2026-09-06 合并)：body 含 ```mermaid 围栏的定点 roundtrip ——
// md 事实源零改动的前提证明：正文块原样写回/收回，围栏不剥前缀不转义；一次 parse 后段落与
// 围栏两块按 '\n\n' 归一连接,再 serialize 即定点恒等
test('正文含 mermaid 围栏：parse 原样收进 body，开-存-开定点（mermaid 即宿主 M17 迁移）', () => {
  const hand = ['# 流程节点', '', '先看这段说明', '', '```mermaid', 'graph LR', '  A --> B', '  B --> C', '```', ''].join('\n')
  const once = parse(hand)
  expect(once.ok).toBe(true)
  if (!once.ok) return
  expect(once.tree.body).toBe('先看这段说明\n\n```mermaid\ngraph LR\n  A --> B\n  B --> C\n```')
  const md = serialize(once.tree)
  expect(md).toContain('```mermaid')
  expect(md).toContain('graph LR')
  const twice = parse(md)
  expect(twice.ok).toBe(true)
  if (twice.ok) expect(twice.tree.body).toBe(once.tree.body)
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

// —— 2026-09 正文：serialize 固定顺序回写（节点行 → 正文 → 子结构）+ roundtrip 契约 ——
// 备注合并(2026-09-06)后引用块是正文的合法块类型,顺序钉死不再有独立备注层
test('正文 roundtrip：body(含引用块)+子结构混合，serialize 顺序恒等', () => {
  const tree: ZenNode = {
    text: '根', body: '根的论述。\n\n> 根的引用块',
    children: [{ text: '子', body: '```js\n# 不是标题\n```', children: [] }],
  }
  const md = serialize(tree)
  // 顺序钉死：节点行 → 正文块(原样,含 > 前缀) → 子结构（空行分隔）
  expect(md).toBe('# 根\n根的论述。\n\n> 根的引用块\n\n## 子\n```js\n# 不是标题\n```\n')
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

test('防御：正文内引用行 roundtrip 恒等（I1 引用块归属冲突随 note 退役自然消解）', () => {
  // 旧用例(2026-09-06 前)断言 `> ` 行被判给备注;合并后引用块是正文的合法块类型,
  // serialize 原样写回、parse 原样收回,不再拆走——钉死防备注语义回流
  const tree: ZenNode = { text: 'r', body: '论述。\n\n> 引用', children: [] }
  const r = parse(serialize(tree))
  expect(r).toEqual({ ok: true, tree, ignoredBlocks: [] })
})

test('防御：列表层节点（深度≥7）带 body 时 serialize 抛错，不静默丢内容', () => {
  /** 指定深度构造叶子（终审 M4：原用例只落在深度 8，补 7 的精确边界——首个列表层） */
  const leafAtDepth = (depth: number, body?: string): ZenNode => {
    let node: ZenNode = { text: 'leaf', ...(body !== undefined ? { body } : {}), children: [] }
    for (let i = 1; i < depth; i++) node = { text: `n${i}`, children: [node] }
    return node
  }
  expect(() => serialize(leafAtDepth(7, '深层正文'))).toThrow() // 精确边界：深度 7 = 首个列表层
  expect(() => serialize(leafAtDepth(8, '更深层'))).toThrow()
  expect(() => serialize(leafAtDepth(6, '末级标题正文'))).not.toThrow() // H6 末级标题仍可正文
  expect(() => serialize(leafAtDepth(7))).not.toThrow()
})

// —— 节点标签：句尾 #tag 标记（与 ::icon 同构）——serialize 注入、parse 提取、
//    三标记共存顺序 `文本 #tag ::icon ![alt](src)`、engine 装配 ——
test('标签序列化注入与解析提取（中文/英文，保序去重，roundtrip 恒等）', () => {
  const tree: ZenNode = { text: '买牛奶', tags: ['采购', 'urgent'], children: [] }
  const md = serialize(tree)
  expect(md).toBe('# 买牛奶 #采购 #urgent\n')
  const r = parse(md)
  expect(r).toEqual({ ok: true, tree, ignoredBlocks: [] })
})

test('标签与图标/插图标记共存：行尾固定顺序 `#tag ::icon ![alt](src)` 全还原', () => {
  const tree: ZenNode = {
    text: '节点',
    tags: ['采购'],
    icons: ['flag'],
    image: { src: 'assets/x.png', alt: '配图' },
    children: [],
  }
  const md = serialize(tree)
  expect(md).toBe('# 节点 #采购 ::flag ![配图](assets/x.png)\n')
  const r = parse(md)
  expect(r).toEqual({ ok: true, tree, ignoredBlocks: [] })
})

test('标签空数组不设字段（与 icons 同口径）；手写标记同样生效', () => {
  expect(serialize({ text: 'x', tags: [], children: [] })).toBe('# x\n')
  const r = parse('# x\n')
  if (!r.ok) return
  expect(r.tree.tags).toBeUndefined()
  // 手写 md（不经选择器）与选择器产物同口径（列表层标记同样提取）
  const hand = parse('# 根\n\n- 项 #待处理\n')
  expect(hand).toEqual({
    ok: true,
    tree: { text: '根', children: [{ text: '项', tags: ['待处理'], children: [] }] },
    ignoredBlocks: [],
  })
})

test('标签词白名单：全符号词不构成标记，正文恒等往返（fuzz 排除项边界钉子）', () => {
  // `! #$` 曾是 fuzz 反例（宽容字符类劫持符号词）；白名单后无标签语义、恒等
  const tree: ZenNode = { text: '! #$', children: [] }
  expect(parse(serialize(tree))).toEqual({ ok: true, tree, ignoredBlocks: [] })
})

test('zen→engine：tags 装配 data.tag；engine→zen 宽容回收（字符串与 {text} 对象）', async () => {
  const { zenToEngineTree, engineTreeToZen } = await import('./mdTree')
  const engine = zenToEngineTree({ text: 'n', tags: ['采购'], children: [] })
  expect(engine.data.tag).toEqual(['采购'])
  expect(engineTreeToZen(engine).tree.tags).toEqual(['采购'])
  // {text} 对象形态（引擎 v0.10.3+ tag 格式/外部来源）宽容回收文本
  const objForm = engineTreeToZen({ data: { text: 'n', tag: [{ text: '紧急' }] }, children: [] })
  expect(objForm.tree.tags).toEqual(['紧急'])
  // 非法形态宽容忽略（引擎其他 tag 源不受影响）
  const badForm = engineTreeToZen({ data: { text: 'n', tag: [1, 2] }, children: [] })
  expect(badForm.tree.tags).toBeUndefined()
})

// —— 看板模式：句尾 @status 标记（与 ::icon/#tag 同构）——parse 提取、serialize 注入、
//    六态共存顺序 `文本 #tag ::icon @status ![alt](src)`、未知 @foo 保留为文本 ——
describe('status 标记（看板模式）', () => {
  test('parse 提取 @status 进字段、文本剥除', () => {
    const r = parse('# 根\n## 任务A @doing\n## 任务B\n')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree.children[0]!.status).toBe('doing')
    expect(r.tree.children[0]!.text).toBe('任务A')
    expect(r.tree.children[1]!.status).toBeUndefined()
  })

  test('serialize 注入：status 无则不设、有则句尾 @status（icon 外侧、image 内侧）', () => {
    expect(serialize({ text: '根', status: 'todo', children: [] })).toBe('# 根 @todo\n')
    expect(
      serialize({ text: 'A', children: [], icons: ['flag'], status: 'doing', image: { src: 'a.png', alt: '' } }),
    ).toBe('# A ::flag @doing ![](a.png)\n')
  })

  test('roundtrip 恒等：六态 status 与 tag/icon/image 共存，序列化→parse 往返字段不丢', () => {
    for (const status of TASK_STATUSES) {
      const tree: ZenNode = {
        text: '节点',
        tags: ['采购'],
        icons: ['flag'],
        status,
        image: { src: 'assets/x.png', alt: '配图' },
        children: [],
      }
      const md = serialize(tree)
      expect(md).toBe(`# 节点 #采购 ::flag @${status} ![配图](assets/x.png)\n`)
      expect(parse(md)).toEqual({ ok: true, tree, ignoredBlocks: [] })
    }
  })

  test('未知 @foo 保留为文本（roundtrip 恒等）', () => {
    const r = parse('# 根 @foo\n')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tree.text).toBe('根 @foo')
    const tree: ZenNode = { text: '根 @foo', children: [] }
    expect(parse(serialize(tree))).toEqual({ ok: true, tree, ignoredBlocks: [] })
  })

  test('列表层（深度≥7）status 标记 roundtrip 恒等', () => {
    const deepLeaf = (status: string): ZenNode => {
      let node: ZenNode = { text: 'item', status: status as ZenNode['status'], children: [] }
      for (const t of ['f', 'e', 'd', 'c', 'b', 'a', 'r']) node = { text: t, children: [node] }
      return node
    }
    const tree = deepLeaf('done')
    const md = serialize(tree)
    expect(md).toContain('- item @done\n')
    expect(parse(md)).toEqual({ ok: true, tree, ignoredBlocks: [] })
  })

  test('空文本+status 裸形态恒等：heading 层与列表层 serialize→parse 全树 toEqual；手写 # @todo 归一', () => {
    // Important-1 反例钉子：emitHeading 对空文本+status 产出 `#  @doing`（双空格），
    // headingText 剥 `^#{1,6}\s*` 后成裸 '@doing'——extract/strip 前置锚定统一后才恒等
    const heading: ZenNode = { text: '', status: 'doing', children: [] }
    expect(serialize(heading)).toBe('#  @doing\n')
    expect(parse(serialize(heading))).toEqual({ ok: true, tree: heading, ignoredBlocks: [] })
    // 列表层（深度 7）：`-  @doing` 经 listItemText 剥 `-` 与缩进/空白后同为裸形态
    const listLeaf = (leaf: ZenNode): ZenNode => {
      let node = leaf
      for (const t of ['f', 'e', 'd', 'c', 'b', 'a', 'r']) node = { text: t, children: [node] }
      return node
    }
    const listTree = listLeaf({ text: '', status: 'doing', children: [] })
    expect(serialize(listTree)).toContain('-  @doing\n')
    expect(parse(serialize(listTree))).toEqual({ ok: true, tree: listTree, ignoredBlocks: [] })
    // 手写裸形态：`# @todo`（标题前缀剥除后成裸 @todo）→ 空文本 + status
    expect(parse('# @todo\n')).toEqual({
      ok: true,
      tree: { text: '', status: 'todo', children: [] },
      ignoredBlocks: [],
    })
  })
})

// —— 正文结构行防炸（2026-09-22）：含标题/列表行的正文条件引用包裹，开-存-开不漂移 ——
describe('正文条件引用包裹（结构行防炸）', () => {
  test('贴来的标题/列表留在正文：roundtrip 全恒等且 serialize 字节定点', () => {
    const tree: ZenNode = {
      text: 'r',
      body: '段落。\n\n## 贴来的标题\n\n- 贴来的列表\n\n> 自己的引用',
      children: [],
    }
    const md = serialize(tree)
    expect(md).toContain('\n> ## 贴来的标题\n') // 包裹形态落盘
    const once = parse(md)
    if (!once.ok) throw new Error(once.error)
    expect(once.tree.body).toBe(tree.body) // body 逐字还原
    expect(once.tree.children).toEqual([]) // 不再炸出子节点
    expect(serialize(once.tree)).toBe(md) // 定点：开-存-开不漂移
  })

  test('包装层内嵌套的用户引用 roundtrip 恒等（只剥包装一级）', () => {
    const tree: ZenNode = {
      text: 'r',
      body: '- 要点\n\n> 用户引用\n\n> > 双层引用',
      children: [],
    }
    const once = parse(serialize(tree))
    expect(once).toMatchObject({ ok: true })
    if (!once.ok) return
    expect(once.tree.body).toBe(tree.body)
  })
})
