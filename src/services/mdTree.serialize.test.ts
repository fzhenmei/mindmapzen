import { describe, expect, test } from 'vitest'
import { mdBodyUnwrapForDisplay, serialize } from './mdTree'
import type { ZenNode } from '../types/tree'

const n = (text: string, children: ZenNode[] = []): ZenNode => ({ text, children })

describe('serialize', () => {
  test('深度 1-6 映射为 H1-H6', () => {
    const tree = n('根', [n('A', [n('A1', [n('A1a')])])])
    expect(serialize(tree)).toBe('# 根\n\n## A\n\n### A1\n\n#### A1a\n')
  })

  test('深度 7 起转为深度 6 节点下的嵌套无序列表', () => {
    const tree = n('根', [n('A', [n('A1', [n('A2', [n('A3', [n('A4', [n('A5', [n('A6')])])])])])])])
    expect(serialize(tree)).toBe('# 根\n\n## A\n\n### A1\n\n#### A2\n\n##### A3\n\n###### A4\n- A5\n  - A6\n')
  })

  test('列表项文本以列表标记/#/> 开头时转义', () => {
    const tree = n('根', [n('A', [n('A1', [n('A2', [n('A3', [n('A4', [n('- x', [n('# y')])])])])])])])
    expect(serialize(tree)).toContain('\\- x')
    expect(serialize(tree)).toContain('\\# y')
  })

  test('空文本节点输出无文本标题', () => {
    expect(serialize(n(''))).toBe('#\n')
  })

  test('序列化确定性', () => {
    const tree = n('根', [n('A'), n('B', [n('B1')])])
    expect(serialize(tree)).toBe(serialize(tree))
  })

  test('正文原样输出（引用块保持 > 前缀，节点行后、先于子节点）', () => {
    const tree: ZenNode = { text: '根', children: [{ text: 'A', body: '第一段。\n\n> 引用行', children: [] }] }
    expect(serialize(tree)).toBe('# 根\n\n## A\n第一段。\n\n> 引用行\n')
  })

  test('无正文不产出正文块；空字符串视为无正文', () => {
    expect(serialize({ text: '根', body: '', children: [] })).toBe('# 根\n')
  })

  // 旧「列表项备注输出缩进引用块」用例已删(2026-09-06 合并):列表项(深度≥7)无正文,
  // serialize 不再产出项内引用块;项内引用块的 parse 归属与定点恒等
  // 见 mdTree.parse.test.ts「列表项内引用块」与 mdTree.roundtrip.test.ts「深层列表项内引用块」
  // 深层节点带 body 的防御由 roundtrip 测试「列表层节点(深度≥7)带 body 时 serialize 抛错」钉住

  test('节点文本含 \\n 或 \\r 时抛中文错误拒绝序列化（拒绝静默产出损坏 md）', () => {
    expect(() => serialize(n('根', [n('第一行\n第二行')]))).toThrow(
      '节点文本包含换行，暂不支持多行文本：第一行\n第二行…',
    )
    expect(() => serialize(n('根', [n('子', [n('a\rb')])]))).toThrow('节点文本包含换行')
  })

  test('不含换行的正常树仍可序列化', () => {
    const tree = n('根', [n('A', [n('A1')])])
    expect(serialize(tree)).toBe('# 根\n\n## A\n\n### A1\n')
  })
})

describe('serialize linksByUid（M5d Task 2：序列化注入）', () => {
  test('按 node.uid 查表句尾注入（多目标依次追加，列表项同样生效）', () => {
    const heading: ZenNode = { text: '根', uid: 'u0', children: [{ text: 'A', uid: 'u1', children: [] }] }
    expect(serialize(heading, new Map([['u1', ['B', 'C']]]))).toBe('# 根\n\n## A [[B]] [[C]]\n')
    const deep = n('根', [n('a', [n('b', [n('c', [n('d', [n('e', [n('f', [n('item')])])])])])])])
    const item = deep.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!
    item.uid = 'u9'
    expect(serialize(deep, new Map([['u9', ['X']]]))).toContain('  - item [[X]]\n')
  })

  test('文本已含的目标不重复注入（会话内手写标记场景：md 原样保留）', () => {
    const tree: ZenNode = { text: '根', children: [{ text: 'A [[B]] 见', uid: 'u1', children: [] }] }
    expect(serialize(tree, new Map([['u1', ['B']]]))).toBe('# 根\n\n## A [[B]] 见\n')
  })

  test('参数缺省 / 空表 / uid 未命中：原样序列化', () => {
    const tree: ZenNode = { text: '根', children: [{ text: 'A', uid: 'u1', children: [] }] }
    expect(serialize(tree)).toBe('# 根\n\n## A\n')
    expect(serialize(tree, new Map())).toBe('# 根\n\n## A\n')
    expect(serialize(tree, new Map([['other', ['B']]]))).toBe('# 根\n\n## A\n')
  })
})

describe('serialize 正文条件引用包裹（2026-09-22 结构行防炸：非必要不加 >）', () => {
  const b = (body: string): ZenNode => ({ text: '根', children: [{ text: 'A', body, children: [] }] })

  test('正文含 ATX 标题行：整段正文加一级 > 前缀（空行变裸 >）', () => {
    expect(serialize(b('第一段。\n\n## 小标题\n\n第二段。'))).toBe(
      '# 根\n\n## A\n> 第一段。\n>\n> ## 小标题\n>\n> 第二段。\n',
    )
  })

  test('正文含裸列表行（无序/有序/裸标记）同样触发包裹', () => {
    expect(serialize(b('引言\n\n- 要点\n\n1. 第一'))).toBe(
      '# 根\n\n## A\n> 引言\n>\n> - 要点\n>\n> 1. 第一\n',
    )
    expect(serialize(b('二\n\n*'))).toContain('\n> *\n')
  })

  test('setext 下划线紧贴上一行触发包裹；隔空行的 --- 分隔线不触发（字节同今天）', () => {
    expect(serialize(b('标题行\n==='))).toBe('# 根\n\n## A\n> 标题行\n> ===\n')
    expect(serialize(b('上文\n\n---\n\n下文'))).toBe('# 根\n\n## A\n上文\n\n---\n\n下文\n')
  })

  test('代码围栏内的 #/- 行不触发包裹（字节同今天）', () => {
    const body = '```js\n# 注释\n- 也不是列表\n```\n\n收尾段。'
    expect(serialize(b(body))).toBe('# 根\n\n## A\n' + body + '\n')
  })

  test('正文自带的引用行在包裹后保留一级前缀（用户引用不丢）', () => {
    expect(serialize(b('- 要点\n\n> 用户引用'))).toBe('# 根\n\n## A\n> - 要点\n>\n> > 用户引用\n')
  })

  test('display 形态：含结构行的正文也原样输出（渲染/外发用）', () => {
    expect(serialize(b('第一段。\n\n## 小标题\n\n第二段。'), undefined, { display: true })).toBe(
      '# 根\n\n## A\n第一段。\n\n## 小标题\n\n第二段。\n',
    )
  })
})

describe('mdBodyUnwrapForDisplay（读文件渲染的显示转换：剥包装层，用户引用不动）', () => {
  test('包装层剥回裸正文（贴来的标题按标题渲染，不是引用）', () => {
    const md = '# 根\n\n## A\n> 第一段。\n>\n> ## 小标题\n>\n> 第二段。\n'
    expect(mdBodyUnwrapForDisplay(md)).toBe('# 根\n\n## A\n第一段。\n\n## 小标题\n\n第二段。\n')
  })

  test('干净文件逐字节相同（用户引用、代码块、列表结构全部原样）', () => {
    const md = [
      '# 根', '', '## A', '段落。', '', '> 用户引用', '', '> 引用里的 - 短横不是结构', '',
      '```js', '> 也不是引用', '```', '', '- 子节点', '',
    ].join('\n')
    expect(mdBodyUnwrapForDisplay(md)).toBe(md)
  })

  test('列表项内缩进引用不动（那是项内容，不是包装层）', () => {
    const md = '# r\n\n## a\n- 项\n  > 项内引用\n'
    expect(mdBodyUnwrapForDisplay(md)).toBe(md)
  })

  test('列 0 引用包结构与 parse 同口径：剥（旧文件一次性例外的一致性）', () => {
    expect(mdBodyUnwrapForDisplay('# 根\n\n## A\n> - 项\n')).toBe('# 根\n\n## A\n- 项\n')
  })
})

describe('serialize status（看板模式：句尾 @status 注入）', () => {
  test('status 与 tag 共存：行尾固定顺序 `#tag @status`（tag 内侧 status 外侧）', () => {
    const tree: ZenNode = { text: '买牛奶', tags: ['采购'], status: 'doing', children: [] }
    expect(serialize(tree)).toBe('# 买牛奶 #采购 @doing\n')
  })

  test('列表项同样注入；status 与连线标记共存时 @status 在 [[..]] 外侧', () => {
    const deep = n('根', [n('a', [n('b', [n('c', [n('d', [n('e', [n('f', [n('item')])])])])])])])
    const item = deep.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!
    item.status = 'blocked'
    item.uid = 'u9'
    expect(serialize(deep, new Map([['u9', ['X']]]))).toContain('  - item [[X]] @blocked\n')
  })
})
