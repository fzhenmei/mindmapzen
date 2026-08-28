import { describe, expect, test } from 'vitest'
import { layoutToEngine } from './layoutMap'

describe('layoutToEngine', () => {
  test('三种布局映射到引擎布局名且互不相同', () => {
    const names = ['mindmap', 'logic', 'org'].map((k) => layoutToEngine(k as never))
    expect(new Set(names).size).toBe(3)
  })
  test('非法值回退右向', () => {
    expect(layoutToEngine('bogus' as never)).toBe(layoutToEngine('mindmap'))
  })
})
