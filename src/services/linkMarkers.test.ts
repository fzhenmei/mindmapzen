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
  test('空格收敛只在标记删除处（M5c 幂等修复）：无标记处的原有连续空格不动，无空白标记不补空格', () => {
    // 旧实现全局收敛 ` {2,}`→' '：'a  b' 挂线保存后文本变 'a  b [[A]]'，重开剥离变 'a b'——改写用户文本
    expect(stripMarkers('a  b [[A]]')).toBe('a  b')
    expect(stripMarkers('a[[A]]b')).toBe('ab')
    expect(stripMarkers('a [[A]][[B]] b')).toBe('a b')
  })
})

describe('injectMarkers', () => {
  test('句尾依次追加', () => {
    expect(injectMarkers('文本', ['A', 'B'])).toBe('文本 [[A]] [[B]]')
  })
  test('空目标原样；空文本首枚标记无前导空格（M5c 定点修复：旧 \' [[A]]\' 经序列化产出 \'#  [[A]]\'，parse 规范化吞空格 → 二次开-存 md 漂移）', () => {
    expect(injectMarkers('x', [])).toBe('x')
    expect(injectMarkers('', ['A'])).toBe('[[A]]')
    expect(injectMarkers('', ['A', 'B'])).toBe('[[A]] [[B]]')
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
