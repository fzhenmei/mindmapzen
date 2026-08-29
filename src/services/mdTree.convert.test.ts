import { describe, expect, test } from 'vitest'
import { engineTreeToZen, zenToEngineTree } from './mdTree'
import type { ZenNode } from '../types/tree'
import type { EngineNode } from '../types/engine'

const n = (text: string, children: ZenNode[] = []): ZenNode => ({ text, children })

describe('zen ⇄ engine 转换', () => {
  test('zen→engine：默认展开', () => {
    expect(zenToEngineTree(n('根', [n('A')]))).toEqual({
      data: { text: '根', expand: true },
      children: [{ data: { text: 'A', expand: true }, children: [] }],
    })
  })

  test('zen→engine：折叠路径集合生效', () => {
    const tree = n('根', [n('A', [n('A1')])])
    const eng = zenToEngineTree(tree, new Set(['/根/A']))
    expect(eng.children![0].data.expand).toBe(false)
    expect(eng.children![0].children![0].data.expand).toBe(true) // 子节点仍默认展开
  })

  test('engine→zen：还原树并收集折叠路径', () => {
    const eng: EngineNode = {
      data: { text: '根', expand: true },
      children: [{ data: { text: 'A', expand: false, uid: 'x' }, children: [{ data: { text: 'A1', expand: true }, children: [] }] }],
    }
    const r = engineTreeToZen(eng)
    expect(r.tree).toEqual(n('根', [n('A', [n('A1')])]))
    expect(r.collapsed).toEqual(['/根/A'])
  })

  test('engine→zen：children 缺省按空处理', () => {
    expect(engineTreeToZen({ data: { text: 'r' } }).tree).toEqual(n('r'))
  })

  test('zen→engine：note 透传进 data（undefined 不设键）', () => {
    const eng = zenToEngineTree(n('根', [{ text: 'A', note: '备注', children: [] }]))
    expect(eng.children![0].data.note).toBe('备注')
    expect('note' in eng.data).toBe(false) // 根无 note：不设键而非 undefined 值
  })

  test('engine→zen：收集 data.note（仅字符串，其余视为无备注）', () => {
    const eng: EngineNode = {
      data: { text: '根' },
      children: [
        { data: { text: 'A', note: '备注' }, children: [] },
        { data: { text: 'B', note: 42 }, children: [] },
        { data: { text: 'C', note: undefined }, children: [] },
      ],
    }
    const r = engineTreeToZen(eng)
    expect(r.tree.children[0].note).toBe('备注')
    expect('note' in r.tree.children[1]).toBe(false)
    expect('note' in r.tree.children[2]).toBe(false)
  })
})
