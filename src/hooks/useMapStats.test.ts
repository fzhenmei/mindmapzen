import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useMapStats } from './useMapStats'
import type { EngineNode } from '../types/engine'

const tree = (children: EngineNode[] = []): EngineNode => ({ data: { text: '根', uid: 'r' }, children })

// 统计行数据源（2026-09）：节点计数（data_change 携带快照时重数；无载荷调用不计数）
// 与最后保存时间（markSaved 落时间戳）；无参纯状态 hook（管线透传由 EditorView 组合）
describe('useMapStats', () => {
  afterEach(cleanup)

  test('onDataChange：携带快照时更新节点计数', () => {
    const { result } = renderHook(() => useMapStats())
    expect(result.current.nodeCount).toBe(0)
    act(() => result.current.onDataChange(tree([tree(), tree([tree()])])))
    expect(result.current.nodeCount).toBe(4)
  })

  test('无载荷上报（展开命令）不改计数', () => {
    const { result } = renderHook(() => useMapStats())
    act(() => result.current.onDataChange(tree([tree()])))
    act(() => result.current.onDataChange(undefined))
    expect(result.current.nodeCount).toBe(2)
  })

  test('markSaved：置保存时刻（毫秒时间戳）', () => {
    const { result } = renderHook(() => useMapStats())
    expect(result.current.savedAt).toBeNull()
    act(() => result.current.markSaved())
    expect(result.current.savedAt).not.toBeNull()
  })

  test('initSavedAt：打开文档以文件 mtime 为初值（干净图不显示「未保存」歧义）', () => {
    const { result } = renderHook(() => useMapStats())
    const mtime = 1756700000000
    act(() => result.current.initSavedAt(mtime))
    expect(result.current.savedAt).toBe(mtime)
  })
})
