import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { expect, test, vi } from 'vitest'
import { nodeIconsOf, useIconPicker } from './useIconPicker'
import type { MindMapHandle } from '../types/engine'

test('nodeIconsOf：剥 zen_ 前缀还原用户图标，排除状态徽章 zen_status-（看板互保）', () => {
  const mm = {
    getData: () => ({ data: { text: 'n', uid: 'u1', icon: ['zen_status-doing', 'zen_flag', 42] }, children: [] }),
  } as unknown as MindMapHandle
  expect(nodeIconsOf(mm, 'u1')).toEqual(['flag'])
  expect(nodeIconsOf(mm, null)).toEqual([])
})

test('useIconPicker.apply：覆写用户图标保留现有状态徽章（徽章互保协议）', () => {
  const execCommandIcon = vi.fn()
  const mm = {
    getData: () => ({ data: { text: 'n', uid: 'u1', icon: ['zen_status-doing', 'zen_flag'] }, children: [] }),
    execCommandIcon,
  } as unknown as MindMapHandle
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>
  const uidRef = { current: 'u1' } as RefObject<string | null>
  const onDataChanged = vi.fn()

  const { result } = renderHook(() => useIconPicker(mmRef, uidRef, onDataChanged))
  act(() => result.current.openPicker('n', ['flag']))
  act(() => result.current.apply(['star'], []))
  // 落下数组 = 现有徽章（zen_status- 原样置前）+ 本次所选用户图标
  expect(execCommandIcon).toHaveBeenCalledWith('u1', ['zen_status-doing', 'zen_star'])
  expect(onDataChanged).toHaveBeenCalledTimes(1)
})

test('useIconPicker.apply：无徽章节点覆写为纯用户图标（既有行为不回归）', () => {
  const execCommandIcon = vi.fn()
  const mm = {
    getData: () => ({ data: { text: 'n', uid: 'u1', icon: ['zen_flag'] }, children: [] }),
    execCommandIcon,
  } as unknown as MindMapHandle
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>
  const uidRef = { current: 'u1' } as RefObject<string | null>

  const { result } = renderHook(() => useIconPicker(mmRef, uidRef, vi.fn()))
  act(() => result.current.openPicker('n', ['flag']))
  act(() => result.current.apply(['star'], []))
  expect(execCommandIcon).toHaveBeenCalledWith('u1', ['zen_star'])
})

test('useIconPicker.openPicker 显式 uid（看板桥接）：apply 落卡片节点而非画布选中；缺省仍取 uidRef', () => {
  // 看板卡片不是画布选中节点（Task 6 审查预警 A）：uidRef.current 是画布选中 u1，
  // 桥接传卡片 uid u2 —— apply 必须落 u2；不传 targetUid 时行为不变（落 u1）
  const execCommandIcon = vi.fn()
  const mm = {
    // 徽章读取路径的数据树（无 icon → 无徽章，断言只看落点 uid）
    getData: () => ({ data: { text: '根', uid: 'root' }, children: [] }),
    execCommandIcon,
  } as unknown as MindMapHandle
  const mmRef = { current: mm } as RefObject<MindMapHandle | null>
  const uidRef = { current: 'u1' } as RefObject<string | null>

  const { result } = renderHook(() => useIconPicker(mmRef, uidRef, vi.fn()))
  act(() => result.current.openPicker('卡片', [], 'u2'))
  act(() => result.current.apply(['star'], []))
  expect(execCommandIcon).toHaveBeenCalledWith('u2', ['zen_star'])
  execCommandIcon.mockClear()
  act(() => result.current.openPicker('画布选中', [])) // 缺省路径：快照画布选中 uid
  act(() => result.current.apply(['flag'], []))
  expect(execCommandIcon).toHaveBeenCalledWith('u1', ['zen_flag'])
})
