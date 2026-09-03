import { expect, test } from 'vitest'
import { parseLinks, resolveLinks, type MindLink } from './links'
import type { ZenNode } from '../types/tree'

const tree: ZenNode = {
  text: '根', children: [
    { text: 'A 见 [[B]]', children: [] },
    { text: 'B', children: [{ text: '子', children: [] }] },
    { text: 'C 见 [[无此名]]', children: [] },
  ],
}

test('parseLinks 提取所有双链：toPath 为括号内原文、from 为源节点全路径', () => {
  expect(parseLinks(tree)).toEqual([
    { from: '/根/A 见 [[B]]', toPath: 'B' },
    { from: '/根/C 见 [[无此名]]', toPath: '无此名' },
  ])
})

test('parseLinks 单节点多链与空括号', () => {
  const t: ZenNode = { text: '根', children: [{ text: '[[x]] 与 [[]] 与 [[/根/y]]', children: [{ text: 'y', children: [] }] }] }
  expect(parseLinks(t)).toEqual([
    { from: '/根/[[x]] 与 [[]] 与 [[/根/y]]', toPath: 'x' },
    { from: '/根/[[x]] 与 [[]] 与 [[/根/y]]', toPath: '/根/y' },
  ])
})

test('resolveLinks 唯一命中保留（归一为全路径）、零命中丢弃', () => {
  expect(resolveLinks(tree, parseLinks(tree))).toEqual([
    { fromPath: '/根/A 见 [[B]]', toPath: '/根/B' },
  ])
})

test('resolveLinks 多命中丢弃；/全路径 形式按路径命中', () => {
  const t2: ZenNode = {
    text: 'r', children: [
      { text: 'x [[dup]]', children: [] },
      { text: 'dup', children: [] },
      { text: 'dup', children: [] },
      { text: 'y [[/r/dup]]', children: [{ text: 'dup', children: [] }] },
    ],
  }
  expect(resolveLinks(t2, parseLinks(t2))).toEqual([
    { fromPath: '/r/y [[/r/dup]]', toPath: '/r/dup' },
  ])
})

// —— 同名节点消歧（2026-09-03 spec §3）：路径形式 #n 孪生序号，整串优先/钳位/源端序号 ——
describe('resolveLinks/parseLinks 孪生序号', () => {
  /** 孪生树：/r/S 两个（同父同名），x 与 y 为源节点 */
  const twinTree = (): ZenNode => ({
    text: 'r', children: [
      { text: 'x [[/r/S#2]] 与 [[/r/S#1]]', children: [] },
      { text: 'S', children: [] },
      { text: 'S', children: [] },
    ],
  })

  test('#n 命中：剥后缀取序号；#1 显式与省略等价（canonical 省略字段）', () => {
    expect(resolveLinks(twinTree(), parseLinks(twinTree()))).toEqual([
      { fromPath: '/r/x [[/r/S#2]] 与 [[/r/S#1]]', toPath: '/r/S', toOrdinal: 2 },
      { fromPath: '/r/x [[/r/S#2]] 与 [[/r/S#1]]', toPath: '/r/S' },
    ])
  })

  test('#0 归一为 1；越界钳到最近合法位（线不静默消失）', () => {
    const t: ZenNode = {
      text: 'r', children: [
        { text: 'a [[/r/S#0]]', children: [] },
        { text: 'S', children: [] },
        { text: 'S', children: [] },
        { text: 'b [[/r/S#5]]', children: [] },
      ],
    }
    expect(resolveLinks(t, parseLinks(t))).toEqual([
      { fromPath: '/r/a [[/r/S#0]]', toPath: '/r/S' },
      { fromPath: '/r/b [[/r/S#5]]', toPath: '/r/S', toOrdinal: 2 },
    ])
  })

  test('整串精确命中优先：节点文本本身含 #数字 时不剥后缀', () => {
    const t: ZenNode = {
      text: 'r', children: [
        { text: 'a [[/r/issue#3]]', children: [] },
        { text: 'issue#3', children: [] },
        { text: 'issue', children: [] },
        { text: 'issue', children: [] },
      ],
    }
    // '/r/issue#3' 整串即路径（文本 issue#3），命中它而非 '/r/issue'+序号 3
    expect(resolveLinks(t, parseLinks(t))).toEqual([
      { fromPath: '/r/a [[/r/issue#3]]', toPath: '/r/issue#3' },
    ])
  })

  test('裸名#n 不作序号解析：按名称字面查找（名称形式无序号）', () => {
    const t: ZenNode = {
      text: 'r', children: [
        { text: 'a [[dup#2]]', children: [] },
        { text: 'dup#2', children: [] },
        { text: 'dup', children: [] },
      ],
    }
    expect(resolveLinks(t, parseLinks(t))).toEqual([
      { fromPath: '/r/a [[dup#2]]', toPath: '/r/dup#2' },
    ])
  })

  test('parseLinks：同父同名孪生作源节点时填 fromOrdinal（文档序，1 省略）', () => {
    const t: ZenNode = {
      text: 'r', children: [
        { text: 'S [[x]]', children: [] },
        { text: 'S [[x]]', children: [] },
        { text: 'x', children: [] },
      ],
    }
    expect(parseLinks(t)).toEqual([
      { from: '/r/S [[x]]', toPath: 'x' },
      { from: '/r/S [[x]]', fromOrdinal: 2, toPath: 'x' },
    ])
  })

  test('resolveLinks：fromOrdinal 透传（手工 MindLink 直测，孪生源 + 孪生目标同链）', () => {
    const t: ZenNode = {
      text: 'r', children: [
        { text: 'S', children: [] },
        { text: 'S', children: [] },
        { text: 'T', children: [] },
        { text: 'T', children: [] },
      ],
    }
    const links: MindLink[] = [
      { from: '/r/S', toPath: '/r/T#2' },
      { from: '/r/S', fromOrdinal: 2, toPath: '/r/T#2' },
    ]
    expect(resolveLinks(t, links)).toEqual([
      { fromPath: '/r/S', toPath: '/r/T', toOrdinal: 2 },
      { fromPath: '/r/S', fromOrdinal: 2, toPath: '/r/T', toOrdinal: 2 },
    ])
  })
})
