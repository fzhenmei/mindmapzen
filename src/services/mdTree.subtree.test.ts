import { describe, expect, test } from 'vitest'
import { findSubtreeByUid } from './mdTree'
import type { EngineNode } from '../types/engine'

const tree: EngineNode = {
  data: { text: 'r', uid: 'u0' },
  children: [
    { data: { text: 'a', uid: 'u1' }, children: [{ data: { text: 'a1', uid: 'u1-1' }, children: [] }] },
    { data: { text: 'b', uid: 'u2' }, children: [] },
  ],
}

describe('findSubtreeByUid', () => {
  test('命中根', () => {
    expect(findSubtreeByUid(tree, 'u0')).toBe(tree)
  })
  test('命中深层节点并返回子树', () => {
    const hit = findSubtreeByUid(tree, 'u1-1')
    expect(hit?.data.text).toBe('a1')
  })
  test('未命中返回 null', () => {
    expect(findSubtreeByUid(tree, 'nope')).toBeNull()
  })
})
