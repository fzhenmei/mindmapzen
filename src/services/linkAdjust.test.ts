import { describe, expect, test } from 'vitest'
import {
  adjustEntryToPair,
  adjustKey,
  collectLinkAdjust,
  normalizeEngineOffsets,
  resolveLinkOffsets,
} from './linkAdjust'
import type { EngineNode } from '../types/engine'

/** 引擎口径样例树：A→B、A→C 两线，A 节点 data 上 targets（uid 数组）与 offsets（索引对齐数组） */
const makeTree = (): EngineNode => ({
  data: { text: '根', uid: 'u0' },
  children: [
    {
      data: {
        text: 'A',
        uid: 'u1',
        associativeLineTargets: ['u2', 'u3'],
        associativeLineTargetControlOffsets: [
          [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
          [
            { x: 5, y: 6 },
            { x: 7, y: 8 },
          ],
        ],
      },
      children: [],
    },
    { data: { text: 'B', uid: 'u2' }, children: [] },
    { data: { text: 'C', uid: 'u3' }, children: [] },
  ],
})

describe('adjustKey', () => {
  test('路径对键 /源->/目标', () => {
    expect(adjustKey('/根/A', '/根/B')).toBe('/根/A->/根/B')
  })
})

describe('collectLinkAdjust（采集：引擎树 → sidecar 键值）', () => {
  test('targets+offsets 对齐采集为路径对键', () => {
    expect(collectLinkAdjust(makeTree())).toEqual({
      '/根/A->/根/B': { cx1: 1, cy1: 2, cx2: 3, cy2: 4 },
      '/根/A->/根/C': { cx1: 5, cy1: 6, cx2: 7, cy2: 8 },
    })
  })

  test('改名后旧键自然失联消失、新键接位（路径寻址语义）', () => {
    const tree = makeTree()
    tree.children![1]!.data.text = 'B 改名'
    expect(collectLinkAdjust(tree)).toEqual({
      '/根/A->/根/B 改名': { cx1: 1, cy1: 2, cx2: 3, cy2: 4 },
      '/根/A->/根/C': { cx1: 5, cy1: 6, cx2: 7, cy2: 8 },
    })
  })

  test('目标 uid 失联（节点已删）与 offsets 空洞（未拖弯）均跳过', () => {
    const tree = makeTree()
    // C 节点删除：targets 残留 u3 但树中无节点 → 该线键不采集
    tree.children = [tree.children![0]!, tree.children![1]!]
    // B 线 offsets 挖空（未拖弯的线）→ 同样不采集
    const a = tree.children![0]!.data as unknown as { associativeLineTargetControlOffsets: unknown[] }
    a.associativeLineTargetControlOffsets[0] = undefined
    expect(collectLinkAdjust(tree)).toEqual({})
  })

  test('无连线数据的树采集为空对象；非有限数字条目丢弃', () => {
    expect(collectLinkAdjust({ data: { text: '根' }, children: [] })).toEqual({})
    const tree = makeTree()
    const a = tree.children![0]!.data as unknown as { associativeLineTargetControlOffsets: unknown[] }
    a.associativeLineTargetControlOffsets = [
      [
        { x: Number.NaN, y: 2 },
        { x: 3, y: 4 },
      ],
    ]
    expect(collectLinkAdjust(tree)).toEqual({})
  })
})

describe('normalizeEngineOffsets（引擎原生差值条目校验）', () => {
  test('合法双点差值原样返回', () => {
    expect(normalizeEngineOffsets([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ])
  })
  test('非数组/长度不足/成员非有限数字 → undefined', () => {
    expect(normalizeEngineOffsets(undefined)).toBeUndefined()
    expect(normalizeEngineOffsets('x')).toBeUndefined()
    expect(normalizeEngineOffsets([{ x: 1, y: 2 }])).toBeUndefined()
    expect(normalizeEngineOffsets([{ x: 1 }, { x: 3, y: 4 }])).toBeUndefined()
  })
})

describe('adjustEntryToPair（sidecar 条目 → 引擎差值）', () => {
  test('缺失返回 undefined；存在时缺省字段补 0', () => {
    expect(adjustEntryToPair(undefined)).toBeUndefined()
    expect(adjustEntryToPair({ cx1: 1, cy1: 2 })).toEqual([
      { x: 1, y: 2 },
      { x: 0, y: 0 },
    ])
  })
})

describe('resolveLinkOffsets（恢复：逐节点按 uid 序解析差值）', () => {
  const pathByUid = new Map([
    ['u2', '/根/B'],
    ['u3', '/根/C'],
  ])

  test('sidecar 条目按路径对键回填到目标索引位，未拖弯位留空洞', () => {
    const res = resolveLinkOffsets(['u2', 'u3'], '/根/A', pathByUid, new Map(), {
      '/根/A->/根/C': { cx1: 5, cy1: 6, cx2: 7, cy2: 8 },
    })
    expect(res).toHaveLength(2)
    expect(res[0]).toBeUndefined()
    expect(res[1]).toEqual([
      { x: 5, y: 6 },
      { x: 7, y: 8 },
    ])
  })

  test('引擎现存差值优先于 sidecar（保存链重建不回退刚拖的弯）', () => {
    const res = resolveLinkOffsets(
      ['u2'],
      '/根/A',
      pathByUid,
      new Map([['u2', [{ x: 9, y: 9 }, { x: 9, y: 9 }]]]),
      { '/根/A->/根/B': { cx1: 1, cy1: 2, cx2: 3, cy2: 4 } },
    )
    expect(res[0]).toEqual([
      { x: 9, y: 9 },
      { x: 9, y: 9 },
    ])
  })

  test('目标 uid 失联不回填；无任何来源时全 undefined（调用方不写 offsets）', () => {
    expect(resolveLinkOffsets(['uX'], '/根/A', pathByUid, new Map(), {})).toEqual([undefined])
  })
})
