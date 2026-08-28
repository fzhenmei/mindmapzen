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
})
