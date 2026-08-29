import fc from 'fast-check'
import { expect, test } from 'vitest'
import { parse, serialize } from './mdTree'
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

// brief 原文的 letrec 写法在 fast-check v4 下不会自动限深(深度控制需在 oneof 上配 depthSize),
// fc.array(tie('node')) 会无限递归栈溢出,故改为显式深度封顶的标准写法。
// 封顶 6 层:根为 H1、子节点依次至 H6,不触发列表层(列表层由下方手工深层用例覆盖)。
// 子节点上限取 brief 重复键 { maxLength: 3, maxLength: 12 } 的首个值 3:
// 12 会让 6 层树最坏膨胀到 12^5≈25 万节点,实测直接打挂 vitest worker。
const nodeArb = (maxDepth: number): fc.Arbitrary<ZenNode> =>
  fc.record({
    text: textArb,
    children:
      maxDepth <= 1
        ? fc.constant<ZenNode[]>([])
        : fc.array(nodeArb(maxDepth - 1), { maxLength: 3 }),
    // 备注候选（brief）：'' 须序列化为无引用块（parse 侧还原为无 note 键），比较前归一化掉
    note: fc.constantFrom('', '备注', '多\n行'),
  })

const treeArb = nodeArb(6)

/** '' 与 undefined 同为「无备注」：属性断言前归一化（toEqual 视缺键与 undefined 等价） */
const stripEmptyNote = (t: ZenNode): ZenNode => ({
  ...t,
  note: t.note === '' ? undefined : t.note,
  children: t.children.map(stripEmptyNote),
})

test('parse(serialize(tree)) 结构恒等（500 例，深度≤6 时全走标题）', () => {
  fc.assert(
    fc.property(treeArb, (tree) => {
      const r = parse(serialize(tree))
      expect(r).toEqual({ ok: true, tree: stripEmptyNote(tree), ignoredBlocks: [] })
    }),
    { numRuns: 500 },
  )
})

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
