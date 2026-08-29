import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { expect, test, vi } from 'vitest'
import { computeNodeActionPos, useNodeActions } from './useNodeActions'
import type { MindMapHandle } from '../types/engine'

describe('computeNodeActionPos', () => {
  test('节点右下角外侧 6px，内容坐标 × 视图变换（scale/平移）', () => {
    const node = { left: 100, top: 50, width: 200, height: 100 }
    // left=(100+200)×1.5+10=460；top=(50+100)×1.5+20+6=251
    expect(computeNodeActionPos(node, { x: 10, y: 20, scale: 1.5 })).toEqual({ left: 460, top: 251 })
  })
  test('无视图参数按原点 1 倍缩放', () => {
    expect(computeNodeActionPos({ left: 10, top: 20, width: 30, height: 40 })).toEqual({ left: 40, top: 66 })
  })
  test('几何缺失/非有限数/空节点返回 null（未布局或假画布节点）', () => {
    expect(computeNodeActionPos(null)).toBeNull()
    expect(computeNodeActionPos({ left: 10, top: 20 })).toBeNull()
    expect(computeNodeActionPos({ left: 'x' as unknown, top: 0, width: 1, height: 1 })).toBeNull()
    expect(computeNodeActionPos({ left: NaN, top: 0, width: 1, height: 1 })).toBeNull()
  })
})

test('useNodeActions：选中出锚点，编辑/视图事件刷新，建线态隐藏，取消选中清空', () => {
  const node = { left: 10, top: 20, width: 30, height: 40 }
  const listeners = new Map<string, () => void>()
  const mm = {
    on: vi.fn((e: string, cb: () => void) => listeners.set(e, cb)),
    off: vi.fn(),
    renderer: { findNodeByUid: (uid: string) => (uid === 'u1' ? node : null) },
    view: { x: 0, y: 0, scale: 1 },
  } as unknown as MindMapHandle
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>

  const { result, rerender } = renderHook(({ uid }) => useNodeActions(mmRef, uid), {
    initialProps: { uid: null as string | null },
  })
  // 无选中：无锚点（不渲染浮动条）
  expect(result.current).toBeNull()
  // 选中 u1：锚定其右下角（10+30, 20+40+6）
  rerender({ uid: 'u1' })
  expect(result.current).toEqual({ left: 40, top: 66 })
  // 节点移动（data_change）：重算
  node.left = 100
  act(() => listeners.get('data_change')!())
  expect(result.current).toEqual({ left: 130, top: 66 })
  // 建线态：避让隐藏（node_active 刷新）
  ;(mm as { associativeLine?: unknown }).associativeLine = { isCreatingLine: true }
  act(() => listeners.get('node_active')!())
  expect(result.current).toBeNull()
  // 建线结束：恢复
  ;(mm as { associativeLine?: { isCreatingLine?: boolean } }).associativeLine!.isCreatingLine = false
  act(() => listeners.get('view_data_change')!())
  expect(result.current).toEqual({ left: 130, top: 66 })
  // 取消选中：清空并退订
  rerender({ uid: null })
  expect(result.current).toBeNull()
  expect(mm.off).toHaveBeenCalledTimes(4)
})
