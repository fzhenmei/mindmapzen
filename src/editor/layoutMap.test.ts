import { describe, expect, test } from 'vitest'
import { layoutToEngine } from './layoutMap'

describe('layoutToEngine', () => {
  test('五种布局映射到引擎布局名且互不相同', () => {
    const names = ['mindmap', 'logic', 'org', 'timeline', 'fishbone'].map((k) => layoutToEngine(k as never))
    expect(new Set(names).size).toBe(5)
  })
  test('时间轴/鱼骨图映射引擎经典变体（不接 timeline2、右向鱼骨等变体）', () => {
    expect(layoutToEngine('timeline')).toBe('timeline')
    expect(layoutToEngine('fishbone')).toBe('fishbone')
  })
  test('非法值回退右向', () => {
    expect(layoutToEngine('bogus' as never)).toBe(layoutToEngine('mindmap'))
  })
})
