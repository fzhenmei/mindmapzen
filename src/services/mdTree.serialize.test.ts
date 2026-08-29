import { describe, expect, test } from 'vitest'
import { serialize } from './mdTree'
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

  test('节点备注输出引用块（标题行后逐行 > 前缀，先于子节点）', () => {
    const tree: ZenNode = { text: '根', children: [{ text: 'A', note: '第一行\n第二行', children: [] }] }
    expect(serialize(tree)).toBe('# 根\n\n## A\n> 第一行\n> 第二行\n')
  })

  test('无备注不产出引用块；空字符串视为无备注', () => {
    expect(serialize({ text: '根', note: '', children: [] })).toBe('# 根\n')
  })

  test('列表项备注输出缩进引用块（归入该项内容，避免截断其嵌套列表）', () => {
    const tree: ZenNode = {
      text: '根',
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
                            { text: 'item', note: '项\n注', children: [{ text: 'sub', children: [] }] },
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
    expect(serialize(tree)).toContain('- item\n  > 项\n  > 注\n  - sub\n')
  })

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
