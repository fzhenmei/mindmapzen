// src/hooks/useActiveSelection.test.ts —— 多选镜像（圈选功能）：引擎 node_active 第二参为激活列表，
// 宿主镜像从单 uid 扩为 uids：activeUid 退化为「恰好单选」语义（下游浮条/复制范围自然让位），
// activeCount 驱动多选浮条。旧单选行为（uid 直通）保持不变。
import { act, renderHook } from '@testing-library/react'
import { expect, test } from 'vitest'
import { useActiveSelection } from './useActiveSelection'
import type { EngineNode } from '../types/engine'

/** 最小引擎树：根 r + 子 a（findSubtreeByUid 按 data.uid 命中） */
const root: EngineNode = {
  data: { text: 'r', uid: 'r' },
  children: [{ data: { text: 'a', uid: 'a' } }],
}

test('多选上报：activeUid 退化为 null（单节点语义让位），activeCount 计数，ref 同步', () => {
  const { result } = renderHook(() => useActiveSelection())
  act(() => result.current.handleActiveChange(['a', 'b', 'c']))
  expect(result.current.activeUid).toBeNull()
  expect(result.current.activeUidRef.current).toBeNull()
  expect(result.current.activeCount).toBe(3)
})

test('全量 uid 镜像：activeUidsRef 保存整批（画布贴图 forEach 用，不随单选语义退化）', () => {
  const { result } = renderHook(() => useActiveSelection())
  act(() => result.current.handleActiveChange(['a', 'b', 'c']))
  expect(result.current.activeUidsRef.current).toEqual(['a', 'b', 'c'])
  // 单选→多选→清选随批切换
  act(() => result.current.handleActiveChange(['a']))
  expect(result.current.activeUidsRef.current).toEqual(['a'])
  act(() => result.current.handleActiveChange([]))
  expect(result.current.activeUidsRef.current).toEqual([])
})

test('单选上报：activeUid 直通该 uid（现有下游行为不变）', () => {
  const { result } = renderHook(() => useActiveSelection())
  act(() => result.current.handleActiveChange(['a']))
  expect(result.current.activeUid).toBe('a')
  expect(result.current.activeUidRef.current).toBe('a')
  expect(result.current.activeCount).toBe(1)
})

test('空上报 = 取消选中：uid/count 全清', () => {
  const { result } = renderHook(() => useActiveSelection())
  act(() => result.current.handleActiveChange(['a', 'b']))
  act(() => result.current.handleActiveChange([]))
  expect(result.current.activeUid).toBeNull()
  expect(result.current.activeUidRef.current).toBeNull()
  expect(result.current.activeCount).toBe(0)
})

test('状态迁移：多选 → 单选 → 多选，uid 与 count 随批切换', () => {
  const { result } = renderHook(() => useActiveSelection())
  act(() => result.current.handleActiveChange(['a', 'b']))
  expect(result.current.activeUid).toBeNull()
  act(() => result.current.handleActiveChange(['a']))
  expect(result.current.activeUid).toBe('a')
  act(() => result.current.handleActiveChange(['a', 'b', 'c']))
  expect(result.current.activeUid).toBeNull()
  expect(result.current.activeCount).toBe(3)
})

test('clearStaleIfMissing：单选 uid 已不在树中（如撤销删除）→ 清 uid 并归零计数', () => {
  const { result } = renderHook(() => useActiveSelection())
  act(() => result.current.handleActiveChange(['gone']))
  act(() => result.current.clearStaleIfMissing(root))
  expect(result.current.activeUid).toBeNull()
  expect(result.current.activeUidRef.current).toBeNull()
  expect(result.current.activeCount).toBe(0)
})

test('clearStaleIfMissing：单选 uid 仍命中树中 → 保留', () => {
  const { result } = renderHook(() => useActiveSelection())
  act(() => result.current.handleActiveChange(['a']))
  act(() => result.current.clearStaleIfMissing(root))
  expect(result.current.activeUid).toBe('a')
  expect(result.current.activeCount).toBe(1)
})

test('clearStaleIfMissing：多选态（activeUid 为 null）不动作', () => {
  const { result } = renderHook(() => useActiveSelection())
  act(() => result.current.handleActiveChange(['a', 'gone']))
  act(() => result.current.clearStaleIfMissing(root))
  expect(result.current.activeCount).toBe(2)
})
