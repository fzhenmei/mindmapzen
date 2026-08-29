import { describe, expect, test } from 'vitest'
import { buildRegistry, harvestRegistry, registryToLinks, stripTreeTexts } from './linkRegistry'
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

describe('harvestRegistry（v0.7.0 删线修复：引擎现态权威，替换语义）', () => {
  /** 引擎 targets 样例：A 连 B 与 C（净化会话——文本无标记，连线数据只在引擎层） */
  const targetsTree = (): EngineNode => ({
    data: { text: '根', uid: 'u0' },
    children: [
      { data: { text: 'A', uid: 'u1', associativeLineTargets: ['u2', 'u3'] }, children: [] },
      { data: { text: 'B', uid: 'u2' }, children: [] },
      { data: { text: 'C', uid: 'u3' }, children: [] },
    ],
  })

  test('引擎 targets 经 uid→名解析建表', () => {
    const reg = harvestRegistry(targetsTree(), { byUid: new Map() })
    expect(reg.byUid.get('u1')).toEqual(['B', 'C'])
    expect(reg.byUid.size).toBe(1) // 无连线节点不建条目
  })

  test('替换而非并集：引擎已无的条目（已删线/已删源）不残留', () => {
    const reg = buildRegistry(makeTree()) // 预置陈旧条目：u1 → ['B', '无此名']
    harvestRegistry(targetsTree(), reg)
    expect(reg.byUid.get('u1')).toEqual(['B', 'C']) // u1 条目被引擎现态整体替换
    // 目标删尽（removeLine 留空数组）：条目自然消失，md 不再注入（删线不复活的根）
    const pruned: EngineNode = {
      data: { text: '根', uid: 'u0' },
      children: [
        { data: { text: 'A', uid: 'u1', associativeLineTargets: [] }, children: [] },
        { data: { text: 'B', uid: 'u2' }, children: [] },
      ],
    }
    harvestRegistry(pruned, reg)
    expect(reg.byUid.size).toBe(0)
  })

  test('目标 uid 失联（节点已删）丢弃；自环跳过', () => {
    const tree: EngineNode = {
      data: { text: '根', uid: 'u0' },
      children: [
        { data: { text: 'A', uid: 'u1', associativeLineTargets: ['ghost-uid', 'u1', 'u2'] }, children: [] },
        { data: { text: 'B', uid: 'u2' }, children: [] },
      ],
    }
    expect(harvestRegistry(tree, { byUid: new Map() }).byUid.get('u1')).toEqual(['B'])
  })

  test('文本残留标记一并收割（会话内手写）并与引擎 targets 去重', () => {
    const tree: EngineNode = {
      data: { text: '根', uid: 'u0' },
      children: [
        { data: { text: 'A [[C]]', uid: 'u1', associativeLineTargets: ['u2'] }, children: [] },
        { data: { text: 'B', uid: 'u2' }, children: [] },
        { data: { text: 'C', uid: 'u3' }, children: [] },
      ],
    }
    expect(harvestRegistry(tree, { byUid: new Map() }).byUid.get('u1')).toEqual(['B', 'C'])
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
