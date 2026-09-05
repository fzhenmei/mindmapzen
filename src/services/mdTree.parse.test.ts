import { describe, expect, test } from 'vitest'
import { parse, serialize } from './mdTree'
import type { ZenNode } from '../types/tree'

const n = (text: string, children: ZenNode[] = []): ZenNode => ({ text, children })

describe('parse', () => {
  test('规范文档解析还原树', () => {
    const r = parse('# 根\n\n## A\n\n### A1\n')
    expect(r).toEqual({ ok: true, tree: n('根', [n('A', [n('A1')])]), ignoredBlocks: [] })
  })

  test('深度 7 起的列表解析还原', () => {
    const r = parse('# 根\n\n## A\n\n### A1\n\n#### A2\n\n##### A3\n\n###### A4\n- A5\n  - A6\n')
    expect(r.ok && r.tree).toEqual(
      n('根', [n('A', [n('A1', [n('A2', [n('A3', [n('A4', [n('A5', [n('A6')])])])])])])]),
    )
  })

  test('第一个 H1 为根，多余 H1 视为一级子节点', () => {
    const r = parse('# 根\n\n# 另一个\n\n## B\n')
    expect(r.ok && r.tree).toEqual(n('根', [n('另一个', [n('B')])]))
  })

  test('标题层级跳跃挂到最近较浅标题', () => {
    const r = parse('# 根\n\n## A\n\n#### 跳级\n')
    expect(r.ok && r.tree).toEqual(n('根', [n('A', [n('跳级')])]))
  })

  test('无 H1 报错且不抛异常', () => {
    expect(parse('## 只有二级\n')).toEqual({
      ok: false,
      error: '未找到根标题（缺少一级标题 H1）',
    })
    expect(parse('')).toEqual({ ok: false, error: '未找到根标题（缺少一级标题 H1）' })
  })

  test('根 H1 之前的段落/代码块无归属收进 ignoredBlocks', () => {
    const r = parse('一段说明文字。\n\n```js\ncode()\n```\n\n# 根\n')
    expect(r.ok && r.ignoredBlocks.map((b) => b.type)).toEqual(['paragraph', 'code'])
    expect(r.ok && r.ignoredBlocks[0].excerpt).toBe('一段说明文字。')
  })

  test('浅层标题下的列表项视为其子节点（宽容）', () => {
    const r = parse('# 根\n\n## A\n- x\n- y\n  - z\n')
    expect(r.ok && r.tree).toEqual(n('根', [n('A', [n('x'), n('y', [n('z')])])]))
  })

  test('列表项转义还原', () => {
    const tree = n('根', [n('A', [n('A1', [n('A2', [n('A3', [n('A4', [n('- x')])])])])])])
    const r = parse(serialize(tree))
    expect(r.ok && r.tree).toEqual(tree)
  })

  test('行内 markdown 标记原样保留', () => {
    const r = parse('# 根\n\n## **加粗** 与 `代码`\n')
    expect(r.ok && r.tree.children[0].text).toBe('**加粗** 与 `代码`')
  })

  test('引用块归属上方最近节点', () => {
    const r = parse('# 根\n\n## A\n> 备注\n')
    expect(r.ok && r.tree.children[0].note).toBe('备注')
  })

  test('文档级引用块（无上方节点）进忽略块', () => {
    const r = parse('> 孤儿引用\n\n# 根\n')
    expect(r.ok && r.ignoredBlocks.map((b) => b.type)).toContain('blockquote')
  })

  test('列表项后的引用块归属该列表项', () => {
    const r = parse('# 根\n\n## A\n- x\n> 尾注\n')
    expect(r.ok && r.tree.children[0].children![0].note).toBe('尾注')
  })

  test('缩进进列表项的引用块归属该项（有子项时的序列化形态）', () => {
    const r = parse('# 根\n\n## A\n- x\n  > 尾注\n  - sub\n')
    expect(r.ok && r.tree.children[0].children![0].note).toBe('尾注')
    expect(r.ok && r.tree.children[0].children![0].children.map((c) => c.text)).toEqual(['sub'])
  })

  test('多行引用块保留换行与原文（含空行与嵌套 > 前缀）', () => {
    const r = parse('# 根\n\n## A\n> 第一行\n> 第二行\n')
    expect(r.ok && r.tree.children[0].note).toBe('第一行\n第二行')
    const r2 = parse('# 根\n\n## A\n> > 原样\n>\n> 尾行\n')
    expect(r2.ok && r2.tree.children[0].note).toBe('> 原样\n\n尾行')
  })

  // ---- 正文(2026-09 写作):标题下非结构块收进 body ----
  test('正文:标题下段落收进该节点 body,列表/引用块行为不变', () => {
    const md = ['# 根', '', '根的论述段落。', '', '## 子', '', '子的论述一。', '', '子的论述二。', '', '- 列表子节点', '', '> 备注照旧', ''].join('\n')
    const r = parse(md)
    expect(r).toMatchObject({ ok: true })
    if (!r.ok) return
    expect(r.tree.body).toBe('根的论述段落。')
    const child = r.tree.children[0]!
    expect(child.body).toBe('子的论述一。\n\n子的论述二。') // 多块 '\n\n' 连接
    expect(child.children[0]?.text).toBe('列表子节点') // 列表仍是子节点
    expect(r.ignoredBlocks).toEqual([]) // 段落不再进 ignored
  })

  test('正文:代码块原样收进 body(内部 #/- 行不受结构解析影响)', () => {
    const md = ['# 根', '', '```js', '# 注释不是标题', '- 也不是列表', 'const x = 1', '```', ''].join('\n')
    const r = parse(md)
    if (!r.ok) return
    expect(r.tree.body).toBe('```js\n# 注释不是标题\n- 也不是列表\nconst x = 1\n```')
  })

  test('正文:子结构之后又出现的段落宽容追加进最近标题节点', () => {
    const md = ['# 根', '', '## 子', '', '- 项', '', '列表之后的段落。', ''].join('\n')
    const r = parse(md)
    if (!r.ok) return
    const child = r.tree.children[0]!
    expect(child.children[0]?.text).toBe('项')
    expect(child.body).toBe('列表之后的段落。')
  })

  test('正文:根 H1 之前的块无归属仍进 ignored;表格收进 body', () => {
    const md = ['前置段落', '', '# 根', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', ''].join('\n')
    const r = parse(md)
    if (!r.ok) return
    expect(r.ignoredBlocks).toEqual([{ type: 'paragraph', excerpt: '前置段落' }])
    expect(r.tree.body).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
  })
})
