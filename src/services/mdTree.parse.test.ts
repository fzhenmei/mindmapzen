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

  // ---- 备注合并(2026-09-06):引用块归正文,原样保留 ----
  test('引用块归正文:顶层引用块原样(含 > 前缀)收进最近标题节点 body', () => {
    const md = ['# 根', '', '> 引用内容', '', '## 子', '', '论述。', '', '> 子的引用', ''].join('\n')
    const r = parse(md)
    expect(r).toMatchObject({ ok: true })
    if (!r.ok) return
    expect(r.tree.body).toBe('> 引用内容')
    expect(r.tree.children[0]?.body).toBe('论述。\n\n> 子的引用')
    expect(r.ignoredBlocks).toEqual([])
  })

  test('引用块归正文:roundtrip 恒等(serialize 原样写回,parse 原样收回)', () => {
    const tree: ZenNode = { text: 'r', body: '论述。\n\n> 引用块\n\n> 第二段引用', children: [] }
    expect(parse(serialize(tree))).toEqual({ ok: true, tree, ignoredBlocks: [] })
  })

  test('引用块归正文:根 H1 之前的引用块无归属仍进 ignored', () => {
    const md = ['> 前置引用', '', '# 根', ''].join('\n')
    const r = parse(md)
    if (!r.ok) return
    expect(r.ignoredBlocks).toEqual([{ type: 'blockquote', excerpt: '前置引用' }])
  })

  test('列表项内引用块:剥 > 前缀归最近标题节点 body(列表项 v1 无正文,宽容不丢)', () => {
    // 深度 7 列表项内引用块 → 父标题 body;serialize 重排到子结构前,二次 roundtrip 恒等
    const deep = ['# r', '', '## a', '', '- 项', '', '  > 项内引用', ''].join('\n')
    const once = parse(deep)
    if (!once.ok) return
    expect(once.tree.children[0]?.body).toBe('项内引用') // blockquoteText 剥前缀剥缩进
    const md = serialize(once.tree)
    const twice = parse(md)
    if (!twice.ok) return
    expect(twice.tree.children[0]?.body).toBe('项内引用')
    expect(serialize(twice.tree)).toBe(md) // 定点:开-存-开不漂移
  })

  test('列表项后的顶层引用块(未缩进)同样归最近标题节点 body', () => {
    // 列表块结束后回到顶层的引用块:与标题下引用块同等待遇(remark 视为顶层块,不属列表项)
    const r = parse('# 根\n\n## A\n- x\n> 尾注\n')
    expect(r.ok && r.tree.children[0].body).toBe('> 尾注')
    expect(r.ok && r.tree.children[0].children![0].text).toBe('x')
  })

  test('多行引用块原样进 body(换行/空行/嵌套 > 前缀逐字保留)', () => {
    const r = parse('# 根\n\n## A\n> 第一行\n> 第二行\n')
    expect(r.ok && r.tree.children[0].body).toBe('> 第一行\n> 第二行')
    const r2 = parse('# 根\n\n## A\n> > 原样\n>\n> 尾行\n')
    expect(r2.ok && r2.tree.children[0].body).toBe('> > 原样\n>\n> 尾行')
  })

  // ---- 正文(2026-09 写作):标题下非结构块收进 body ----
  test('正文:标题下段落收进该节点 body,引用块同为正文块(2026-09-06 合并)', () => {
    const md = ['# 根', '', '根的论述段落。', '', '## 子', '', '子的论述一。', '', '子的论述二。', '', '- 列表子节点', '', '> 引用块归正文', ''].join('\n')
    const r = parse(md)
    expect(r).toMatchObject({ ok: true })
    if (!r.ok) return
    expect(r.tree.body).toBe('根的论述段落。')
    const child = r.tree.children[0]!
    expect(child.body).toBe('子的论述一。\n\n子的论述二。\n\n> 引用块归正文') // 多块 '\n\n' 连接,引用块原样
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

  // ---- 看板模式:句尾 @status 标记提取(与 ::icon/#tag 同构) ----
  test('状态标记:句尾 @status 提取进 status 字段,文本剥除(标题与列表项同口径)', () => {
    const r = parse('# 根 @todo\n\n## 任务A @doing\n\n- 项 @blocked\n')
    expect(r.ok && r.tree.status).toBe('todo')
    expect(r.ok && r.tree.text).toBe('根')
    expect(r.ok && r.tree.children[0].status).toBe('doing')
    expect(r.ok && r.tree.children[0].text).toBe('任务A')
    expect(r.ok && r.tree.children[0].children![0].status).toBe('blocked')
    expect(r.ok && r.tree.children[0].children![0].text).toBe('项')
  })

  test('状态标记:五态白名单全覆盖,无状态字段不设', () => {
    const r = parse('# 根\n\n- a @todo\n- b @doing\n- c @blocked\n- d @done\n- e @dropped\n- f\n')
    expect(r.ok && r.tree.children.map((c) => c.status)).toEqual([
      'todo',
      'doing',
      'blocked',
      'done',
      'dropped',
      undefined,
    ])
  })

  test('状态标记:句中 @ 不受影响,仅行尾白名单词构成标记;未知 @foo 保留为文本', () => {
    const r = parse('# 提 @doing 问 @todo\n\n## 备注 @foo\n')
    expect(r.ok && r.tree.status).toBe('todo') // 多个只认最后一个
    expect(r.ok && r.tree.text).toBe('提 @doing 问')
    expect(r.ok && r.tree.children[0].status).toBeUndefined()
    expect(r.ok && r.tree.children[0].text).toBe('备注 @foo')
  })
})
