import { describe, expect, test } from 'vitest'
import { buildRegistry, registryToLinks, stripTreeTexts } from './linkRegistry'
import type { EngineNode } from '../types/engine'

/** 样例引擎树：u1 含两个标记（一命中一无命中），u2/u3 无标记 */
const makeTree = (): EngineNode => ({
  data: { text: '根', uid: 'u0' },
  children: [
    { data: { text: 'A 见 [[B]] 与 [[无此名]]', uid: 'u1' }, children: [] },
    { data: { text: 'B', uid: 'u2' }, children: [] },
    { data: { text: 'C', uid: 'u3' }, children: [] },
  ],
})

describe('buildRegistry', () => {
  test('遍历建表：uid → extractTargets(text)，无标记节点不建条目', () => {
    const reg = buildRegistry(makeTree())
    expect(reg.byUid.size).toBe(1)
    expect(reg.byUid.get('u1')).toEqual(['B', '无此名'])
  })

  test('重复标记去重；无 uid 节点跳过（防御，引擎真实数据必有 uid）', () => {
    const tree: EngineNode = {
      data: { text: '根', uid: 'u0' },
      children: [{ data: { text: '[[dup]] [[dup]]' }, children: [] }],
    }
    expect(buildRegistry(tree).byUid.size).toBe(0)
    expect(buildRegistry({ ...tree, children: [{ data: { text: '[[dup]] [[dup]]', uid: 'x' }, children: [] }] }).byUid.get('x')).toEqual(['dup'])
  })

  test('传入 into 时合并（并集去重）：收割手写标记不冲掉桥接已 push 的目标', () => {
    const tree: EngineNode = {
      data: { text: '根', uid: 'u0' },
      children: [{ data: { text: 'A [[C]]', uid: 'u1' }, children: [] }],
    }
    const reg = buildRegistry(tree)
    reg.byUid.set('u1', ['B', 'C'])
    buildRegistry(tree, reg)
    expect(reg.byUid.get('u1')).toEqual(['B', 'C'])
    reg.byUid.set('u1', ['B'])
    buildRegistry(tree, reg)
    expect(reg.byUid.get('u1')).toEqual(['B', 'C'])
  })
})

describe('stripTreeTexts', () => {
  test('直写剥离含标记节点的 data.text，无标记节点不动', () => {
    const tree = makeTree()
    stripTreeTexts(tree)
    expect(tree.children![0]!.data.text).toBe('A 见 与')
    expect(tree.data.text).toBe('根')
    expect(tree.children![1]!.data.text).toBe('B')
  })
})

describe('registryToLinks', () => {
  test('唯一命中解析为树内路径（复用 resolveLinks 语义，源取 uid 节点全路径）', () => {
    const tree = makeTree()
    const reg = buildRegistry(tree)
    stripTreeTexts(tree)
    expect(registryToLinks(tree, reg)).toEqual([{ fromPath: '/根/A 见 与', toPath: '/根/B' }])
  })

  test('零命中丢弃；uid 失联（节点已删）自然消失', () => {
    const tree: EngineNode = { data: { text: '根', uid: 'u0' }, children: [{ data: { text: 'B', uid: 'u2' }, children: [] }] }
    const reg = buildRegistry(makeTree())
    stripTreeTexts(tree)
    // '无此名' 零命中；'u1' 已不在树中：两条都不出线
    expect(registryToLinks(tree, reg)).toEqual([])
  })

  test('/全路径 形式按路径精确命中', () => {
    const tree = makeTree()
    const reg = buildRegistry(tree)
    reg.byUid.set('u1', ['/根/C'])
    stripTreeTexts(tree)
    expect(registryToLinks(tree, reg)).toEqual([{ fromPath: '/根/A 见 与', toPath: '/根/C' }])
  })
})
