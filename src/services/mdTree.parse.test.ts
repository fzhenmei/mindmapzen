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

  test('段落/代码块收进 ignoredBlocks', () => {
    const r = parse('# 根\n\n一段说明文字。\n\n```js\ncode()\n```\n\n## A\n')
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
})
