import { describe, expect, test } from 'vitest'
import { extractTargets, injectMarkers, stripMarkers } from './linkMarkers'
import { parseLinks } from './links'
import type { ZenNode } from '../types/tree'

describe('stripMarkers', () => {
  test('句中标记整段删除并收敛空格', () => {
    expect(stripMarkers('见 [[A]] 和 [[B]]')).toBe('见 和')
  })
  test('句尾标记剥后 trimEnd', () => {
    expect(stripMarkers('文本 [[A]]')).toBe('文本')
  })
  test('无标记原样；全标记成空串', () => {
    expect(stripMarkers('普通文本')).toBe('普通文本')
    expect(stripMarkers('[[A]]')).toBe('')
  })
  test('标记删除遗留双空格收敛为单空格（含首尾 trim）', () => {
    expect(stripMarkers('a  [[A]]  b')).toBe('a b')
    expect(stripMarkers('[[A]] 文本')).toBe('文本')
  })
  test('空括号 [[]] 与非法内层括号原样保留（非双链口径）', () => {
    expect(stripMarkers('a [[]] b')).toBe('a [[]] b')
    expect(stripMarkers('a [[x[y]] b')).toBe('a [[x[y]] b')
  })
  test('无标记文本原样返回（含连续/首尾空格）：空格收敛只发生在标记删除后，不触发改写', () => {
    expect(stripMarkers('a  b')).toBe('a  b')
    expect(stripMarkers('  普通文本  ')).toBe('  普通文本  ')
  })
})

describe('injectMarkers', () => {
  test('句尾依次追加', () => {
    expect(injectMarkers('文本', ['A', 'B'])).toBe('文本 [[A]] [[B]]')
  })
  test('空目标原样；空文本只留标记（"句尾追加"字面语义：\'\' + \' [[A]]\'，不 trim）', () => {
    expect(injectMarkers('x', [])).toBe('x')
    expect(injectMarkers('', ['A'])).toBe(' [[A]]')
  })
})

describe('extractTargets', () => {
  test('与 parseLinks 同口径', () => {
    expect(extractTargets('a [[x]] [[]] b [[/r/y]]')).toEqual(['x', '/r/y'])
  })
  test('与 parseLinks 在树文本上逐节点一致（单口径回归锁）', () => {
    const texts = ['A 见 [[B]]', '[[x]] 与 [[]] 与 [[/根/y]]', '无标记', '[[dup]] [[dup]]']
    const tree: ZenNode = {
      text: texts[0],
      children: texts.slice(1).map((t) => ({ text: t, children: [] })),
    }
    expect(texts.flatMap(extractTargets)).toEqual(parseLinks(tree).map((l) => l.toPath))
    expect(extractTargets('[[dup]] [[dup]]')).toEqual(['dup', 'dup']) // 提取不去重（去重归注册表/注入层）
  })
})
