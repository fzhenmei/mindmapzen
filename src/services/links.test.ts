import { expect, test } from 'vitest'
import { parseLinks, resolveLinks } from './links'
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
